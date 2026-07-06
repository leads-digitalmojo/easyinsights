import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import * as admin from 'firebase-admin';
import { processWebhookLead } from '@/lib/webhookProcessor';
import { getWorkspaceBySlug } from '@/lib/getWorkspace';
import { normalizeStage } from '@/lib/stageNormalize';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-webhook-secret, webhook-secret',
};

// Handle CORS preflight sent by browser-based "Test Connection" buttons
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(
  request: Request,
  { params }: { params: { workspaceSlug: string } }
) {
  console.log(`[Webhook Custom] Received POST for workspace: ${params.workspaceSlug}`);
  try {
    const workspace = await getWorkspaceBySlug(params.workspaceSlug);
    if (!workspace) {
      console.error(`[Webhook Custom] Workspace '${params.workspaceSlug}' not found.`);
      return NextResponse.json({ success: false, error: 'Workspace not found' }, { status: 200, headers: CORS_HEADERS });
    }

    const searchParams = new URL(request.url).searchParams;
    const querySecret = searchParams.get('secret');
    const headerSecret = request.headers.get('x-webhook-secret') || request.headers.get('webhook-secret');
    
    let body: any = {};
    try {
      body = await request.json();
    } catch (e) {
      console.error('[Webhook Custom] Failed to parse body JSON:', e);
    }

    const bodySecret = body.webhook_secret;
    const providedSecret = querySecret || headerSecret || bodySecret;

    if (!providedSecret || providedSecret !== workspace.webhook_secret) {
      console.error(`[Webhook Custom] Invalid webhook secret. Provided: '${providedSecret}', Expected: '${workspace.webhook_secret}'`);
      return NextResponse.json({ success: false, error: 'Unauthorized secret validation' }, { status: 200, headers: CORS_HEADERS });
    }

    // Numeric stage codes sent by the custom CRM → internal status names
    const CRM_STAGE_MAP: Record<string, string> = {
      '16':   'new',
      '0':    'junk',
      '0.5':  'failed',
      '19':   'interested',
      '18':   'in_call_center',
      '20':   'visit_done',
      '20.5': 'final_negotiation',
      '10':   'claimed',
    };

    const normalizeCrmStage = (raw: any): string =>
      normalizeStage(raw, CRM_STAGE_MAP, workspace.custom_stage_map);

    // Normalize CRM nested format { event, data: { id, stage, ... } }
    // into the flat format processWebhookLead expects.
    let payload: any;
    if (body.event && body.data) {
      const d = body.data;
      const rawStage =
        body.event === 'lead.status_changed'
          ? (d.newStage ?? d.stage ?? 'new')
          : (d.stage ?? 'new');
      const lead_status = normalizeCrmStage(rawStage);

      payload = {
        external_id: d.id,
        name: d.name ?? d.leadName ?? 'Lead',
        email: d.email ?? '',
        phone: d.phone ?? '',
        lead_status,
        source_crm: d.source ?? body.source_crm ?? 'custom',
        page_url: d.page_url ?? '',
        referrer: d.referrer ?? '',
        user_agent: d.user_agent ?? '',
        _ga: d._ga ?? '',
        _gcl_aw: d._gcl_aw ?? '',
        _fbc: d._fbc ?? '',
        _fbp: d._fbp ?? '',
        _ei_sid: d._ei_sid ?? '',
        cookie_str: d.cookie_str ?? '',
      };
    } else {
      payload = {
        ...body,
        source_crm: body.source_crm || 'custom',
      };
    }

    // Persist incoming payload for history and retry capabilities
    try {
      const payloadId = adminDb
        .collection('workspaces')
        .doc(workspace.id)
        .collection('webhook_payloads')
        .doc().id;

      const payloadDoc = {
        id: payloadId,
        received_at: new Date(),
        status: 'received',
        attempt_count: 0,
        source: payload.source_crm || 'custom',
        raw_body: payload,
      };

      await adminDb
        .collection('workspaces')
        .doc(workspace.id)
        .collection('webhook_payloads')
        .doc(payloadId)
        .set(payloadDoc);

      // Process the webhook and update payload status
      const result = await processWebhookLead(workspace, payload);

      await adminDb
        .collection('workspaces')
        .doc(workspace.id)
        .collection('webhook_payloads')
        .doc(payloadId)
        .update({
          status: result.success ? 'processed' : 'failed',
          last_attempted_at: new Date(),
          last_result: result,
          attempt_count: admin.firestore.FieldValue.increment(1),
        });

      // If processing failed, create a workspace notification for UI visibility
      if (!result.success) {
        try {
          const noteId = adminDb
            .collection('workspaces')
            .doc(workspace.id)
            .collection('notifications')
            .doc().id;

          await adminDb
            .collection('workspaces')
            .doc(workspace.id)
            .collection('notifications')
            .doc(noteId)
            .set({
              id: noteId,
              type: 'webhook_failure',
              message: `Webhook processing failed for payload ${payloadId}`,
              details: result,
              read: false,
              created_at: new Date(),
            });
        } catch (noteErr) {
          console.warn('[Webhook Custom] failed to create notification:', noteErr);
        }
      }

      return NextResponse.json(result, { status: 200, headers: CORS_HEADERS });
    } catch (procErr: any) {
      console.error('[Webhook Custom] Error persisting or processing webhook payload:', procErr);
      return NextResponse.json({ success: false, error: procErr.message }, { status: 200, headers: CORS_HEADERS });
    }
  } catch (error: any) {
    console.error('[Webhook Custom] Webhook processing exception:', error);
    // Return 200 even on error as requested in the rules
    return NextResponse.json({ success: false, error: error.message }, { status: 200, headers: CORS_HEADERS });
  }
}
