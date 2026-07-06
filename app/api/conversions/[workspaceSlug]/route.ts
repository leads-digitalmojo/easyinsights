import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { getWorkspaceBySlug } from '@/lib/getWorkspace';
import { requireWorkspaceMember } from '@/lib/authMiddleware';

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

    const conversionsSnap = await adminDb
      .collection('workspaces')
      .doc(workspace.id)
      .collection('conversions')
      .get();

    const conversions = conversionsSnap.docs.map((doc: any) => doc.data());
    return NextResponse.json(conversions, { status: 200 });
  } catch (error: any) {
    console.error('Error fetching conversions:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
