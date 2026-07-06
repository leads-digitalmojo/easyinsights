'use client';

import { auth } from '@/lib/firebase';

/**
 * Client-side fetch wrapper that attaches the current Firebase user's ID token
 * as a Bearer Authorization header. Use for all calls to protected API routes
 * (anything guarded server-side by requireWorkspaceMember).
 */
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const user = auth.currentUser;
  const token = user ? await user.getIdToken() : null;

  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers as Record<string, string> | undefined),
    },
  });
}
