import { NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import { adminDb } from '@/lib/firebaseAdmin';
import { hashEmail, hashPhone } from '@/lib/hash';
import { getEIEventName } from '@/lib/statusMap';
import { sendMetaEvent } from '@/lib/meta';
import { sendGoogleEvent } from '@/lib/google';
import { getWorkspaceBySlug } from '@/lib/getWorkspace';
import { requireWorkspaceMember } from '@/lib/authMiddleware';

// Helper to validate workspace slug
export async function GET(
  request: Request,
  { params }: { params: { workspaceSlug: string } }
) {
  try {
    const workspace = await getWorkspaceBySlug(params.workspaceSlug);
    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    const auth = await requireWorkspaceMember(request, workspace.id);
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const leadsSnap = await adminDb
      .collection('workspaces')
      .doc(workspace.id)
      .collection('leads')
      .orderBy('created_at', 'desc')
      .get();

    const leads = leadsSnap.docs.map((doc: any) => doc.data());
    return NextResponse.json(leads, { status: 200 });
  } catch (error: any) {
    console.error('Error fetching leads:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: { workspaceSlug: string } }
) {
  try {
    const workspace = await getWorkspaceBySlug(params.workspaceSlug);
    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    const auth = await requireWorkspaceMember(request, workspace.id);
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await request.json();
    const {
      name,
      email,
      phone,
      source_crm = 'custom',
      external_id = `ext_${Date.now()}`,
      page_url = '',
      referrer = '',
      user_agent = '',
      _ga = '',
      _gcl_aw = '',
      _fbc = '',
      _fbp = '',
      _ei_sid = '',
      cookie_str = '',
    } = body;

    if (!email && !phone) {
      return NextResponse.json(
        { error: 'Email or Phone is required to construct conversion events' },
        { status: 400 }
      );
    }

    const leadId = adminDb
      .collection('workspaces')
      .doc(workspace.id)
      .collection('leads')
      .doc().id;

    const emailSha = hashEmail(email || '');
    const phoneSha = hashPhone(phone || '');

    // Map 'new' through the shared status map so manual leads fire the same
    // event ('Lead') as webhook leads — never a divergent hardcoded name.
    const eventName = getEIEventName('new') || 'Lead';

    const leadData: any = {
      id: leadId,
      workspace_id: workspace.id,
      source_crm,
      external_id,
      name: name || 'Lead',
      email: email || '',
      phone: phone || '',
      email_sha256: emailSha,
      phone_sha256: phoneSha,
      lead_status: 'new',
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
      raw_payload: body,
    };

    // Save lead in subcollection
    await adminDb
      .collection('workspaces')
      .doc(workspace.id)
      .collection('leads')
      .doc(leadId)
      .set(leadData);

    // Fire conversions, then record the real per-platform outcome
    const [metaResult, googleResult] = await Promise.all([
      sendMetaEvent(workspace, leadData, eventName),
      sendGoogleEvent(workspace, leadData, eventName),
    ]);

    await adminDb
      .collection('workspaces')
      .doc(workspace.id)
      .collection('leads')
      .doc(leadId)
      .update({
        meta_event_fired: eventName,
        google_event_fired: eventName,
        last_fired_at: new Date(),
        status_history: [
          {
            status: 'new',
            changed_at: Date.now(),
            source: 'manual',
            ei_event_fired: eventName,
            meta_success: metaResult.success,
            google_success: googleResult.success,
          },
        ],
      });

    // Increment conversion counts only for platforms that actually succeeded
    const conversionsColl = adminDb
      .collection('workspaces')
      .doc(workspace.id)
      .collection('conversions');

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
        const docRef = convQuery.docs[0]!.ref;
        await docRef.update({
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

    return NextResponse.json(leadData, { status: 200 });
  } catch (error: any) {
    console.error('Error creating lead:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
