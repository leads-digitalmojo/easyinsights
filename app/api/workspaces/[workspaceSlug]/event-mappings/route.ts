import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireWorkspaceMember } from '@/lib/authMiddleware';
import { getWorkspaceBySlug } from '@/lib/getWorkspace';
import { STATUS_MAP } from '@/lib/statusMap';

export async function GET(
  request: Request,
  { params }: { params: { workspaceSlug: string } }
) {
  try {
    const workspace = await getWorkspaceBySlug(params.workspaceSlug);
    if (!workspace) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });

    const auth = await requireWorkspaceMember(request, workspace.id);
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    return NextResponse.json({
      defaults: STATUS_MAP,
      overrides: workspace.custom_event_map || {},
    });
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
    const overrides: Record<string, string> = body.overrides ?? {};

    // Validate — known status keys only, non-empty event name values
    for (const [status, eventName] of Object.entries(overrides)) {
      if (!(status.toLowerCase().trim() in STATUS_MAP)) {
        return NextResponse.json({ error: `Unknown lead status: "${status}"` }, { status: 400 });
      }
      if (!eventName || !eventName.trim()) {
        return NextResponse.json({ error: `Event name for "${status}" cannot be empty` }, { status: 400 });
      }
    }

    await adminDb.collection('workspaces').doc(workspace.id).update({
      custom_event_map: overrides,
      updated_at: new Date(),
    });

    return NextResponse.json({ success: true, overrides });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
