import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { encrypt } from '@/lib/encrypt';
import { requireWorkspaceMember } from '@/lib/authMiddleware';
import { getWorkspaceBySlug } from '@/lib/getWorkspace';

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

    const { customer_id, developer_token } = await request.json();

    if (!customer_id || !developer_token) {
      return NextResponse.json(
        { error: 'Missing customer_id or developer_token' },
        { status: 400 }
      );
    }

    // Encrypt developer token before saving
    const encryptedDevToken = encrypt(developer_token);

    // Save to Firestore
    await adminDb.collection('workspaces').doc(docSnap.id).update({
      google_ads_customer_id: customer_id.trim(),
      google_ads_developer_token: encryptedDevToken,
      google_ads_account_name: 'Google Ads Sandbox Account',
      updated_at: new Date(),
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    console.error('Error saving Google settings:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
