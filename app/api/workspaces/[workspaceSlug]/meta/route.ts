import { NextResponse } from 'next/server';
import { adminDb, isMockEnvironment } from '@/lib/firebaseAdmin';
import { encrypt } from '@/lib/encrypt';
import { requireWorkspaceMember } from '@/lib/authMiddleware';
import { getWorkspaceBySlug } from '@/lib/getWorkspace';
import { sendMetaTestEvent } from '@/lib/meta';

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

    const { pixel_id, access_token, test_event_code, ad_account_id } = await request.json();

    if (!pixel_id || !access_token) {
      return NextResponse.json(
        { error: 'Missing pixel_id or access_token' },
        { status: 400 }
      );
    }

    // Normalize the ad account id to the act_<digits> form Meta expects.
    let normalizedAdAccount = '';
    if (ad_account_id && String(ad_account_id).trim()) {
      const raw = String(ad_account_id).trim();
      normalizedAdAccount = raw.startsWith('act_') ? raw : `act_${raw.replace(/\D/g, '')}`;
    }

    let pixelName = `Pixel (${pixel_id})`;

    // Verify the token by sending a real CAPI test event — this confirms the
    // exact capability we depend on (event sending), not just pixel read access.
    if (!isMockEnvironment) {
      const verify = await sendMetaTestEvent(pixel_id, access_token, test_event_code);
      if (!verify.ok) {
        // Block save on genuinely broken tokens so leads don't silently fail later.
        return NextResponse.json(
          { error: verify.message || 'Meta token verification failed.' },
          { status: 400 }
        );
      }
    } else {
      pixelName = 'Sandbox Meta Pixel (Demo)';
    }

    // Encrypt access token before saving
    const encryptedToken = encrypt(access_token);

    // Save to Firestore
    await adminDb.collection('workspaces').doc(docSnap.id).update({
      meta_pixel_id: pixel_id.trim(),
      meta_access_token: encryptedToken,
      meta_pixel_name: pixelName,
      meta_ad_account_id: normalizedAdAccount,
      updated_at: new Date(),
    });

    return NextResponse.json({ success: true, pixel_name: pixelName }, { status: 200 });
  } catch (error: any) {
    console.error('Error saving Meta settings:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
