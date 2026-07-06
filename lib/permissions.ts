import { adminDb } from './firebaseAdmin';

/**
 * Returns role for a given user UID in a workspace.
 * Fallbacks: owner_uid => 'Owner'; members_v2 subcollection => stored role; members array => 'Admin'; otherwise null.
 */
export async function getMemberRole(workspaceId: string, uid: string): Promise<string | null> {
  if (!workspaceId || !uid) return null;

  try {
    const wsRef = adminDb.collection('workspaces').doc(workspaceId);
    const wsSnap = await wsRef.get();
    if (!wsSnap.exists) return null;
    const ws = wsSnap.data() as any;

    if (ws.owner_uid === uid) return 'Owner';

    // Try members_v2 richer subcollection
    try {
      const membersSnap = await wsRef.collection('members_v2').where('uid', '==', uid).limit(1).get();
      if (!membersSnap.empty) {
        const member = membersSnap.docs[0]!.data() as any;
        return member.role || 'Admin';
      }
    } catch (e) {
      // ignore
    }

    // Fallback to legacy members array
    if (Array.isArray(ws.members) && ws.members.includes(uid)) return 'Admin';

    return null;
  } catch (err) {
    console.warn('getMemberRole error', err);
    return null;
  }
}

export default getMemberRole;
