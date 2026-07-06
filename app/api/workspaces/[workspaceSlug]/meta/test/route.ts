import { NextResponse } from 'next/server';
import { getWorkspaceBySlug } from '@/lib/getWorkspace';
import { requireWorkspaceMember } from '@/lib/authMiddleware';
import { sendMetaTestEvent } from '@/lib/meta';
import { decrypt } from '@/lib/encrypt';

/**
 * Verifies a Meta CAPI token by sending a real test event.
 * Body may include { pixel_id, access_token, test_event_code } to test
 * unsaved values from the form. If access_token is omitted, the saved
 * (encrypted) token for the workspace is used.
 */
export async function POST(
  request: Request,
  { params }: { params: { workspaceSlug: string } }
) {
  try {
    const docSnap = await getWorkspaceBySlug(params.workspaceSlug);
    if (!docSnap) {
      return NextResponse.json({ ok: false, message: 'Workspace not found' }, { status: 404 });
    }

    const auth = await requireWorkspaceMember(request, docSnap.id);
    if ('error' in auth) {
      return NextResponse.json({ ok: false, message: auth.error }, { status: auth.status });
    }

    const body = await request.json().catch(() => ({}));
    const pixelId = body.pixel_id || docSnap.meta_pixel_id;
    const accessToken =
      body.access_token || (docSnap.meta_access_token ? decrypt(docSnap.meta_access_token) : '');
    const testEventCode = body.test_event_code || undefined;

    if (!pixelId || !accessToken) {
      return NextResponse.json(
        { ok: false, message: 'Enter a Pixel ID and Access Token first.' },
        { status: 400 }
      );
    }

    const result = await sendMetaTestEvent(pixelId, accessToken, testEventCode);
    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error('[Meta Test] error:', error);
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  }
}
