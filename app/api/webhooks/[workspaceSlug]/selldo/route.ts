import { NextResponse } from 'next/server';
import { processWebhookLead } from '@/lib/webhookProcessor';
import { getWorkspaceBySlug } from '@/lib/getWorkspace';
import { normalizeStage } from '@/lib/stageNormalize';
import { adminDb } from '@/lib/firebaseAdmin';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-webhook-secret, webhook-secret',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

// Sell.do stage names → internal status names
const SELLDO_STAGE_MAP: Record<string, string> = {
  'fresh': 'new', 'new': 'new', 'untouched': 'new',
  'attempted': 'new', 'callback': 'new',
  'connected': 'interested', 'interested': 'interested', 'qualified': 'interested',
  'follow up': 'interested', 'followup': 'interested', 'prospect': 'interested',
  'site visit scheduled': 'in_call_center', 'visit scheduled': 'in_call_center',
  'meeting fixed': 'in_call_center', 'meeting scheduled': 'in_call_center',
  'site visit done': 'visit_done', 'visit done': 'visit_done',
  'meeting done': 'visit_done', 'visited': 'visit_done',
  'negotiation': 'final_negotiation', 'final negotiation': 'final_negotiation',
  'under negotiation': 'final_negotiation', 'negotiating': 'final_negotiation',
  'booking done': 'booking_done', 'booked': 'booking_done', 'token done': 'booking_done',
  'converted': 'converted', 'won': 'converted',
  'not interested': 'junk', 'dead': 'junk', 'junk': 'junk',
  'invalid number': 'junk', 'wrong number': 'junk',
  'lost': 'failed', 'dropped': 'failed', 'cancelled': 'failed',
};

const normalizeSelldoStage = (raw: any, customMap: Record<string, string> = {}): string =>
  normalizeStage(raw, SELLDO_STAGE_MAP, customMap);

export async function POST(
  request: Request,
  { params }: { params: { workspaceSlug: string } }
) {
  console.log(`[Webhook Sell.do] Received POST for workspace: ${params.workspaceSlug}`);
  try {
    const workspace = await getWorkspaceBySlug(params.workspaceSlug);
    if (!workspace) {
      return NextResponse.json({ success: false, error: 'Workspace not found' }, { status: 200, headers: CORS_HEADERS });
    }

    const searchParams = new URL(request.url).searchParams;
    const querySecret = searchParams.get('secret');
    const headerSecret = request.headers.get('x-webhook-secret') || request.headers.get('webhook-secret');

    let body: any = {};
    let rawText = '';
    try {
      rawText = await request.text();
      body = JSON.parse(rawText);
    } catch (e) {
      console.error('[Webhook Sell.do] Failed to parse body JSON:', e);
    }
    // Store raw payload in Firestore for inspection — remove once field names are confirmed
    try {
      await adminDb.collection('_debug_selldo').add({
        workspace: params.workspaceSlug,
        raw: rawText.slice(0, 5000),
        parsed: body,
        received_at: new Date(),
      });
    } catch {}
    console.error('[Webhook Sell.do] RAW PAYLOAD DEBUG:', rawText.slice(0, 2000));

    const bodySecret = body.webhook_secret;
    const providedSecret = querySecret || headerSecret || bodySecret;

    if (!providedSecret || providedSecret !== workspace.webhook_secret) {
      console.error(`[Webhook Sell.do] Invalid secret.`);
      return NextResponse.json({ success: false, error: 'Unauthorized secret' }, { status: 200, headers: CORS_HEADERS });
    }

    // Sell.do payload structure:
    // { lead_id, event, lead: { first_name, last_name, phone, email }, payload: { first_name, last_name, primary_phone, primary_email, stage_name } }
    const leadData = body.lead ?? {};
    const payloadData = body.payload ?? {};

    const external_id =
      body.lead_id ?? body.id ?? `selldo_${Date.now()}`;

    // Sanitize: strip Sell.do template literals and placeholder values
    const clean = (v: any, ...bad: string[]) => {
      if (!v || typeof v !== 'string') return '';
      const t = v.trim();
      if (bad.includes(t.toLowerCase()) || t.startsWith('$')) return '';
      return t;
    };

    const firstName = clean(leadData.first_name ?? payloadData.first_name);
    const lastName  = clean(leadData.last_name  ?? payloadData.last_name, 'last_name');
    const name = `${firstName} ${lastName}`.trim() || 'Sell.do Lead';

    const email = clean(leadData.email ?? payloadData.primary_email, 'test_email', 'email');

    const phone = clean(
      leadData.phone ?? leadData.mobile ?? payloadData.primary_phone ?? payloadData.primary_mobile,
      'n/a', 'na', 'nil', 'none'
    );

    const rawStage =
      payloadData.stage_name ?? leadData.stage ?? body.stage ?? 'fresh';

    const normalizedPayload = {
      external_id: String(external_id),
      name,
      email,
      phone,
      lead_status: normalizeSelldoStage(rawStage, workspace.custom_stage_map),
      source_crm: 'selldo',
      page_url: payloadData.page_url ?? leadData.page_url ?? body.page_url ?? '',
      _gcl_aw: payloadData.gclid ?? body.gclid ?? payloadData._gcl_aw ?? '',
      _fbc: payloadData.fbclid ?? body.fbclid ?? payloadData._fbc ?? '',
      _fbp: payloadData._fbp ?? body._fbp ?? '',
    };

    console.log(`[Webhook Sell.do] Normalized → external_id:${normalizedPayload.external_id} status:${normalizedPayload.lead_status}`);

    const result = await processWebhookLead(workspace, normalizedPayload);
    return NextResponse.json(result, { status: 200, headers: CORS_HEADERS });
  } catch (error: any) {
    console.error('[Webhook Sell.do] Exception:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 200, headers: CORS_HEADERS });
  }
}
