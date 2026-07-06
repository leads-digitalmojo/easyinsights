import { adminDb } from './firebaseAdmin';

/**
 * Finds a workspace document by slug and returns a merged object that supports:
 *   workspace.webhook_secret  — direct field access (webhook/leads routes)
 *   docSnap.id                — document id
 *   docSnap.ref               — Firestore reference (write-back)
 *   docSnap.data()            — explicit data access
 *
 * Returns null if no workspace exists for the slug. Workspaces are created
 * only through the explicit registration flow (POST /api/workspaces), never
 * auto-seeded here — that previously caused junk workspaces for any slug hit.
 */
export async function getWorkspaceBySlug(slug: string) {
  const normalised = slug.toLowerCase();

  const snap = await adminDb
    .collection('workspaces')
    .where('slug', '==', normalised)
    .limit(1)
    .get();

  if (snap.empty) return null;
  return toWorkspaceDoc(snap.docs[0]!);
}

function toWorkspaceDoc(doc: any) {
  const data = doc.data();
  return {
    ...data,
    id: doc.id,
    ref: doc.ref,
    data: () => data,
  };
}
