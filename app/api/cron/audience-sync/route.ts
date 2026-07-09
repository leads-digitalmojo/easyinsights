import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { syncAudience } from '@/lib/audienceSync';
import { Audience, Workspace } from '@/types';

// Called by Vercel Cron daily. Iterates every workspace's audiences and
// re-syncs each against its ad platform, so Positive/Negative Stage
// segments stay current without a manual "Sync" click.
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const workspacesSnap = await adminDb.collection('workspaces').get();
    const results: any[] = [];

    for (const wsDoc of workspacesSnap.docs) {
      const workspace = { id: wsDoc.id, ...wsDoc.data() } as Workspace;

      const audiencesSnap = await adminDb
        .collection('workspaces')
        .doc(workspace.id)
        .collection('audiences')
        .get();

      for (const audDoc of audiencesSnap.docs) {
        const audience = audDoc.data() as Audience;

        try {
          await audDoc.ref.update({ status: 'Syncing', sync_error: null });

          const result = await syncAudience(workspace, audience);

          if (result.success) {
            await audDoc.ref.update({
              status: 'Synced',
              size: result.size,
              external_audience_id: result.externalAudienceId ?? audience.external_audience_id ?? null,
              sync_error: null,
              last_synced_at: new Date(),
            });
          } else {
            await audDoc.ref.update({
              status: 'Error',
              external_audience_id: result.externalAudienceId ?? audience.external_audience_id ?? null,
              sync_error: result.error || 'Sync failed.',
              last_synced_at: new Date(),
            });
          }

          results.push({ workspace: workspace.slug, audience: audience.name, ...result });
        } catch (e: any) {
          await audDoc.ref.update({ status: 'Error', sync_error: e.message, last_synced_at: new Date() }).catch(() => {});
          results.push({ workspace: workspace.slug, audience: audience.name, success: false, error: e.message });
        }
      }
    }

    return NextResponse.json({ ok: true, audiences: results.length, results });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
