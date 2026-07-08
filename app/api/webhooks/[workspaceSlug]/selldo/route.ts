import { NextResponse } from 'next/server';
import { processWebhookLead } from '@/lib/webhookProcessor';
import { getWorkspaceBySlug } from '@/lib/getWorkspace';
import { normalizeStage } from '@/lib/stageNormalize';

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
    console.error('[Webhook Sell.do] RAW PAYLOAD DEBUG:', rawText.slice(0, 2000));

    const bodySecret = body.webhook_secret;
    const providedSecret = querySecret || headerSecret || bodySecret;

    if (!providedSecret || providedSecret !== workspace.webhook_secret) {
      console.error(`[Webhook Sell.do] Invalid secret.`);
      return NextResponse.json({ success: false, error: 'Unauthorized secret' }, { status: 200, headers: CORS_HEADERS });
    }

    // Sell.do sends either:
    // 1. Nested: { event: "lead.created"|"lead.stage_changed", data: { id, name, email, phone/mobile, stage } }
    // 2. Flat:   { id, name, email, phone, stage, ... }
    let leadObj: any;
    let rawStage: any;

    if (body.data && (body.event || body.event_type)) {
      leadObj = body.data;
      rawStage = leadObj.new_stage ?? leadObj.stage ?? leadObj.current_stage ?? 'fresh';
    } else {
      leadObj = body;
      rawStage = leadObj.stage ?? leadObj.status ?? leadObj.current_stage ?? 'fresh';
    }

    const external_id =
      leadObj.id ?? leadObj.lead_id ?? leadObj.selldo_id ?? `selldo_${Date.now()}`;
    const name =
      leadObj.lead_name ??
      leadObj.full_name ??
      leadObj.name ??
      leadObj.contact_name ??
      (`${leadObj.first_name ?? ''} ${leadObj.last_name ?? ''}`.trim() || 'Sell.do Lead');
    const email =
      leadObj.lead_email ??
      leadObj.email ??
      leadObj.email_address ?? '';
    const phone =
      leadObj.lead_phone ??
      leadObj.lead_mobile ??
      leadObj.phone ??
      leadObj.mobile ??
      leadObj.phone_number ??
      leadObj.mobile_number ??
      leadObj.contact_number ?? '';

    const normalizedPayload = {
      external_id: String(external_id),
      name,
      email,
      phone,
      lead_status: normalizeSelldoStage(rawStage, workspace.custom_stage_map),
      source_crm: 'selldo',
      page_url: leadObj.page_url ?? leadObj.landing_page ?? '',
      _gcl_aw: leadObj.gclid ?? leadObj._gcl_aw ?? '',
      _fbc: leadObj.fbclid ?? leadObj._fbc ?? '',
      _fbp: leadObj._fbp ?? '',
    };

    console.log(`[Webhook Sell.do] Normalized → external_id:${normalizedPayload.external_id} status:${normalizedPayload.lead_status}`);

    const result = await processWebhookLead(workspace, normalizedPayload);
    return NextResponse.json(result, { status: 200, headers: CORS_HEADERS });
  } catch (error: any) {
    console.error('[Webhook Sell.do] Exception:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 200, headers: CORS_HEADERS });
  }
}
