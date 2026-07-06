import crypto from 'crypto';
import { adminDb } from '@/lib/firebaseAdmin';
import { decrypt } from '@/lib/encrypt';
import { Workspace, Lead } from '@/types';

export interface MetaVerifyResult {
  ok: boolean;
  message: string;
  eventsReceived?: number;
  errorCode?: number;
}

/**
 * Verifies a Meta CAPI Pixel ID + access token by sending a real test event to
 * the /events endpoint — the exact capability the token is used for. This catches
 * invalid/expired tokens (code 190), missing CAPI permission, and wrong pixel IDs
 * that a GET /{pixel_id} read check would miss or false-alarm on (#100).
 *
 * If testEventCode is provided, the event is routed to Events Manager → Test Events
 * only (zero production data). Otherwise one synthetic event is sent to the pixel.
 */
export async function sendMetaTestEvent(
  pixelId: string,
  accessToken: string,
  testEventCode?: string
): Promise<MetaVerifyResult> {
  if (!pixelId || !accessToken) {
    return { ok: false, message: 'Pixel ID and access token are required.' };
  }

  // Synthetic, clearly-test user data (hashed per Meta spec).
  const sha256 = (v: string) =>
    crypto.createHash('sha256').update(v.trim().toLowerCase()).digest('hex');

  const payload: any = {
    data: [
      {
        event_name: 'Lead',
        event_time: Math.floor(Date.now() / 1000),
        action_source: 'system_generated',
        user_data: {
          em: [sha256('capi-connection-test@mojoinsights.internal')],
        },
      },
    ],
  };
  if (testEventCode) payload.test_event_code = testEventCode;

  try {
    const url = `https://graph.facebook.com/v18.0/${pixelId}/events?access_token=${accessToken}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await res.json();

    if (res.ok && !result.error && (result.events_received ?? 0) >= 1) {
      return {
        ok: true,
        message: testEventCode
          ? `Verified — test event received in Events Manager (code ${testEventCode}).`
          : 'Verified — Meta accepted a live CAPI test event.',
        eventsReceived: result.events_received,
      };
    }

    const err = result.error || {};
    const code = err.code;
    let message = err.message || 'Meta rejected the test event.';
    if (code === 190) message = 'Access token is invalid or expired. Generate a new CAPI token.';
    else if (code === 200 || code === 10) message = 'Token lacks Conversions API permission for this pixel.';
    else if (code === 803 || /Unknown path components/i.test(message)) message = 'Pixel ID not found or incorrect.';

    return { ok: false, message, errorCode: code };
  } catch (e: any) {
    return { ok: false, message: e.message || 'Network error contacting Meta.' };
  }
}

/**
 * Sends a server-side conversion event to Meta Conversions API (CAPI) v18.0.
 * Decrypts the access token just before transmission and updates the Firestore lead document.
 */
export async function sendMetaEvent(
  workspace: Workspace,
  lead: Lead,
  eventName: string
): Promise<{ success: boolean; error?: string }> {
  console.log(`[Meta CAPI] Dispatching event: ${eventName} for Lead: ${lead.id} (${workspace.slug})`);

  const pixelId = workspace.meta_pixel_id;
  const encryptedToken = workspace.meta_access_token;

  if (!pixelId || !encryptedToken) {
    const warnMsg = 'Skipped Meta event: Meta Pixel ID or Access Token is unconfigured.';
    console.warn(`[Meta CAPI] ${warnMsg}`);
    return { success: false, error: warnMsg };
  }

  // Decrypt token just-in-time
  const token = decrypt(encryptedToken);

  try {
    const url = `https://graph.facebook.com/v18.0/${pixelId}/events?access_token=${token}`;

    const payload = {
      data: [
        {
          event_name: eventName,
          event_time: Math.floor(Date.now() / 1000),
          action_source: 'system_generated',
          user_data: {
            em: lead.email_sha256 ? [lead.email_sha256] : [],
            ph: lead.phone_sha256 ? [lead.phone_sha256] : [],
            client_ip_address: lead.client_ip || '127.0.0.1',
            client_user_agent: lead.user_agent || 'Mozilla/5.0',
            fbc: lead._fbc || '',
            fbp: lead._fbp || '',
          },
          custom_data: {
            lead_id: lead.id,
            lead_status: lead.lead_status,
            source_crm: lead.source_crm || 'custom',
          },
          event_source_url: lead.page_url || '',
        },
      ],
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (response.ok && !result.error) {
      console.log(`[Meta CAPI] Successfully sent ${eventName} event. Result:`, result);

      // Update lead document in Firestore with fired attributes
      try {
        const leadRef = adminDb
          .collection('workspaces')
          .doc(workspace.id)
          .collection('leads')
          .doc(lead.id);

        await leadRef.update({
          meta_event_fired: eventName,
          last_fired_at: new Date(),
          updated_at: new Date(),
        });
      } catch (dbErr) {
        console.error('[Meta CAPI] Lead status update in Firestore failed:', dbErr.message);
      }

      return { success: true };
    } else {
      const errDetail = result.error?.message || JSON.stringify(result);
      console.error(`[Meta CAPI] Graph API returned error:`, errDetail);
      return { success: false, error: errDetail };
    }
  } catch (error: any) {
    console.error(`[Meta CAPI] Network or client request failure:`, error);
    return { success: false, error: error.message };
  }
}
