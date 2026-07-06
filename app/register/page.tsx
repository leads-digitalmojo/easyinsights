'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { signOutUser } from '@/lib/firebase';
import { TrendingUp, Building, Globe, AlertCircle, ArrowRight, LogOut } from 'lucide-react';

export default function RegisterPage() {
  const router = useRouter();
  const { user, workspaces, loading } = useAuth();

  const [workspaceName, setWorkspaceName] = useState('');
  const [workspaceSlug, setWorkspaceSlug] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Not signed in → go to login. Already has a workspace → go to it.
  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.push('/login');
    } else if (workspaces.length > 0) {
      router.push(`/${workspaces[0]!.slug}`);
    }
  }, [user, workspaces, loading, router]);

  const handleNameChange = (val: string) => {
    setWorkspaceName(val);
    setWorkspaceSlug(
      val.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-')
    );
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!workspaceName || !workspaceSlug) {
      setError('Please enter a workspace name.');
      return;
    }

    setError('');
    setSubmitting(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/workspaces', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: workspaceName, slug: workspaceSlug }),
      });

      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData.error || 'Failed to create workspace.');
      }
      // AuthContext's workspace listener will pick up the new doc and redirect.
      router.push(`/${resData.slug}`);
    } catch (err: any) {
      setError(err.message || 'An error occurred while creating the workspace.');
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-[120px]" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-[120px]" />

      <div className="w-full max-w-md bg-slate-900/60 backdrop-blur-md border border-slate-800 p-8 rounded-2xl shadow-2xl relative my-8">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/30 mb-4">
            <TrendingUp className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-wider">MOJOINSIGHTS</h1>
          <p className="text-slate-300 text-xs uppercase tracking-widest mt-1">Create a Client Workspace</p>
          {user?.email && (
            <p className="text-slate-400 text-xs mt-2">
              Signed in as <span className="text-indigo-400">{user.email}</span>
            </p>
          )}
        </div>

        {error && (
          <div className="mb-6 px-4 py-3 bg-red-950/40 border border-red-800/60 text-red-300 text-xs rounded-xl flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleCreate} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">Client / Workspace Name</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
                <Building className="w-4 h-4" />
              </span>
              <input
                type="text"
                value={workspaceName}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="e.g. Deevyashakti Realty"
                className="w-full pl-9 pr-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-all duration-200"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">Workspace Slug URL</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
                <Globe className="w-4 h-4" />
              </span>
              <input
                type="text"
                value={workspaceSlug}
                onChange={(e) => setWorkspaceSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, ''))}
                placeholder="deevyashakti-realty"
                className="w-full pl-9 pr-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-sm text-slate-200 placeholder-slate-600 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-all duration-200"
              />
            </div>
            <p className="text-xs text-slate-400 leading-normal pl-1">
              Webhook URL: <span className="text-indigo-400">/api/webhooks/{workspaceSlug || 'slug'}/custom</span>
            </p>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-xl text-sm font-semibold hover:shadow-lg hover:shadow-indigo-500/20 active:scale-95 transition-all duration-150 flex items-center justify-center space-x-2 disabled:opacity-50 disabled:pointer-events-none"
          >
            <span>{submitting ? 'Creating Workspace…' : 'Create Workspace'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <button
          onClick={() => signOutUser().then(() => router.push('/login'))}
          className="mt-6 w-full text-center text-xs text-slate-500 hover:text-slate-300 transition-colors flex items-center justify-center space-x-1.5"
        >
          <LogOut className="w-3 h-3" />
          <span>Sign out</span>
        </button>
      </div>
    </div>
  );
}
