import { adminAuth, isMockEnvironment } from './firebaseAdmin';
import getMemberRole from './permissions';

export type AuthResult =
  | { uid: string; role: string }
  | { error: string; status: 401 | 403 };

const MOCK_UID = 'mock-uid-123';

export async function requireWorkspaceMember(
  request: Request,
  workspaceId: string
): Promise<AuthResult> {
  // Only bypass when there is no real Firebase backend at all (local sandbox).
  if (isMockEnvironment) {
    const role = await getMemberRole(workspaceId, MOCK_UID);
    return role ? { uid: MOCK_UID, role } : { error: 'Forbidden', status: 403 };
  }

  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: 'Unauthorized', status: 401 };
  }

  try {
    const token = authHeader.slice(7);
    const decoded = await adminAuth.verifyIdToken(token);
    const role = await getMemberRole(workspaceId, decoded.uid);
    if (!role) return { error: 'Forbidden', status: 403 };
    return { uid: decoded.uid, role };
  } catch {
    return { error: 'Unauthorized', status: 401 };
  }
}
