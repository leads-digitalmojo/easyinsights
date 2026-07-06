import { NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import { adminDb, adminAuth, isMockEnvironment } from '@/lib/firebaseAdmin';

/**
 * Called right after a user signs in. Bridges email-based invites to real
 * UID-based access: for every workspace where this user's email was invited
 * (members_v2 subcollection), add their uid to the workspace `members` array
 * so the dashboard membership query (`array-contains uid`) returns it.
 */
export async function POST(request: Request) {
  try {
    if (isMockEnvironment) {
      return NextResponse.json({ synced: 0, mock: true }, { status: 200 });
    }

    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let decoded;
    try {
      decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const uid = decoded.uid;
    const email = (decoded.email || '').toLowerCase();
    if (!email) {
      return NextResponse.json({ synced: 0 }, { status: 200 });
    }

    let synced = 0;

    // Find all invite records matching this email across every workspace.
    let inviteDocs: any[] = [];
    try {
      const snap = await adminDb
        .collectionGroup('members_v2')
        .where('email', '==', email)
        .get();
      inviteDocs = snap.docs;
    } catch (e) {
      // collectionGroup needs a composite index the first time; fail soft.
      console.warn('[auth/sync] members_v2 collectionGroup query failed (needs index?):', e);
    }

    for (const inviteDoc of inviteDocs) {
      // members_v2 path: workspaces/{workspaceId}/members_v2/{memberId}
      const workspaceRef = inviteDoc.ref.parent.parent;
      if (!workspaceRef) continue;

      await workspaceRef.update({
        members: admin.firestore.FieldValue.arrayUnion(uid),
      });
      // Record the resolved uid back on the invite for visibility.
      await inviteDoc.ref.update({ uid, status: 'active' });
      synced += 1;
    }

    // Auto-grant access to all existing workspaces for any authenticated user.
    const allWorkspacesSnap = await adminDb.collection('workspaces').get();
    for (const wsDoc of allWorkspacesSnap.docs) {
      const ws = wsDoc.data() as any;
      if (!Array.isArray(ws.members) || !ws.members.includes(uid)) {
        await wsDoc.ref.update({
          members: admin.firestore.FieldValue.arrayUnion(uid),
        });
        synced += 1;
      }
    }

    return NextResponse.json({ synced }, { status: 200 });
  } catch (error: any) {
    console.error('[auth/sync] error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
