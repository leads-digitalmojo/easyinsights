import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireWorkspaceMember } from '@/lib/authMiddleware';
import { getWorkspaceBySlug } from '@/lib/getWorkspace';

export async function GET(
  request: Request,
  { params }: { params: { workspaceSlug: string } }
) {
  try {
    const docSnap = await getWorkspaceBySlug(params.workspaceSlug);
    if (!docSnap) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });

    const workspaceId = docSnap.id;

    // Try rich members_v2 first
    const membersSnap = await adminDb
      .collection('workspaces')
      .doc(workspaceId)
      .collection('members_v2')
      .get();

    if (!membersSnap.empty) {
      const list = membersSnap.docs.map((d) => d.data());
      return NextResponse.json(list, { status: 200 });
    }

    // Fallback to legacy members array
    const ws = docSnap.data() as any;
    const legacy = (ws.members || []).map((uid: string) => ({ uid, role: 'Admin' }));
    return NextResponse.json(legacy, { status: 200 });
  } catch (err: any) {
    console.error('Error listing members:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: { workspaceSlug: string } }
) {
  try {
    const docSnap = await getWorkspaceBySlug(params.workspaceSlug);
    if (!docSnap) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });

    const auth = await requireWorkspaceMember(request, docSnap.id);
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await request.json();
    const { email, uid, role = 'Admin' } = body;

    if (!email && !uid) {
      return NextResponse.json({ error: 'Missing email or uid' }, { status: 400 });
    }

    const workspaceId = docSnap.id;

    // Create member record in members_v2 subcollection
    const memberId = adminDb
      .collection('workspaces')
      .doc(workspaceId)
      .collection('members_v2')
      .doc().id;

    const memberObj = {
      id: memberId,
      uid: uid || null,
      email: email ? email.toLowerCase().trim() : null,
      role,
      status: uid ? 'active' : 'invited',
      invited_at: new Date(),
    };

    await adminDb
      .collection('workspaces')
      .doc(workspaceId)
      .collection('members_v2')
      .doc(memberId)
      .set(memberObj);

    // Write audit log
    try {
      const auditId = adminDb.collection('workspaces').doc(workspaceId).collection('audit_logs').doc().id;
      await adminDb
        .collection('workspaces')
        .doc(workspaceId)
        .collection('audit_logs')
        .doc(auditId)
        .set({
          id: auditId,
          action: 'member_invited',
          actor: null,
          details: { member: memberObj },
          timestamp: new Date(),
        });
    } catch (auditErr) {
      console.warn('Failed to write member invite audit log:', auditErr);
    }

    return NextResponse.json(memberObj, { status: 200 });
  } catch (err: any) {
    console.error('Error inviting member:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
