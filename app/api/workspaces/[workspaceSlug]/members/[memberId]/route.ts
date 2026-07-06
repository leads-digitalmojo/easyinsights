import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireWorkspaceMember } from '@/lib/authMiddleware';
import { getWorkspaceBySlug } from '@/lib/getWorkspace';

export async function PATCH(
  request: Request,
  { params }: { params: { workspaceSlug: string; memberId: string } }
) {
  try {
    const docSnap = await getWorkspaceBySlug(params.workspaceSlug);
    if (!docSnap) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });

    const auth = await requireWorkspaceMember(request, docSnap.id);
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const workspaceId = docSnap.id;
    const body = await request.json();

    const update: any = {};
    if (body.role) update.role = body.role;
    if (body.status) update.status = body.status;

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No updatable fields provided' }, { status: 400 });
    }

    await adminDb
      .collection('workspaces')
      .doc(workspaceId)
      .collection('members_v2')
      .doc(params.memberId)
      .update(update);

    // Audit
    try {
      const auditId = adminDb.collection('workspaces').doc(workspaceId).collection('audit_logs').doc().id;
      await adminDb
        .collection('workspaces')
        .doc(workspaceId)
        .collection('audit_logs')
        .doc(auditId)
        .set({
          id: auditId,
          action: 'member_updated',
          actor: null,
          details: { memberId: params.memberId, update },
          timestamp: new Date(),
        });
    } catch (auditErr) {
      console.warn('Failed to write member update audit log:', auditErr);
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err: any) {
    console.error('Error updating member:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { workspaceSlug: string; memberId: string } }
) {
  try {
    const docSnap = await getWorkspaceBySlug(params.workspaceSlug);
    if (!docSnap) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });

    const auth = await requireWorkspaceMember(request, docSnap.id);
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const workspaceId = docSnap.id;

    await adminDb
      .collection('workspaces')
      .doc(workspaceId)
      .collection('members_v2')
      .doc(params.memberId)
      .delete();

    // Audit
    try {
      const auditId = adminDb.collection('workspaces').doc(workspaceId).collection('audit_logs').doc().id;
      await adminDb
        .collection('workspaces')
        .doc(workspaceId)
        .collection('audit_logs')
        .doc(auditId)
        .set({
          id: auditId,
          action: 'member_deleted',
          actor: null,
          details: { memberId: params.memberId },
          timestamp: new Date(),
        });
    } catch (auditErr) {
      console.warn('Failed to write member delete audit log:', auditErr);
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err: any) {
    console.error('Error deleting member:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
