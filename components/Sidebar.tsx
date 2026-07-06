'use client';

import React, { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import {
  Home,
  Activity,
  Users,
  GitFork,
  Database,
  Settings,
  X,
  Building,
  Plus,
  ChevronDown,
  LogOut,
} from 'lucide-react';

interface SidebarProps {
  workspaceSlug: string;
}

export default function Sidebar({ workspaceSlug }: SidebarProps) {
  const pathname = usePathname() || '';
  const router = useRouter();
  const { workspaces, user } = useAuth();

  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const workspaceRef = useRef<HTMLDivElement>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [newWorkspaceSlug, setNewWorkspaceSlug] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const activeWorkspace = workspaces.find((w) => w.slug === workspaceSlug);
  const handleSignOut = () => signOut(auth).then(() => router.push('/login'));

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (workspaceRef.current && !workspaceRef.current.contains(e.target as Node)) {
        setWorkspaceOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleNameChange = (val: string) => {
    setNewWorkspaceName(val);
    setNewWorkspaceSlug(
      val.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-')
    );
  };

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkspaceName.trim() || !newWorkspaceSlug.trim()) {
      setError('Please fill in both name and slug.');
      return;
    }
    if (!user) {
      setError('You must be signed in to create a workspace.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: newWorkspaceName.trim(), slug: newWorkspaceSlug.trim() }),
      });
      const resData = await response.json();
      if (!response.ok) throw new Error(resData.error || 'Failed to provision workspace.');
      setShowCreateModal(false);
      setNewWorkspaceName('');
      setNewWorkspaceSlug('');
      router.push(`/${resData.slug}`);
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setSubmitting(false);
    }
  };

  const menuGroups = [
    {
      group: '',
      items: [{ name: 'Home', href: `/${workspaceSlug}`, icon: Home }],
    },
    {
      group: 'Signals',
      items: [
        { name: 'Conversions', href: `/${workspaceSlug}/conversions`, icon: Activity },
        { name: 'Audiences',   href: `/${workspaceSlug}/audiences`,   icon: Users },
        { name: 'Workflow',    href: `/${workspaceSlug}/workflow`,     icon: GitFork },
      ],
    },
    {
      group: 'Tracking',
      items: [{ name: 'Leads', href: `/${workspaceSlug}/leads`, icon: Database }],
    },
    {
      group: 'Management',
      items: [{ name: 'Settings', href: `/${workspaceSlug}/settings`, icon: Settings }],
    },
  ];

  return (
    <aside
      className="flex flex-col h-screen shrink-0 overflow-y-auto select-none"
      style={{ width: 280, backgroundColor: '#FAFAFA', borderRight: '1px solid #E8E8E8', fontFamily: 'Inter, sans-serif' }}
    >
      {/* ── Brand ── */}
      <div className="flex items-center space-x-3 px-5 py-5" style={{ borderBottom: '1px solid #EEEEEE' }}>
        <Image
          src="/logo.png"
          alt="MOJOINSIGHTS Logo"
          width={36}
          height={36}
          className="shrink-0"
          style={{ objectFit: 'contain' }}
        />
        <div>
          <div className="font-bold leading-none" style={{ fontSize: 17, color: '#1A1A1A', letterSpacing: '-0.3px' }}>
            MOJOINSIGHTS
          </div>
          <div
            className="uppercase font-semibold tracking-widest mt-0.5"
            style={{ fontSize: 9, color: '#9A9A9A' }}
          >
            AdSync Platform
          </div>
        </div>
      </div>

      {/* ── Workspace section ── */}
      <div className="px-4 pt-5 pb-3">
        <div
          className="uppercase font-bold tracking-widest mb-2.5 px-1"
          style={{ fontSize: 10, color: '#9A9A9A', letterSpacing: '0.1em' }}
        >
          Workspace
        </div>

        <div ref={workspaceRef} className="relative">
          <button
            onClick={() => setWorkspaceOpen((v) => !v)}
            className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl transition-all duration-150"
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #E0E0E0',
              boxShadow: workspaceOpen ? '0 2px 8px rgba(0,0,0,0.08)' : '0 1px 3px rgba(0,0,0,0.04)',
            }}
          >
            {/* Workspace avatar */}
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 font-extrabold"
              style={{ backgroundColor: '#FFF8E0', color: '#B8860B', fontSize: 13 }}
            >
              {(activeWorkspace?.name || workspaceSlug).charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 text-left min-w-0">
              <div className="font-bold truncate leading-tight" style={{ fontSize: 14, color: '#1A1A1A' }}>
                {activeWorkspace?.name || workspaceSlug}
              </div>
              <div className="mt-0.5" style={{ fontSize: 11, color: '#9A9A9A' }}>
                Client
              </div>
            </div>
            <ChevronDown
              className="shrink-0 transition-transform duration-200"
              style={{
                width: 14,
                height: 14,
                color: '#9A9A9A',
                transform: workspaceOpen ? 'rotate(180deg)' : 'rotate(0deg)',
              }}
            />
          </button>

          {workspaceOpen && workspaces.length > 1 && (
            <div
              className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl overflow-hidden"
              style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E0E0', boxShadow: '0 4px 16px rgba(0,0,0,0.10)' }}
            >
              {workspaces.map((w) => {
                const isCurrent = w.slug === workspaceSlug;
                return (
                  <button
                    key={w.id}
                    onClick={() => { router.push(`/${w.slug}`); setWorkspaceOpen(false); }}
                    className="w-full flex items-center space-x-2.5 px-3 py-2.5 text-left transition-colors"
                    style={{
                      backgroundColor: isCurrent ? '#FFF8E0' : 'transparent',
                      borderBottom: '1px solid #F0F0F0',
                    }}
                    onMouseEnter={(e) => { if (!isCurrent) (e.currentTarget as HTMLElement).style.backgroundColor = '#FAFAFA'; }}
                    onMouseLeave={(e) => { if (!isCurrent) (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
                  >
                    <div
                      className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 font-bold"
                      style={{ backgroundColor: isCurrent ? '#F5C518' : '#F0F0F0', color: isCurrent ? '#1A1A1A' : '#5A5A5A', fontSize: 10 }}
                    >
                      {w.name.charAt(0).toUpperCase()}
                    </div>
                    <span
                      className="truncate font-semibold"
                      style={{ fontSize: 13, color: isCurrent ? '#1A1A1A' : '#5A5A5A' }}
                    >
                      {w.name}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Divider ── */}
      <div style={{ height: 1, backgroundColor: '#EEEEEE', margin: '4px 0' }} />

      {/* ── Navigation ── */}
      <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
        {menuGroups.map((group, gi) => (
          <div key={gi}>
            {group.group && (
              <div
                className="uppercase font-bold tracking-widest mb-2 px-2"
                style={{ fontSize: 10, color: '#9A9A9A', letterSpacing: '0.1em' }}
              >
                {group.group}
              </div>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = pathname === item.href;
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="flex items-center space-x-3 px-3 rounded-xl transition-all duration-150"
                      style={{
                        height: 52,
                        backgroundColor: isActive ? '#F5C518' : 'transparent',
                        color: isActive ? '#1A1A1A' : '#5A5A5A',
                        fontWeight: isActive ? 700 : 600,
                        fontSize: 13,
                        letterSpacing: '0.03em',
                        textTransform: 'uppercase',
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) (e.currentTarget as HTMLElement).style.backgroundColor = '#FFF8E0';
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                      }}
                    >
                      <Icon
                        style={{
                          width: 16,
                          height: 16,
                          color: isActive ? '#1A1A1A' : '#9A9A9A',
                          flexShrink: 0,
                        }}
                      />
                      <span>{item.name}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* ── Footer ── */}
      <div
        className="px-4 py-3 space-y-2"
        style={{ borderTop: '1px solid #E8E8E8', backgroundColor: '#FFFFFF' }}
      >
        {/* Sync status + user */}
        <div className="flex items-center space-x-2 px-1">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: '#4CAF50', boxShadow: '0 0 4px #4CAF5066' }}
          />
          <span className="flex-1 truncate" style={{ fontSize: 11, color: '#9A9A9A' }}>
            {user?.email ?? 'operator'}
          </span>
          <button
            onClick={handleSignOut}
            title="Sign out"
            className="transition-opacity hover:opacity-60"
          >
            <LogOut style={{ width: 13, height: 13, color: '#9A9A9A' }} />
          </button>
        </div>

        {/* Add client */}
        <button
          onClick={() => setShowCreateModal(true)}
          className="w-full flex items-center justify-center space-x-1.5 rounded-xl transition-all duration-150"
          style={{
            height: 36,
            backgroundColor: '#F5F5F5',
            border: '1px solid #E0E0E0',
            color: '#5A5A5A',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#F5C518'; (e.currentTarget as HTMLElement).style.color = '#1A1A1A'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#E0E0E0'; (e.currentTarget as HTMLElement).style.color = '#5A5A5A'; }}
        >
          <Plus style={{ width: 13, height: 13 }} />
          <span>Add Client Tenant</span>
        </button>
      </div>

      {/* ── Create workspace modal ── */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)' }}
        >
          <div
            className="w-full max-w-sm p-6 rounded-2xl relative"
            style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E0E0', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}
          >
            <button
              onClick={() => setShowCreateModal(false)}
              className="absolute top-4 right-4 transition-opacity hover:opacity-50"
            >
              <X style={{ width: 16, height: 16, color: '#9A9A9A' }} />
            </button>

            <div className="flex items-center space-x-3 mb-6">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: '#FFF8E0', border: '1px solid #F5C518' }}
              >
                <Building style={{ width: 16, height: 16, color: '#B8860B' }} />
              </div>
              <div>
                <div className="font-bold" style={{ fontSize: 15, color: '#1A1A1A' }}>New Client Tenant</div>
                <div className="uppercase tracking-widest font-semibold mt-0.5" style={{ fontSize: 9, color: '#9A9A9A' }}>
                  Provision Workspace
                </div>
              </div>
            </div>

            {error && (
              <div
                className="mb-4 px-3 py-2 rounded-xl text-xs"
                style={{ backgroundColor: '#FFF0F0', border: '1px solid #FFCCCC', color: '#CC0000' }}
              >
                {error}
              </div>
            )}

            <form onSubmit={handleCreateWorkspace} className="space-y-4">
              <div>
                <label
                  className="block uppercase tracking-widest font-bold mb-1.5"
                  style={{ fontSize: 10, color: '#9A9A9A' }}
                >
                  Client Name
                </label>
                <input
                  type="text"
                  value={newWorkspaceName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="e.g. Amara Realty"
                  className="w-full px-3 py-2.5 rounded-xl outline-none transition-all"
                  style={{
                    border: '1px solid #E0E0E0',
                    fontSize: 13,
                    color: '#1A1A1A',
                    backgroundColor: '#FAFAFA',
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = '#F5C518'; e.currentTarget.style.boxShadow = '0 0 0 3px #F5C51820'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = '#E0E0E0'; e.currentTarget.style.boxShadow = 'none'; }}
                />
              </div>
              <div>
                <label
                  className="block uppercase tracking-widest font-bold mb-1.5"
                  style={{ fontSize: 10, color: '#9A9A9A' }}
                >
                  URL Slug
                </label>
                <input
                  type="text"
                  value={newWorkspaceSlug}
                  onChange={(e) => setNewWorkspaceSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, ''))}
                  placeholder="amara-realty"
                  className="w-full px-3 py-2.5 rounded-xl outline-none transition-all font-mono"
                  style={{
                    border: '1px solid #E0E0E0',
                    fontSize: 12,
                    color: '#1A1A1A',
                    backgroundColor: '#FAFAFA',
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = '#F5C518'; e.currentTarget.style.boxShadow = '0 0 0 3px #F5C51820'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = '#E0E0E0'; e.currentTarget.style.boxShadow = 'none'; }}
                />
              </div>
              <div
                className="flex items-center justify-end space-x-2 pt-4"
                style={{ borderTop: '1px solid #F0F0F0' }}
              >
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl font-bold transition-colors"
                  style={{ fontSize: 12, backgroundColor: '#F5F5F5', color: '#5A5A5A', border: '1px solid #E0E0E0' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = '#EEEEEE'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = '#F5F5F5'; }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl font-bold transition-all disabled:opacity-50"
                  style={{ fontSize: 12, backgroundColor: '#F5C518', color: '#1A1A1A' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = '#FFBF00'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = '#F5C518'; }}
                >
                  {submitting ? 'Creating...' : 'Provision'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </aside>
  );
}
