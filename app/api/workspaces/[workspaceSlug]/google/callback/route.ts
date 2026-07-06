import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { encrypt } from '@/lib/encrypt';
import { getWorkspaceBySlug } from '@/lib/getWorkspace';

export async function GET(
  request: Request,
  { params }: { params: { workspaceSlug: string } }
) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  const settingsUrl = new URL(`/${params.workspaceSlug}/settings`, request.url);

  if (error) {
    settingsUrl.searchParams.set('google_error', error);
    return NextResponse.redirect(settingsUrl.toString());
  }

  if (!code) {
    // Sandbox simulation (no real Google credentials configured)
    const simulate = searchParams.get('simulate');
    if (simulate === 'true') {
      const docSnap = await getWorkspaceBySlug(params.workspaceSlug);
      if (docSnap) {
        const mockRefreshToken = encrypt('mock_oauth_refresh_token_xyz_98765');
        await docSnap.ref.update({
          google_ads_refresh_token: mockRefreshToken,
          google_ads_account_name: 'AdSync Sandbox Google Account',
          updated_at: new Date(),
        });
      }
      // Always succeed — mock env has no Firestore workspace to update
      settingsUrl.searchParams.set('google_success', 'true');
      return NextResponse.redirect(settingsUrl.toString());
    }

    settingsUrl.searchParams.set('google_error', 'Missing OAuth Code');
    return NextResponse.redirect(settingsUrl.toString());
  }

  try {
    // Exchange authorization code for refresh_token
    const tokenUrl = 'https://oauth2.googleapis.com/token';
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${new URL(request.url).origin}/api/workspaces/${params.workspaceSlug}/google/callback`;

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[Google OAuth] Token exchange failed:', data);
      settingsUrl.searchParams.set('google_error', data.error_description || data.error || 'Token exchange failed. Check your GOOGLE_CLIENT_SECRET in .env.local.');
      return NextResponse.redirect(settingsUrl.toString());
    }

    const { refresh_token, access_token } = data;

    // Try to persist tokens — skip silently if workspace not in Firestore (mock/local env)
    const docSnap = await getWorkspaceBySlug(params.workspaceSlug);
    if (docSnap) {
      const encryptedRefreshToken = encrypt(refresh_token || '');
      const encryptedAccessToken = encrypt(access_token || '');
      await docSnap.ref.update({
        google_ads_refresh_token: encryptedRefreshToken,
        google_ads_access_token: encryptedAccessToken,
        google_ads_account_name: 'Connected Google AdWords Account',
        updated_at: new Date(),
      });
    } else {
      console.warn('[Google OAuth] Workspace not in Firestore — tokens not persisted (mock env).');
    }

    settingsUrl.searchParams.set('google_success', 'true');
    return NextResponse.redirect(settingsUrl.toString());
  } catch (err: any) {
    console.error('[Google OAuth] Callback server crash:', err);
    settingsUrl.searchParams.set('google_error', err.message);
    return NextResponse.redirect(settingsUrl.toString());
  }
}
