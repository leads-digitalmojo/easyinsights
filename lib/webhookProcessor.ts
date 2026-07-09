import * as admin from 'firebase-admin';
import { adminDb } from '@/lib/firebaseAdmin';
import { hashEmail, hashPhone } from '@/lib/hash';
import { getEIEventName } from '@/lib/statusMap';
import { sendMetaEvent } from '@/lib/meta';
import { sendGoogleEvent } from '@/lib/google';

/**
 * Shared logic to upsert webhook leads, perform PII hashing, 
 * run transition verification, fire events and increment reporting collections.
 */
export async function processWebhookLead(workspace: any, payload: any) {
  const {
    external_id,
    name,
    email,
    phone,
    lead_status = 'new',
    page_url = '',
    referrer = '',
    user_agent = '',
    _ga = '',
    _gcl_aw = '',
    _fbc = '',
    _fbp = '',
    _ei_sid = '',
    cookie_str = '',
  } = payload;

  if (!external_id) {
    throw new Error('Missing external_id in webhook payload');
  }

  const leadsColl = adminDb
    .collection('workspaces')
    .doc(workspace.id)
    .collection('leads');

  const leadQuery = await leadsColl
    .where('external_id', '==', external_id.toString())
    .limit(1)
    .get();

  const emailSha = hashEmail(email || '');
  const phoneSha = hashPhone(phone || '');

  const conversionsColl = adminDb
    .collection('workspaces')
    .doc(workspace.id)
    .collection('conversions');

  const platforms = ['meta', 'google'];

  if (!leadQuery.empty) {
    // Existing Lead
    const leadDoc = leadQuery.docs[0]!;
    const lead = leadDoc.data();
    const oldStatus = lead.lead_status;

    if (oldStatus !== lead_status) {
      const eventName = getEIEventName(lead_status, workspace.custom_event_map);
      if (eventName) {
        // Fire events first so the history entry records the real outcome.
        const updatedLead = {
          ...lead,
          lead_status,
          email: email || lead.email,
          phone: phone || lead.phone,
          email_sha256: emailSha || lead.email_sha256,
          phone_sha256: phoneSha || lead.phone_sha256,
        };
        const [metaResult, googleResult] = await Promise.all([
          sendMetaEvent(workspace, updatedLead, eventName),
          sendGoogleEvent(workspace, updatedLead, eventName),
        ]);

        const updatedHistory = [
          ...(lead.status_history || []),
          {
            status: lead_status,
            changed_at: Date.now(),
            source: 'webhook',
            ei_event_fired: eventName,
            meta_success: metaResult.success,
            google_success: googleResult.success,
          },
        ];

        const updatedData: Record<string, any> = {
          lead_status,
          status_history: updatedHistory,
          email: email || lead.email,
          phone: phone || lead.phone,
          email_sha256: emailSha || lead.email_sha256,
          phone_sha256: phoneSha || lead.phone_sha256,
          meta_event_fired: metaResult.success ? eventName : (lead.meta_event_fired || ''),
          google_event_fired: googleResult.success ? eventName : (lead.google_event_fired || ''),
          last_fired_at: new Date(),
          updated_at: new Date(),
        };

        await leadDoc.ref.update(updatedData);

        const firedPlatforms = [
          ...(metaResult.success ? ['meta'] : []),
          ...(googleResult.success ? ['google'] : []),
        ];

        for (const platform of firedPlatforms) {
          const convQuery = await conversionsColl
            .where('event_name', '==', eventName)
            .where('platform', '==', platform)
            .limit(1)
            .get();

          if (!convQuery.empty) {
            await convQuery.docs[0]!.ref.update({
              count: admin.firestore.FieldValue.increment(1),
              last_fired_at: new Date(),
            });
          } else {
            const convId = conversionsColl.doc().id;
            await conversionsColl.doc(convId).set({
              id: convId,
              name: eventName,
              platform,
              account_name: platform === 'meta' ? 'Meta Pixel Account' : 'Google Ads Account',
              event_name: eventName,
              count: 1,
              last_fired_at: new Date(),
              created_at: new Date(),
            });
          }
        }
      }
    }
    return { success: true, action: 'update', id: leadDoc.id };
  } else {
    // New Lead Ingestion
    const leadId = leadsColl.doc().id;
    const eventName = getEIEventName(lead_status, workspace.custom_event_map) || 'Lead';

    const newLead = {
      id: leadId,
      workspace_id: workspace.id,
      source_crm: payload.source_crm || 'custom',
      external_id: external_id.toString(),
      name: name || 'Lead',
      email: email || '',
      phone: phone || '',
      email_sha256: emailSha,
      phone_sha256: phoneSha,
      lead_status,
      status_history: [] as any[],
      page_url,
      referrer,
      user_agent,
      _ga,
      _gcl_aw,
      _fbc,
      _fbp,
      _ei_sid,
      cookie_str,
      created_at: new Date(),
      updated_at: new Date(),
      raw_payload: payload,
    };

    await leadsColl.doc(leadId).set(newLead);

    const [metaResult, googleResult] = await Promise.all([
      sendMetaEvent(workspace, newLead, eventName),
      sendGoogleEvent(workspace, newLead, eventName),
    ]);

    // Record the real per-platform outcome in the lead's history
    await leadsColl.doc(leadId).update({
      meta_event_fired: metaResult.success ? eventName : '',
      google_event_fired: googleResult.success ? eventName : '',
      last_fired_at: new Date(),
      status_history: [
        {
          status: lead_status,
          changed_at: Date.now(),
          source: 'webhook',
          ei_event_fired: eventName,
          meta_success: metaResult.success,
          google_success: googleResult.success,
        },
      ],
    });

    const firedPlatforms = [
      ...(metaResult.success ? ['meta'] : []),
      ...(googleResult.success ? ['google'] : []),
    ];

    for (const platform of firedPlatforms) {
      const convQuery = await conversionsColl
        .where('event_name', '==', eventName)
        .where('platform', '==', platform)
        .limit(1)
        .get();

      if (!convQuery.empty) {
        await convQuery.docs[0]!.ref.update({
          count: admin.firestore.FieldValue.increment(1),
          last_fired_at: new Date(),
        });
      } else {
        const convId = conversionsColl.doc().id;
        await conversionsColl.doc(convId).set({
          id: convId,
          name: eventName,
          platform,
          account_name: platform === 'meta' ? 'Meta Pixel Account' : 'Google Ads Account',
          event_name: eventName,
          count: 1,
          last_fired_at: new Date(),
          created_at: new Date(),
        });
      }
    }
    return { success: true, action: 'create', id: leadId };
  }
}
