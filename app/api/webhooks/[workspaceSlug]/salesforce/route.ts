import { NextResponse } from 'next/server';
import { processWebhookLead } from '@/lib/webhookProcessor';
import { getWorkspaceBySlug } from '@/lib/getWorkspace';
import { normalizeStage } from '@/lib/stageNormalize';

export async function POST(
  request: Request,
  { params }: { params: { workspaceSlug: string } }
) {
  console.log(`[Webhook Salesforce] Received Salesforce POST for workspace: ${params.workspaceSlug}`);
  try {
    const workspace = await getWorkspaceBySlug(params.workspaceSlug);
    if (!workspace) {
      console.error(`[Webhook Salesforce] Workspace not found.`);
      return NextResponse.json({ success: false, error: 'Workspace not found' }, { status: 200 });
    }

    const searchParams = new URL(request.url).searchParams;
    const querySecret = searchParams.get('secret');
    const headerSecret = request.headers.get('x-webhook-secret') || request.headers.get('webhook-secret');
    
    let body: any = {};
    try {
      body = await request.json();
    } catch (e) {
      console.error('[Webhook Salesforce] Failed to parse body JSON:', e);
    }

    const bodySecret = body.webhook_secret;
    const providedSecret = querySecret || headerSecret || bodySecret;

    if (!providedSecret || providedSecret !== workspace.webhook_secret) {
      console.error(`[Webhook Salesforce] Invalid secret.`);
      return NextResponse.json({ success: false, error: 'Unauthorized secret' }, { status: 200 });
    }

    const SALESFORCE_STAGE_MAP: Record<string, string> = {
      'new': 'new', 'open - not contacted': 'new', 'open': 'new',
      'working - contacted': 'interested', 'contacted': 'interested',
      'qualified': 'interested', 'nurturing': 'interested', 'recycled': 'new',
      'proposal': 'final_negotiation', 'negotiation': 'final_negotiation',
      'site visit scheduled': 'in_call_center',
      'site visit done': 'visit_done', 'visit done': 'visit_done',
      'booking done': 'booking_done',
      'closed - converted': 'converted', 'won': 'converted', 'converted': 'converted',
      'closed - not converted': 'failed', 'lost': 'failed',
      'unqualified': 'junk', 'junk': 'junk', 'dead': 'junk', 'spam': 'junk',
    };

    const normalizeSalesforceStage = (raw: any): string =>
      normalizeStage(raw, SALESFORCE_STAGE_MAP, workspace.custom_stage_map);

    // Salesforce Payload normalization mapping:
    const leadObj = body;
    const external_id = leadObj.Id || leadObj.LeadId || leadObj.external_id || `salesforce_${Date.now()}`;
    const name = leadObj.Name || `${leadObj.FirstName || ''} ${leadObj.LastName || ''}`.trim() || leadObj.name;
    const email = leadObj.Email || leadObj.email;
    const phone = leadObj.Phone || leadObj.MobilePhone || leadObj.phone;
    const lead_status = normalizeSalesforceStage(leadObj.Status || leadObj.StageName || leadObj.lead_status || 'new');

    const normalizedPayload = {
      ...body,
      external_id,
      name: name || 'Salesforce Lead',
      email,
      phone,
      lead_status,
      source_crm: 'salesforce',
      _gcl_aw: leadObj._gcl_aw || leadObj.GoogleClickId || '',
      _fbc: leadObj._fbc || leadObj.FacebookClickId || '',
    };

    const result = await processWebhookLead(workspace, normalizedPayload);
    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error('[Webhook Salesforce] Salesforce Webhook processing exception:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 200 });
  }
}
