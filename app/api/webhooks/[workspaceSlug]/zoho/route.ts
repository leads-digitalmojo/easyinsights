import { NextResponse } from 'next/server';
import { processWebhookLead } from '@/lib/webhookProcessor';
import { getWorkspaceBySlug } from '@/lib/getWorkspace';
import { normalizeStage } from '@/lib/stageNormalize';

export async function POST(
  request: Request,
  { params }: { params: { workspaceSlug: string } }
) {
  console.log(`[Webhook Zoho] Received Zoho POST for workspace: ${params.workspaceSlug}`);
  try {
    const workspace = await getWorkspaceBySlug(params.workspaceSlug);
    if (!workspace) {
      console.error(`[Webhook Zoho] Workspace not found.`);
      return NextResponse.json({ success: false, error: 'Workspace not found' }, { status: 200 });
    }

    const searchParams = new URL(request.url).searchParams;
    const querySecret = searchParams.get('secret');
    const headerSecret = request.headers.get('x-webhook-secret') || request.headers.get('webhook-secret');
    
    let body: any = {};
    try {
      body = await request.json();
    } catch (e) {
      console.error('[Webhook Zoho] Failed to parse body JSON:', e);
    }

    const bodySecret = body.webhook_secret;
    const providedSecret = querySecret || headerSecret || bodySecret;

    if (!providedSecret || providedSecret !== workspace.webhook_secret) {
      console.error(`[Webhook Zoho] Invalid secret.`);
      return NextResponse.json({ success: false, error: 'Unauthorized secret' }, { status: 200 });
    }

    const ZOHO_STAGE_MAP: Record<string, string> = {
      'not contacted': 'new', 'attempted to contact': 'new', 'new': 'new',
      'contacted': 'interested', 'contact in future': 'interested',
      'pre-qualified': 'interested', 'qualified': 'interested',
      'interested': 'interested', 'follow up': 'interested',
      'site visit scheduled': 'in_call_center', 'in call center': 'in_call_center',
      'site visit done': 'visit_done', 'visit done': 'visit_done',
      'negotiation': 'final_negotiation', 'final negotiation': 'final_negotiation',
      'booking done': 'booking_done', 'won': 'booking_done',
      'converted': 'converted', 'closed - converted': 'converted',
      'junk lead': 'junk', 'not qualified': 'junk', 'spam': 'junk',
      'lost lead': 'failed', 'not interested': 'failed', 'lost': 'failed',
      'closed - not converted': 'failed', 'dead': 'junk',
    };

    const normalizeZohoStage = (raw: any): string =>
      normalizeStage(raw, ZOHO_STAGE_MAP, workspace.custom_stage_map);

    // Zoho Payload normalization mapping:
    // Usually passes lead details inside an object or array. We search for common properties.
    const leadObj = Array.isArray(body) ? body[0] : body;
    const external_id = leadObj.id || leadObj.Lead_ID || leadObj.external_id || `zoho_${Date.now()}`;
    const name = leadObj.Full_Name || `${leadObj.First_Name || ''} ${leadObj.Last_Name || ''}`.trim() || leadObj.name;
    const email = leadObj.Email || leadObj.email;
    const phone = leadObj.Phone || leadObj.Mobile || leadObj.phone;
    const lead_status = normalizeZohoStage(leadObj.Lead_Status || leadObj.Stage || leadObj.lead_status || 'new');

    const normalizedPayload = {
      ...body,
      external_id,
      name: name || 'Zoho Lead',
      email,
      phone,
      lead_status,
      source_crm: 'zoho',
      _gcl_aw: leadObj._gcl_aw || leadObj.Gclid || '',
      _fbc: leadObj._fbc || leadObj.fbclid || '',
    };

    const result = await processWebhookLead(workspace, normalizedPayload);
    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error('[Webhook Zoho] Zoho Webhook processing exception:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 200 });
  }
}
