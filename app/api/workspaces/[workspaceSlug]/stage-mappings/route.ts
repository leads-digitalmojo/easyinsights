import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireWorkspaceMember } from '@/lib/authMiddleware';
import { getWorkspaceBySlug } from '@/lib/getWorkspace';

export async function GET(
  request: Request,
  { params }: { params: { workspaceSlug: string } }
) {
  try {
    const workspace = await getWorkspaceBySlug(params.workspaceSlug);
    if (!workspace) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });

    const auth = await requireWorkspaceMember(request, workspace.id);
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    return NextResponse.json({ mappings: workspace.custom_stage_map || {} });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: { workspaceSlug: string } }
) {
  try {
    const workspace = await getWorkspaceBySlug(params.workspaceSlug);
    if (!workspace) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });

    const auth = await requireWorkspaceMember(request, workspace.id);
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await request.json();
    const mappings: Record<string, string> = body.mappings ?? {};

    // Validate — values must be non-empty strings
    for (const [k, v] of Object.entries(mappings)) {
      if (!k.trim() || !v.trim()) {
        return NextResponse.json({ error: `Invalid mapping: "${k}" → "${v}"` }, { status: 400 });
      }
    }

    await adminDb.collection('workspaces').doc(workspace.id).update({
      custom_stage_map: mappings,
      updated_at: new Date(),
    });

    return NextResponse.json({ success: true, mappings });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
