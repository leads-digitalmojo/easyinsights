import { NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import { adminDb } from '@/lib/firebaseAdmin';
import { getEIEventName } from '@/lib/statusMap';
import { sendMetaEvent } from '@/lib/meta';
import { sendGoogleEvent } from '@/lib/google';
import { getWorkspaceBySlug } from '@/lib/getWorkspace';
import { requireWorkspaceMember } from '@/lib/authMiddleware';

export async function PATCH(
  request: Request,
  { params }: { params: { workspaceSlug: string; leadId: string } }
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

    const { status } = await request.json();
    if (!status) {
      return NextResponse.json({ error: 'Missing status parameter' }, { status: 400 });
    }

    const leadRef = adminDb
      .collection('workspaces')
      .doc(workspace.id)
      .collection('leads')
      .doc(params.leadId);

    const leadSnap = await leadRef.get();
    if (!leadSnap.exists) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    const lead = leadSnap.data()!;

    // No-op if status is unchanged
    if (lead.lead_status === status) {
      return NextResponse.json(lead, { status: 200 });
    }

    const eventName = getEIEventName(status);
    if (!eventName) {
      return NextResponse.json(
        { error: `Invalid status '${status}'. Not mapped to any EasyInsights event.` },
        { status: 400 }
      );
    }

    // Fire the events first so the status_history entry can record the real
    // per-platform outcome (used by the Conversions activity log).
    const fullUpdatedLead = { ...lead, lead_status: status, meta_event_fired: eventName, google_event_fired: eventName };

    const [metaResult, googleResult] = await Promise.all([
      sendMetaEvent(workspace, fullUpdatedLead, eventName),
      sendGoogleEvent(workspace, fullUpdatedLead, eventName),
    ]);

    const updatedHistory = [
      ...(lead.status_history || []),
      {
        status,
        changed_at: Date.now(),
        source: 'manual',
        ei_event_fired: eventName,
        meta_success: metaResult.success,
        google_success: googleResult.success,
      },
    ];

    const updatedData: Record<string, any> = {
      lead_status: status,
      status_history: updatedHistory,
      meta_event_fired: eventName,
      google_event_fired: eventName,
      last_fired_at: new Date(),
      updated_at: new Date(),
    };

    await leadRef.update(updatedData);

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

    return NextResponse.json({ ...fullUpdatedLead, ...updatedData }, { status: 200 });
  } catch (error: any) {
    console.error('Error patching lead:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { workspaceSlug: string; leadId: string } }
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

    const leadRef = adminDb
      .collection('workspaces')
      .doc(workspace.id)
      .collection('leads')
      .doc(params.leadId);

    const leadSnap = await leadRef.get();
    if (!leadSnap.exists) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    await leadRef.delete();
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    console.error('Error deleting lead:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
