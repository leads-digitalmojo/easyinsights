import { NextResponse } from 'next/server';
import { getWorkspaceBySlug } from '@/lib/getWorkspace';
import { requireWorkspaceMember } from '@/lib/authMiddleware';
import { validateGoogleCredentials } from '@/lib/google';

/**
 * Validates Google Ads credentials with a real OAuth + API check.
 * Body may include { customer_id, developer_token } to test unsaved form
 * values; the saved OAuth refresh token for the workspace is always used.
 */
export async function POST(
  request: Request,
  { params }: { params: { workspaceSlug: string } }
) {
  try {
    const workspace = await getWorkspaceBySlug(params.workspaceSlug);
    if (!workspace) {
      return NextResponse.json({ ok: false, message: 'Workspace not found' }, { status: 404 });
    }

    const auth = await requireWorkspaceMember(request, workspace.id);
    if ('error' in auth) {
      return NextResponse.json({ ok: false, message: auth.error }, { status: auth.status });
    }

    const body = await request.json().catch(() => ({}));
    const customerId = body.customer_id || workspace.google_ads_customer_id;
    const developerToken = body.developer_token || workspace.google_ads_developer_token;

    const result = await validateGoogleCredentials(
      customerId,
      developerToken,
      workspace.google_ads_refresh_token
    );

    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error('[Google Test] error:', error);
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  }
}
