import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { getWorkspaceBySlug } from '@/lib/getWorkspace';

export async function GET(
  request: Request,
  { params }: { params: { workspaceSlug: string } }
) {
  try {
    const workspace = await getWorkspaceBySlug(params.workspaceSlug);
    if (!workspace) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });

    const snap = await adminDb
      .collection('workspaces')
      .doc(workspace.id)
      .collection('webhook_payloads')
      .orderBy('received_at', 'desc')
      .limit(50)
      .get();

    const items = snap.docs.map((d) => d.data());
    return NextResponse.json(items, { status: 200 });
  } catch (err: any) {
    console.error('Error listing webhook payloads:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
