'use client';

import { useParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export function useWorkspace() {
  const { workspaces, activeWorkspace, setActiveWorkspace, loading, user } = useAuth();
  const params = useParams();
  const slug = params?.workspaceSlug as string | undefined;

  // Always resolve from the URL slug so switching tenants never leaks data
  const resolvedWorkspace = slug
    ? (workspaces.find((w) => w.slug === slug.toLowerCase()) ?? null)
    : activeWorkspace;

  return {
    workspaces,
    activeWorkspace: resolvedWorkspace,
    setActiveWorkspace,
    loading,
    user,
  };
}
