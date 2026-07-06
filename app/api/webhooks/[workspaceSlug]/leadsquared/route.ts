import { NextResponse } from 'next/server';
import { processWebhookLead } from '@/lib/webhookProcessor';
import { getWorkspaceBySlug } from '@/lib/getWorkspace';
import { normalizeStage } from '@/lib/stageNormalize';

export async function POST(
  request: Request,
  { params }: { params: { workspaceSlug: string } }
) {
  console.log(`[Webhook LeadSquared] Received LeadSquared POST for workspace: ${params.workspaceSlug}`);
  try {
    const workspace = await getWorkspaceBySlug(params.workspaceSlug);
    if (!workspace) {
      console.error(`[Webhook LeadSquared] Workspace not found.`);
      return NextResponse.json({ success: false, error: 'Workspace not found' }, { status: 200 });
    }

    const searchParams = new URL(request.url).searchParams;
    const querySecret = searchParams.get('secret');
    const headerSecret = request.headers.get('x-webhook-secret') || request.headers.get('webhook-secret');
    
    let body: any = {};
    try {
      body = await request.json();
    } catch (e) {
      console.error('[Webhook LeadSquared] Failed to parse body JSON:', e);
    }

    const bodySecret = body.webhook_secret;
    const providedSecret = querySecret || headerSecret || bodySecret;

    if (!providedSecret || providedSecret !== workspace.webhook_secret) {
      console.error(`[Webhook LeadSquared] Invalid secret.`);
      return NextResponse.json({ success: false, error: 'Unauthorized secret' }, { status: 200 });
    }

    const LEADSQUARED_STAGE_MAP: Record<string, string> = {
      'new': 'new', 'fresh': 'new', 'untouched': 'new',
      'prospect': 'interested', 'qualified': 'interested', 'interested': 'interested',
      'connected': 'interested', 'follow up': 'interested', 'callback': 'interested',
      'site visit scheduled': 'in_call_center', 'in progress': 'in_call_center',
      'site visit done': 'visit_done', 'visited': 'visit_done',
      'proposal': 'final_negotiation', 'negotiation': 'final_negotiation',
      'booking done': 'booking_done',
      'won': 'converted', 'converted': 'converted', 'closed': 'converted',
      'lost': 'failed', 'not interested': 'failed', 'dead': 'failed',
      'junk': 'junk', 'invalid': 'junk', 'spam': 'junk', 'duplicate': 'junk',
    };

    const normalizeLeadSquaredStage = (raw: any): string =>
      normalizeStage(raw, LEADSQUARED_STAGE_MAP, workspace.custom_stage_map);

    // LeadSquared Payload normalization mapping:
    const leadObj = body;
    const external_id = leadObj.LeadIdentifier || leadObj.LeadId || leadObj.external_id || `leadsquared_${Date.now()}`;
    const name = leadObj.Name || `${leadObj.FirstName || ''} ${leadObj.LastName || ''}`.trim() || leadObj.name;
    const email = leadObj.EmailAddress || leadObj.email;
    const phone = leadObj.Phone || leadObj.Mobile || leadObj.phone;
    const lead_status = normalizeLeadSquaredStage(leadObj.LeadStatus || leadObj.Stage || leadObj.lead_status || 'new');

    const normalizedPayload = {
      ...body,
      external_id,
      name: name || 'LeadSquared Lead',
      email,
      phone,
      lead_status,
      source_crm: 'leadsquared',
      _gcl_aw: leadObj._gcl_aw || leadObj.GCLID || '',
      _fbc: leadObj._fbc || leadObj.FBCID || '',
    };

    const result = await processWebhookLead(workspace, normalizedPayload);
    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error('[Webhook LeadSquared] LeadSquared Webhook processing exception:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 200 });
  }
}
