import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import crypto from 'crypto';
import { requireWorkspaceMember } from '@/lib/authMiddleware';
import { getWorkspaceBySlug } from '@/lib/getWorkspace';

export async function POST(
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

    const newSecret = crypto.randomUUID();

    await adminDb.collection('workspaces').doc(docSnap.id).update({
      webhook_secret: newSecret,
      updated_at: new Date(),
    });

    console.log(`[Webhook Secret API] Regenerated secret for workspace: ${params.workspaceSlug}`);
    return NextResponse.json({ secret: newSecret }, { status: 200 });
  } catch (error: any) {
    console.error('Error regenerating secret:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
