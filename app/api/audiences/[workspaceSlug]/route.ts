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

    const audiencesSnap = await adminDb
      .collection('workspaces')
      .doc(workspace.id)
      .collection('audiences')
      .get();

    const audiences = audiencesSnap.docs.map((doc: any) => doc.data());
    return NextResponse.json(audiences, { status: 200 });
  } catch (error: any) {
    console.error('Error fetching audiences:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(
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

    const body = await request.json();
    const { name, description, platform, tag, retention_days = 30 } = body;

    if (!name || !platform || !tag) {
      return NextResponse.json(
        { error: 'Missing name, platform, or tag parameters' },
        { status: 400 }
      );
    }

    const audienceId = adminDb
      .collection('workspaces')
      .doc(workspace.id)
      .collection('audiences')
      .doc().id;

    // Audience starts empty. Members accumulate as matching leads fire events;
    // external_audience_id stays null until a real platform sync is performed.
    const newAudience = {
      id: audienceId,
      name,
      description: description || '',
      platform,
      account_name: platform === 'meta' ? 'Meta Ads Sync' : 'Google Customer Sync',
      tag,
      size: 0,
      retention_days: Number(retention_days),
      status: 'Pending Sync',
      external_audience_id: null,
      created_at: new Date(),
    };

    await adminDb
      .collection('workspaces')
      .doc(workspace.id)
      .collection('audiences')
      .doc(audienceId)
      .set(newAudience);

    return NextResponse.json(newAudience, { status: 200 });
  } catch (error: any) {
    console.error('Error creating audience:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
