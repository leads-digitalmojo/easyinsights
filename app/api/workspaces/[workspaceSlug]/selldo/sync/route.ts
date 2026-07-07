import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireWorkspaceMember } from '@/lib/authMiddleware';
import { getWorkspaceBySlug } from '@/lib/getWorkspace';
import { processWebhookLead } from '@/lib/webhookProcessor';
import { normalizeStage } from '@/lib/stageNormalize';

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

async function fetchSelldoLeads(apiKey: string, updatedAfter?: Date): Promise<any[]> {
  const allLeads: any[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const url = new URL('https://app.sell.do/api/v2/leads');
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('page', String(page));
    url.searchParams.set('per_page', String(perPage));
    if (updatedAfter) {
      url.searchParams.set('filter[updated_at_gteq]', updatedAfter.toISOString());
    }

    const res = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      console.error(`[Sell.do Sync] API returned ${res.status}`);
      break;
    }

    const json = await res.json();
    const leads: any[] = json.leads ?? json.data ?? (Array.isArray(json) ? json : []);

    if (leads.length === 0) break;
    allLeads.push(...leads);

    // Stop if we got fewer than a full page (last page)
    if (leads.length < perPage) break;
    page++;
  }

  return allLeads;
}

// POST — trigger sync (called manually from settings UI or by cron)
export async function POST(
  request: Request,
  { params }: { params: { workspaceSlug: string } }
) {
  try {
    const docSnap = await getWorkspaceBySlug(params.workspaceSlug);
    if (!docSnap) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    // Allow both authenticated users and internal cron (cron passes x-cron-secret header)
    const cronSecret = request.headers.get('x-cron-secret');
    const isCron = cronSecret === process.env.CRON_SECRET;

    if (!isCron) {
      const auth = await requireWorkspaceMember(request, docSnap.id);
      if ('error' in auth) {
        return NextResponse.json({ error: auth.error }, { status: auth.status });
      }
    }

    const workspace = docSnap.data() as any;

    if (!workspace.selldo_api_key) {
      return NextResponse.json({ error: 'Sell.do API key not configured' }, { status: 400 });
    }

    // Incremental sync: only fetch leads updated since last sync
    let updatedAfter: Date | undefined;
    if (workspace.selldo_last_synced_at) {
      const ts = workspace.selldo_last_synced_at;
      const base: Date = ts.toDate ? ts.toDate() : new Date(ts);
      // Subtract 5 min buffer to avoid missing leads on edge
      updatedAfter = new Date(base.getTime() - 5 * 60 * 1000);
    }

    const syncStart = new Date();
    const leads = await fetchSelldoLeads(workspace.selldo_api_key, updatedAfter);

    let processed = 0;
    let failed = 0;

    for (const lead of leads) {
      try {
        const rawStage = lead.stage ?? lead.current_stage ?? lead.status ?? 'fresh';
        const normalizedPayload = {
          external_id: String(lead.id ?? `selldo_${Date.now()}`),
          name: lead.full_name ?? lead.name ?? (`${lead.first_name ?? ''} ${lead.last_name ?? ''}`.trim() || 'Sell.do Lead'),
          email: lead.email ?? '',
          phone: lead.phone ?? lead.mobile ?? lead.contact_number ?? '',
          lead_status: normalizeStage(rawStage, SELLDO_STAGE_MAP, workspace.custom_stage_map ?? {}),
          source_crm: 'selldo',
          page_url: lead.page_url ?? lead.landing_page ?? '',
          _gcl_aw: lead.gclid ?? lead._gcl_aw ?? '',
          _fbc: lead.fbclid ?? lead._fbc ?? '',
          _fbp: lead._fbp ?? '',
        };

        const result = await processWebhookLead(workspace, normalizedPayload);
        if (result.success) processed++;
        else failed++;
      } catch (e) {
        console.error('[Sell.do Sync] lead processing error:', e);
        failed++;
      }
    }

    // Update last synced timestamp
    await adminDb.collection('workspaces').doc(docSnap.id).update({
      selldo_last_synced_at: syncStart,
    });

    return NextResponse.json({
      success: true,
      fetched: leads.length,
      processed,
      failed,
      synced_at: syncStart.toISOString(),
    });
  } catch (error: any) {
    console.error('[Sell.do Sync] error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// GET — return sync status
export async function GET(
  request: Request,
  { params }: { params: { workspaceSlug: string } }
) {
  try {
    const docSnap = await getWorkspaceBySlug(params.workspaceSlug);
    if (!docSnap) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    const auth = await requireWorkspaceMember(request, docSnap.id);
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const ws = docSnap.data() as any;
    return NextResponse.json({
      configured: !!ws.selldo_api_key,
      last_synced_at: ws.selldo_last_synced_at ?? null,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
