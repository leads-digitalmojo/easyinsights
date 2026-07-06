import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireWorkspaceMember } from '@/lib/authMiddleware';
import { getWorkspaceBySlug } from '@/lib/getWorkspace';

// PATCH — save Sell.do API key
export async function PATCH(
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

    const { selldo_api_key } = await request.json();

    await adminDb.collection('workspaces').doc(docSnap.id).update({
      selldo_api_key: selldo_api_key?.trim() ?? '',
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
