import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { getWorkspaceBySlug } from '@/lib/getWorkspace';
import { requireWorkspaceMember } from '@/lib/authMiddleware';
import { syncAudience } from '@/lib/audienceSync';
import { Audience } from '@/types';

export async function POST(
  request: Request,
  { params }: { params: { workspaceSlug: string; audienceId: string } }
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

    const audRef = adminDb
      .collection('workspaces')
      .doc(workspace.id)
      .collection('audiences')
      .doc(params.audienceId);

    const audSnap = await audRef.get();
    if (!audSnap.exists) {
      return NextResponse.json({ error: 'Audience not found' }, { status: 404 });
    }
    const audience = audSnap.data() as Audience;

    // Mark in-flight so concurrent UIs reflect the running state.
    await audRef.update({ status: 'Syncing', sync_error: null });

    const result = await syncAudience(workspace as any, audience);

    if (result.success) {
      await audRef.update({
        status: 'Synced',
        size: result.size,
        external_audience_id: result.externalAudienceId ?? audience.external_audience_id ?? null,
        sync_error: null,
        last_synced_at: new Date(),
      });
      return NextResponse.json({ success: true, size: result.size }, { status: 200 });
    }

    await audRef.update({
      status: 'Error',
      external_audience_id: result.externalAudienceId ?? audience.external_audience_id ?? null,
      sync_error: result.error || 'Sync failed.',
      last_synced_at: new Date(),
    });
    return NextResponse.json({ success: false, error: result.error || 'Sync failed.' }, { status: 200 });
  } catch (error: any) {
    console.error('[Audience Sync API] error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
