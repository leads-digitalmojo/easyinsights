import { NextResponse } from 'next/server';

export async function GET(
  request: Request,
  { params }: { params: { workspaceSlug: string } }
) {
  const origin = new URL(request.url).origin;
  const slug = params.workspaceSlug;

  const clientId = process.env.GOOGLE_CLIENT_ID;

  // No credentials configured — run sandbox simulation
  if (!clientId) {
    const simulateUrl = `${origin}/api/workspaces/${slug}/google/callback?simulate=true`;
    return NextResponse.redirect(simulateUrl);
  }

  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ||
    `${origin}/api/workspaces/${slug}/google/callback`;

  const oauthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  oauthUrl.searchParams.set('client_id', clientId);
  oauthUrl.searchParams.set('redirect_uri', redirectUri);
  oauthUrl.searchParams.set('response_type', 'code');
  oauthUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/adwords');
  oauthUrl.searchParams.set('access_type', 'offline');
  oauthUrl.searchParams.set('prompt', 'consent');

  return NextResponse.redirect(oauthUrl.toString());
}
