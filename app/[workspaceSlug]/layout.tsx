'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import { Workspace } from '@/types';

export default function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { workspaceSlug: string };
}) {
  const router = useRouter();
  const { user, loading: authLoading, workspaces } = useAuth();

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.push('/login');
      return;
    }

    // Resolve the workspace from the user's loaded list (already scoped to membership)
    const fromContext = workspaces.find(
      (w) => w.slug === params.workspaceSlug.toLowerCase()
    );
    if (fromContext) {
      setWorkspace(fromContext);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'workspaces'),
      where('slug', '==', params.workspaceSlug.toLowerCase())
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (!snapshot.empty) {
          setWorkspace(snapshot.docs[0]!.data() as Workspace);
        } else {
          setWorkspace(null);
        }
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching workspace details:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user, authLoading, workspaces, params.workspaceSlug, router]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-indigo-500 mb-4" />
        <span className="text-xs uppercase tracking-widest text-slate-300 font-bold">
          Synchronizing Workspace Tenant...
        </span>
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white p-6">
        <h1 className="text-2xl font-bold text-red-500 mb-2">Tenant Not Found</h1>
        <p className="text-slate-300 text-sm text-center mb-6 max-w-md">
          The workspace slug{' '}
          <code className="text-indigo-400 font-mono">/{params.workspaceSlug}</code> does
          not exist, or your account does not have access permissions.
        </p>
        <button
          onClick={() => router.push('/register')}
          className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl text-sm font-semibold hover:shadow-lg hover:shadow-indigo-500/20 active:scale-95 transition-all duration-150"
        >
          Create Workspace
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden font-sans" style={{ backgroundColor: '#F5F5F5', fontFamily: 'Inter, sans-serif' }}>
      {/* Left Sidebar Menu */}
      <Sidebar workspaceSlug={workspace.slug} />

      {/* Content Frame */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Navigation Navbar */}
        <TopBar
          workspaceName={workspace.name}
          workspaceSlug={workspace.slug}
          userEmail={user?.email}
        />

        {/* Scrollable Viewport */}
        <main className="flex-1 overflow-y-auto p-8 scrollbar-thin" style={{ backgroundColor: '#F5F5F5' }}>
          {children}
        </main>
      </div>
    </div>
  );
}
