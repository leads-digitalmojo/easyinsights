import { NextResponse } from 'next/server';
import { adminDb, adminAuth, isMockEnvironment } from '@/lib/firebaseAdmin';
import crypto from 'crypto';

async function resolveOwnerUid(request: Request): Promise<string | null> {
  if (isMockEnvironment) return 'mock-uid-123';
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    return decoded.uid;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const owner_uid = await resolveOwnerUid(request);
    if (!owner_uid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name, slug } = await request.json();

    if (!name || !slug) {
      return NextResponse.json(
        { error: 'Missing name or slug' },
        { status: 400 }
      );
    }

    const cleanSlug = slug.toLowerCase().trim().replace(/[^a-z0-9-_]/g, '');

    // Check if slug already exists
    const slugQuery = await adminDb
      .collection('workspaces')
      .where('slug', '==', cleanSlug)
      .limit(1)
      .get();

    if (!slugQuery.empty) {
      return NextResponse.json(
        { error: 'Workspace slug is already taken' },
        { status: 400 }
      );
    }

    const workspaceId = adminDb.collection('workspaces').doc().id;
    const webhookSecret = crypto.randomBytes(16).toString('hex');

    // Collect all UIDs from existing workspaces so new workspace is visible to everyone.
    const existingUids = new Set<string>([owner_uid]);
    try {
      const allWsSnap = await adminDb.collection('workspaces').get();
      for (const wsDoc of allWsSnap.docs) {
        const wsData = wsDoc.data() as any;
        if (Array.isArray(wsData.members)) {
          wsData.members.forEach((uid: string) => existingUids.add(uid));
        }
      }
    } catch (e) {
      console.warn('Failed to fetch existing workspace members:', e);
    }

    const newWorkspace = {
      id: workspaceId,
      name: name.trim(),
      slug: cleanSlug,
      owner_uid: owner_uid,
      members: Array.from(existingUids),
      meta_pixel_id: '',
      meta_access_token: '',
      google_ads_customer_id: '',
      google_ads_developer_token: '',
      google_ads_refresh_token: '',
      webhook_secret: webhookSecret,
      created_at: new Date(),
    };

    await adminDb.collection('workspaces').doc(workspaceId).set(newWorkspace);

    // Write audit log for workspace creation
    try {
      const auditId = adminDb.collection('workspaces').doc(workspaceId).collection('audit_logs').doc().id;
      await adminDb
        .collection('workspaces')
        .doc(workspaceId)
        .collection('audit_logs')
        .doc(auditId)
        .set({
          id: auditId,
          action: 'workspace_created',
          actor: owner_uid,
          details: { name: name.trim(), slug: cleanSlug },
          timestamp: new Date(),
        });
    } catch (auditErr) {
      console.warn('Failed to write workspace audit log:', auditErr);
    }

    // Initialize sample conversion count logs to prevent division/empty anomalies
    const sampleConversions = [
      { name: 'EI_New', platform: 'meta', event_name: 'EI_New', count: 0 },
      { name: 'EI_Junk', platform: 'meta', event_name: 'EI_Junk', count: 0 },
      { name: 'EI_Interested', platform: 'meta', event_name: 'EI_Interested', count: 0 },
      { name: 'EI_New', platform: 'google', event_name: 'EI_New', count: 0 },
      { name: 'EI_Interested', platform: 'google', event_name: 'EI_Interested', count: 0 },
    ];

    for (const conv of sampleConversions) {
      const convId = adminDb.collection('workspaces').doc(workspaceId).collection('conversions').doc().id;
      await adminDb
        .collection('workspaces')
        .doc(workspaceId)
        .collection('conversions')
        .doc(convId)
        .set({
          id: convId,
          ...conv,
          account_name: conv.platform === 'meta' ? 'Meta Pixel Account' : 'Google Ads Account',
          last_fired_at: new Date(),
          created_at: new Date(),
        });
    }

    return NextResponse.json(newWorkspace, { status: 200 });
  } catch (error: any) {
    console.error('Error creating workspace:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
