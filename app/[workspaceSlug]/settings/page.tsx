'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useWorkspace } from '@/hooks/useWorkspace';
import { Workspace } from '@/types';
import {
  Settings,
  Percent,
  Link as LinkIcon,
  Copy,
  Check,
  Save,
  Users,
  AlertCircle,
  Eye,
  EyeOff,
  Trash2,
  RefreshCw,
  ShieldAlert,
  ArrowRight,
  Info,
} from 'lucide-react';

const Facebook = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={props.className}
  >
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
  </svg>
);

export default function SettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { activeWorkspace, setActiveWorkspace, user } = useWorkspace();

  const authFetch = async (url: string, options: RequestInit = {}) => {
    const token = user ? await (user as any).getIdToken?.() : null;
    return fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers as Record<string, string> | undefined),
      },
    });
  };
  const [workspace, setWorkspace] = useState<Workspace | null>(null);

  // Active Tab State
  const [activeTab, setActiveTab] = useState<'workspace' | 'meta' | 'google' | 'webhooks' | 'members' | 'selldo'>('workspace');

  // Workspace Form fields
  const [wsName, setWsName] = useState('');
  const [wsSlug, setWsSlug] = useState('');

  // Meta integration fields
  const [metaPixelId, setMetaPixelId] = useState('');
  const [metaAdAccountId, setMetaAdAccountId] = useState('');
  const [metaAccessToken, setMetaAccessToken] = useState('');
  const [showMetaToken, setShowMetaToken] = useState(false);
  const [metaTestEventCode, setMetaTestEventCode] = useState('');
  const [metaTestStatus, setMetaTestStatus] = useState<{ status: 'idle' | 'testing' | 'success' | 'error'; message?: string }>({ status: 'idle' });

  // Google integration fields
  const [googleCustomerId, setGoogleCustomerId] = useState('');
  const [googleDevToken, setGoogleDevToken] = useState('');
  const [showGoogleToken, setShowGoogleToken] = useState(false);
  const [googleTestStatus, setGoogleTestStatus] = useState<{ status: 'idle' | 'testing' | 'success' | 'error'; message?: string }>({ status: 'idle' });

  // Webhook states
  const [newSecretOnce, setNewSecretOnce] = useState<string | null>(null);
  const [showSecretRegenModal, setShowSecretRegenModal] = useState(false);

  // Sell.do Sync fields
  const [selldoApiKey, setSelldoApiKey] = useState('');
  const [showSelldoKey, setShowSelldoKey] = useState(false);
  const [selldoSaving, setSelldoSaving] = useState(false);
  const [selldoSyncing, setSelldoSyncing] = useState(false);
  const [selldoLastSynced, setSelldoLastSynced] = useState<string | null>(null);
  const [selldoSyncResult, setSelldoSyncResult] = useState<{ fetched?: number; processed?: number; error?: string } | null>(null);

  // Custom stage mappings
  const [customMappings, setCustomMappings] = useState<{ crm_value: string; internal_status: string }[]>([]);
  const [mappingsSaving, setMappingsSaving] = useState(false);

  // Deletion Modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  // Universal loaders & feedback
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  // Members state
  const [members, setMembers] = useState<any[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  // Subscribe to real-time updates for active workspace details
  useEffect(() => {
    if (!activeWorkspace?.slug) return;

    const fetchWorkspaceDetails = async () => {
      try {
        const res = await fetch(`/api/workspaces/${activeWorkspace.slug}`);
        if (res.ok) {
          const data = await res.json();
          setWorkspace(data);
          setWsName(data.name || '');
          setWsSlug(data.slug || '');
          setMetaPixelId(data.meta_pixel_id || '');
          setMetaAdAccountId(data.meta_ad_account_id || '');
          setGoogleCustomerId(data.google_ads_customer_id || '');
          setSelldoApiKey(data.selldo_api_key || '');
          if (data.selldo_last_synced_at) {
            const ts = data.selldo_last_synced_at;
            setSelldoLastSynced(new Date(ts.seconds ? ts.seconds * 1000 : ts).toLocaleString());
          }
          const map = data.custom_stage_map || {};
          setCustomMappings(Object.entries(map).map(([crm_value, internal_status]) => ({ crm_value, internal_status: internal_status as string })));
        } else {
          // API unavailable (mock/offline env) — use activeWorkspace directly
          setWorkspace(activeWorkspace as any);
          setWsName(activeWorkspace.name || '');
          setWsSlug(activeWorkspace.slug || '');
          setMetaPixelId(activeWorkspace.meta_pixel_id || '');
          setGoogleCustomerId(activeWorkspace.google_ads_customer_id || '');
        }
      } catch (err) {
        console.error('Error fetching settings workspace document:', err);
        setWorkspace(activeWorkspace as any);
        setWsName(activeWorkspace.name || '');
        setWsSlug(activeWorkspace.slug || '');
        setMetaPixelId(activeWorkspace.meta_pixel_id || '');
        setGoogleCustomerId(activeWorkspace.google_ads_customer_id || '');
      }
    };

    fetchWorkspaceDetails();

    // Check url search params for OAuth returns
    if (searchParams.get('google_success') === 'true') {
      showToast('success', 'Google Ads account linked successfully!');
      setActiveTab('google');
      router.replace(`/${activeWorkspace.slug}/settings`);
    } else if (searchParams.get('google_error')) {
      showToast('error', `Google OAuth Failed: ${searchParams.get('google_error')}`);
      setActiveTab('google');
      router.replace(`/${activeWorkspace.slug}/settings`);
    }
  }, [activeWorkspace?.slug, searchParams]);

  // Fetch members when members tab is active
  useEffect(() => {
    const fetchMembers = async () => {
      if (!activeWorkspace?.slug) return;
      setMembersLoading(true);
      try {
        const res = await fetch(`/api/workspaces/${activeWorkspace.slug}/members`);
        if (res.ok) {
          const data = await res.json();
          setMembers(data || []);
        } else {
          setMembers([]);
        }
      } catch (e) {
        console.error('Error fetching members', e);
        setMembers([]);
      } finally {
        setMembersLoading(false);
      }
    };

    if (activeTab === 'members') fetchMembers();
  }, [activeTab, activeWorkspace?.slug]);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  // Automatically formats Google Ads Customer ID input to: xxx-xxx-xxxx
  const handleGoogleCustomerIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value.replace(/\D/g, '');
    let formatted = rawVal;
    if (rawVal.length > 3 && rawVal.length <= 6) {
      formatted = `${rawVal.slice(0, 3)}-${rawVal.slice(3)}`;
    } else if (rawVal.length > 6) {
      formatted = `${rawVal.slice(0, 3)}-${rawVal.slice(3, 6)}-${rawVal.slice(6, 10)}`;
    }
    setGoogleCustomerId(formatted);
  };

  // Tab 1: Save Workspace Details
  const handleSaveWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspace) return;
    setSaving(true);

    try {
      const res = await authFetch(`/api/workspaces/${workspace.slug}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: wsName, slug: wsSlug }),
      });

      const data = await res.json();
      if (res.ok) {
        showToast('success', 'Workspace details saved successfully!');
        if (wsSlug !== workspace.slug) {
          const updatedWorkspace = { ...workspace, slug: wsSlug, name: wsName };
          setActiveWorkspace(updatedWorkspace);
          router.push(`/${wsSlug}/settings`);
        }
      } else {
        showToast('error', data.error || 'Failed to update workspace details.');
      }
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setSaving(false);
    }
  };

  // Tab 1: Delete Workspace
  const handleDeleteWorkspace = async () => {
    if (!workspace || deleteConfirmText !== workspace.name) {
      showToast('error', 'Confirmation name does not match.');
      return;
    }
    setSaving(true);

    try {
      const res = await authFetch(`/api/workspaces/${workspace.slug}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        showToast('success', 'Workspace deleted. Redirecting to home...');
        setTimeout(() => {
          router.push('/');
        }, 1500);
      } else {
        const data = await res.json();
        showToast('error', data.error || 'Deletion request failed.');
      }
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setSaving(false);
      setShowDeleteModal(false);
    }
  };

  // Tab 2: Test Meta Connection — sends a REAL CAPI test event server-side
  const handleTestMetaConnection = async () => {
    if (!workspace) return;
    if (!metaPixelId || !metaAccessToken) {
      setMetaTestStatus({ status: 'error', message: 'Enter Pixel ID and Token first.' });
      return;
    }
    setMetaTestStatus({ status: 'testing' });

    try {
      const res = await authFetch(`/api/workspaces/${workspace.slug}/meta/test`, {
        method: 'POST',
        body: JSON.stringify({
          pixel_id: metaPixelId,
          access_token: metaAccessToken,
          test_event_code: metaTestEventCode || undefined,
        }),
      });
      const data = await res.json();
      setMetaTestStatus({
        status: data.ok ? 'success' : 'error',
        message: data.message || (data.ok ? 'Verified.' : 'Verification failed.'),
      });
    } catch (err: any) {
      setMetaTestStatus({ status: 'error', message: err.message || 'Verification request failed.' });
    }
  };

  // Tab 2: Save Meta Connection
  const handleSaveMeta = async () => {
    if (!workspace) return;
    setSaving(true);

    try {
      const res = await authFetch(`/api/workspaces/${workspace.slug}/meta`, {
        method: 'POST',
        body: JSON.stringify({
          pixel_id: metaPixelId,
          access_token: metaAccessToken,
          ad_account_id: metaAdAccountId || undefined,
          test_event_code: metaTestEventCode || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        showToast('success', `Meta credentials updated. Active Pixel: "${data.pixel_name}"`);
        setWorkspace((prev) => prev ? { ...prev, meta_pixel_id: metaPixelId, meta_pixel_name: data.pixel_name } as any : null);
      } else {
        showToast('error', data.error || 'Failed to update credentials.');
      }
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setSaving(false);
    }
  };

  // Tab 3: Google Ads Trigger OAuth Connect
  const handleGoogleOAuthConnect = () => {
    if (!workspace) return;
    // Server-side route reads GOOGLE_CLIENT_ID and either redirects to Google
    // or falls back to sandbox simulation when no credentials are configured.
    window.location.href = `/api/workspaces/${workspace.slug}/google/connect`;
  };

  // Tab 3: Test Google Connection
  const handleTestGoogleConnection = async () => {
    if (!googleCustomerId || !googleDevToken) {
      setGoogleTestStatus({ status: 'error', message: 'Enter Customer ID and Dev Token.' });
      return;
    }
    setGoogleTestStatus({ status: 'testing' });

    try {
      const res = await authFetch(`/api/workspaces/${activeWorkspace?.slug}/google/test`, {
        method: 'POST',
        body: JSON.stringify({
          customer_id: googleCustomerId,
          developer_token: googleDevToken,
        }),
      });
      const data = await res.json();
      setGoogleTestStatus({
        status: data.ok ? 'success' : 'error',
        message: data.message || (data.ok ? 'Google Ads credentials verified.' : 'Validation failed.'),
      });
    } catch (err: any) {
      setGoogleTestStatus({ status: 'error', message: err.message || 'Network error contacting server.' });
    }
  };

  // Tab 3: Save Google Ads Dev credentials
  const handleSaveGoogleDevToken = async () => {
    if (!workspace) return;
    setSaving(true);

    try {
      const res = await authFetch(`/api/workspaces/${workspace.slug}/google`, {
        method: 'POST',
        body: JSON.stringify({ customer_id: googleCustomerId, developer_token: googleDevToken }),
      });

      if (res.ok) {
        showToast('success', 'Google Ads developer credentials updated successfully.');
        setWorkspace((prev) => prev ? { ...prev, google_ads_customer_id: googleCustomerId } as any : null);
      } else {
        const data = await res.json();
        showToast('error', data.error || 'Failed to update Google Ads configurations.');
      }
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setSaving(false);
    }
  };

  // Tab 4: Regenerate Webhook Secret
  const handleRegenerateSecret = async () => {
    if (!workspace) return;
    setSaving(true);
    setNewSecretOnce(null);

    try {
      const res = await authFetch(`/api/workspaces/${workspace.slug}/webhook-secret`, {
        method: 'POST',
      });

      const data = await res.json();
      if (res.ok && data.secret) {
        setNewSecretOnce(data.secret);
        setWorkspace((prev) => prev ? { ...prev, webhook_secret: data.secret } : null);
        showToast('success', 'Webhook secret regenerated successfully.');
      } else {
        showToast('error', data.error || 'Failed to regenerate webhook secret.');
      }
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setSaving(false);
      setShowSecretRegenModal(false);
    }
  };

  const handleSaveMappings = async () => {
    if (!activeWorkspace?.slug) return;
    setMappingsSaving(true);
    try {
      const mappingsRecord: Record<string, string> = {};
      for (const row of customMappings) {
        if (row.crm_value.trim() && row.internal_status.trim()) {
          mappingsRecord[row.crm_value.trim()] = row.internal_status.trim();
        }
      }
      const res = await fetch(`/api/workspaces/${activeWorkspace.slug}/stage-mappings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappings: mappingsRecord }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast('success', 'Custom stage mappings saved.');
      } else {
        showToast('error', data.error || 'Failed to save mappings.');
      }
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setMappingsSaving(false);
    }
  };

  const getWebhookUrl = (crmType: string) => {
    if (typeof window === 'undefined') return '';
    const origin = window.location.origin;
    return `${origin}/api/webhooks/${activeWorkspace?.slug}/${crmType}`;
  };

  const handleCopyWebhook = (crmType: string) => {
    const url = getWebhookUrl(crmType);
    navigator.clipboard.writeText(url);
    setCopiedUrl(crmType);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  return (
    <div className="space-y-6 max-w-5xl animate-fadeIn relative pb-10">
      
      {/* Toast Alert */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center space-x-2 px-4 py-3 rounded-xl shadow-lg border text-xs font-bold transition-all duration-300 transform translate-y-0 ${
          toast.type === 'success' 
            ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/30' 
            : 'bg-rose-950/90 text-rose-300 border-rose-500/30'
        }`}>
          <Info className="w-4 h-4 shrink-0" />
          <span>{toast.message}</span>
        </div>
      )}

      {/* Title */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center space-x-2" style={{ color: 'black' }}>
            <Settings className="w-5 h-5 text-indigo-400" />
            <span>Workspace Settings</span>
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Manage your workspace configuration, set up advertising API channels, and obtain webhook URLs.
          </p>
        </div>
        
        {workspace && (
          <div className="text-right text-xs text-slate-400 font-mono">
            <div>ID: {workspace.id}</div>
            <div className="mt-0.5">Created: {new Date(workspace.created_at || '').toLocaleDateString()}</div>
          </div>
        )}
      </div>

      {/* Tabs Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Navigation Sidebar */}
        <div className="space-y-1">
          <button
            onClick={() => setActiveTab('workspace')}
            className={`w-full text-left px-4 py-3 rounded-xl text-xs font-bold transition-all duration-150 flex items-center justify-between ${
              activeTab === 'workspace'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-white text-black hover:bg-slate-100'
            }`}
          >
            <span>Workspace Config</span>
            <ArrowRight className={`w-3.5 h-3.5 transition-transform ${activeTab === 'workspace' ? 'translate-x-0' : '-translate-x-1 opacity-0'}`} />
          </button>

          <button
            onClick={() => setActiveTab('meta')}
            className={`w-full text-left px-4 py-3 rounded-xl text-xs font-bold transition-all duration-150 flex items-center justify-between ${
              activeTab === 'meta'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-white text-black hover:bg-slate-100'
            }`}
          >
            <span>Meta CAPI Integration</span>
            <Facebook className="w-3.5 h-3.5 shrink-0" />
          </button>

          <button
            onClick={() => setActiveTab('members')}
            className={`w-full text-left px-4 py-3 rounded-xl text-xs font-bold transition-all duration-150 flex items-center justify-between ${
              activeTab === 'members'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-white text-black hover:bg-slate-100'
            }`}
          >
            <span>Members</span>
            <Users className="w-3.5 h-3.5 shrink-0" />
          </button>

          <button
            onClick={() => setActiveTab('google')}
            className={`w-full text-left px-4 py-3 rounded-xl text-xs font-bold transition-all duration-150 flex items-center justify-between ${
              activeTab === 'google'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-white text-black hover:bg-slate-100'
            }`}
          >
            <span>Google Ads API</span>
            <Percent className="w-3.5 h-3.5 shrink-0" />
          </button>

          <button
            onClick={() => setActiveTab('webhooks')}
            className={`w-full text-left px-4 py-3 rounded-xl text-xs font-bold transition-all duration-150 flex items-center justify-between ${
              activeTab === 'webhooks'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-white text-black hover:bg-slate-100'
            }`}
          >
            <span>Webhooks Registry</span>
            <LinkIcon className="w-3.5 h-3.5 shrink-0" />
          </button>

          <button
            onClick={() => setActiveTab('selldo')}
            className={`w-full text-left px-4 py-3 rounded-xl text-xs font-bold transition-all duration-150 flex items-center justify-between ${
              activeTab === 'selldo'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-white text-black hover:bg-slate-100'
            }`}
          >
            <span>Sell.do Sync</span>
            <RefreshCw className="w-3.5 h-3.5 shrink-0" />
          </button>
        </div>

        {/* Tab Contents Panel */}
        <div className="lg:col-span-3 bg-slate-900 border border-slate-800 rounded-2xl p-6 min-h-[400px]">
          
          {/* TAB 1: WORKSPACE */}
          {activeTab === 'workspace' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-bold text-slate-100">Workspace Management</h3>
                <p className="text-xs text-slate-300 mt-0.5">Edit tenant names and customize application route slug properties.</p>
              </div>

              <form onSubmit={handleSaveWorkspace} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">Workspace Name</label>
                    <input
                      type="text"
                      value={wsName}
                      onChange={(e) => setWsName(e.target.value)}
                      required
                      placeholder="e.g. My Workspace"
                      className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-transparent transition-all"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">Workspace Slug</label>
                    <input
                      type="text"
                      value={wsSlug}
                      onChange={(e) => setWsSlug(e.target.value)}
                      required
                      placeholder="e.g. my-workspace"
                      className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-transparent transition-all"
                    />
                  </div>
                </div>

                <div className="pt-2 flex justify-start">
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow-md transition-all duration-150"
                  >
                    <Save className="w-4 h-4 shrink-0" />
                    <span>{saving ? 'Saving...' : 'Save Workspace Config'}</span>
                  </button>
                </div>
              </form>

              {/* Danger Zone */}
              <div className="mt-8 pt-6 border-t border-slate-800 space-y-4">
                <div className="flex items-center space-x-2 text-rose-500">
                  <ShieldAlert className="w-4.5 h-4.5 shrink-0" />
                  <span className="text-xs font-bold uppercase tracking-wider">Danger Zone</span>
                </div>
                <div className="bg-rose-950/20 border border-rose-500/20 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-100 text-xs block">Delete this workspace</span>
                    <span className="text-xs text-slate-300 leading-relaxed block mt-0.5 max-w-md">
                      Permanently purges workspace attributes, custom webhook rules, tracked leads ledger history, and Google/Meta conversion event charts. This is irreversible.
                    </span>
                  </div>
                  <button
                    onClick={() => setShowDeleteModal(true)}
                    className="flex items-center space-x-1.5 bg-rose-900/60 hover:bg-rose-800 text-rose-300 border border-rose-500/30 px-4 py-2 rounded-xl text-xs font-bold transition-all"
                  >
                    <Trash2 className="w-4 h-4 shrink-0" />
                    <span>Delete Workspace</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: META INTEGRATION */}
          {/* TAB: MEMBERS */}
          {activeTab === 'members' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-bold text-slate-100 flex items-center space-x-2">
                  <Users className="w-4 h-4 text-indigo-400" />
                  <span>Workspace Members</span>
                </h3>
                <p className="text-xs text-slate-300 mt-0.5">Invite, assign roles, and manage access for this workspace.</p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                <div className="mb-4">
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!workspace) return;
                      const form = e.target as HTMLFormElement;
                      const email = (form.elements.namedItem('invite_email') as HTMLInputElement).value;
                      const role = (form.elements.namedItem('invite_role') as HTMLSelectElement).value;
                      if (!email) return;
                      try {
                        const res = await authFetch(`/api/workspaces/${workspace.slug}/members`, {
                          method: 'POST',
                          body: JSON.stringify({ email, role }),
                        });
                        if (res.ok) {
                          setToast({ type: 'success', message: 'Invitation recorded.' });
                          // refresh members
                          const listRes = await fetch(`/api/workspaces/${workspace.slug}/members`);
                          const list = await listRes.json();
                          setMembers(list || []);
                          form.reset();
                        } else {
                          const err = await res.json();
                          setToast({ type: 'error', message: err.error || 'Invite failed' });
                        }
                      } catch (err: any) {
                        setToast({ type: 'error', message: err.message });
                      }
                    }}
                  >
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <input name="invite_email" type="email" placeholder="user@example.com" className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-200" required />
                      <select name="invite_role" className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-200">
                        <option value="Admin">Admin</option>
                        <option value="Owner">Owner</option>
                      </select>
                      <div className="flex items-center">
                        <button type="submit" className="ml-auto px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold">Invite</button>
                      </div>
                    </div>
                  </form>
                </div>

                <div>
                  <h4 className="text-xs text-slate-300 font-bold mb-2">Current Members</h4>
                  <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 text-xs text-slate-300">
                    {membersLoading ? (
                      <div className="animate-pulse">Loading members...</div>
                    ) : members.length === 0 ? (
                      <div>No members found.</div>
                    ) : (
                      <div className="space-y-2">
                        {members.map((m: any) => (
                          <div key={m.id || m.uid} className="flex items-center justify-between bg-slate-950/30 p-2 rounded-xl">
                            <div>
                              <div className="font-bold text-slate-100 text-sm">{m.email || m.uid}</div>
                              <div className="text-xs text-slate-400">{m.role}</div>
                            </div>
                            <div className="flex items-center space-x-2">
                              <button onClick={async () => {
                                if (!workspace) return;
                                const confirmDelete = confirm('Remove this member?');
                                if (!confirmDelete) return;
                                const id = m.id;
                                try {
                                  const res = await authFetch(`/api/workspaces/${workspace.slug}/members/${id}`, { method: 'DELETE' });
                                  if (res.ok) {
                                    setMembers((prev) => prev.filter((x: any) => (x.id || x.uid) !== (m.id || m.uid)));
                                    setToast({ type: 'success', message: 'Member removed.' });
                                  } else {
                                    const err = await res.json();
                                    setToast({ type: 'error', message: err.error || 'Failed to remove member' });
                                  }
                                } catch (err: any) {
                                  setToast({ type: 'error', message: err.message });
                                }
                              }} className="px-3 py-1 bg-rose-700 text-rose-100 rounded-xl text-xs">Remove</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
          {activeTab === 'meta' && (
            <div className="space-y-6">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-100 flex items-center space-x-2">
                    <Facebook className="w-4 h-4 text-blue-500" />
                    <span>Meta Conversions API Credentials</span>
                  </h3>
                  <p className="text-xs text-slate-300 mt-0.5">Integrate server-side Meta conversions to bypass ad-blockers.</p>
                </div>
                {workspace?.meta_pixel_name && (
                  <span className="text-xs bg-indigo-950 border border-indigo-500/20 text-indigo-300 px-2.5 py-1 rounded-full font-bold">
                    Connected: {workspace.meta_pixel_name}
                  </span>
                )}
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">Meta Pixel ID</label>
                  <input
                    type="text"
                    value={metaPixelId}
                    onChange={(e) => setMetaPixelId(e.target.value)}
                    placeholder="e.g. 104857392019485"
                    className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">Meta Ad Account ID</label>
                  <input
                    type="text"
                    value={metaAdAccountId}
                    onChange={(e) => setMetaAdAccountId(e.target.value)}
                    placeholder="act_1234567890 (required for Custom Audience sync)"
                    className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-mono"
                  />
                  <p className="text-[11px] text-slate-500">Needed to push Positive/Negative audiences into Meta Custom Audiences. Find it in Meta Ads Manager → Account Settings.</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">Meta Conversions Access Token</label>
                  <div className="relative">
                    <input
                      type={showMetaToken ? 'text' : 'password'}
                      value={metaAccessToken}
                      onChange={(e) => setMetaAccessToken(e.target.value)}
                      placeholder="EAAGwZBca1..."
                      className="w-full pl-4 pr-10 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowMetaToken(!showMetaToken)}
                      className="absolute right-3 top-2.5 text-slate-300 hover:text-white transition-colors"
                    >
                      {showMetaToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                    Test Event Code <span className="text-slate-500 normal-case font-medium">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={metaTestEventCode}
                    onChange={(e) => setMetaTestEventCode(e.target.value)}
                    placeholder="TEST12345"
                    className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-mono"
                  />
                  <p className="text-xs text-slate-400 leading-relaxed">
                    From Events Manager → Test Events. If set, "Test Connection" routes the test event there only — no production data. Leave blank to send one live test event.
                  </p>
                </div>

                {metaTestStatus.status !== 'idle' && (
                  <div className={`p-3 rounded-xl border text-xs font-bold flex items-center space-x-2 ${
                    metaTestStatus.status === 'testing' 
                      ? 'bg-slate-800/80 border-slate-700 text-slate-300' 
                      : metaTestStatus.status === 'success'
                      ? 'bg-emerald-950/40 border-emerald-500/20 text-emerald-400'
                      : 'bg-rose-950/40 border-rose-500/20 text-rose-400'
                  }`}>
                    <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${metaTestStatus.status === 'testing' ? 'animate-spin text-indigo-400' : ''}`} />
                    <span>{metaTestStatus.message || 'Verifying credentials connection...'}</span>
                  </div>
                )}

                <div className="pt-2 flex items-center space-x-4">
                  <button
                    type="button"
                    onClick={handleTestMetaConnection}
                    disabled={metaTestStatus.status === 'testing'}
                    className="flex items-center space-x-1.5 bg-slate-850 hover:bg-slate-800 text-slate-300 border border-slate-700 px-4 py-2.5 rounded-xl text-xs font-bold transition-all"
                  >
                    <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                    <span>Test Connection</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveMeta}
                    disabled={saving}
                    className="flex items-center space-x-1.5 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition-all"
                  >
                    <Save className="w-4 h-4 shrink-0" />
                    <span>Save credentials</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: GOOGLE ADS INTEGRATION */}
          {activeTab === 'google' && (
            <div className="space-y-6">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-100 flex items-center space-x-2">
                    <Percent className="w-4 h-4 text-amber-500" />
                    <span>Google Ads Channel Integration</span>
                  </h3>
                  <p className="text-xs text-slate-300 mt-0.5">Upload click conversions mapped to active offline GCLID signals.</p>
                </div>
                {workspace?.google_ads_account_name && (
                  <span className="text-xs bg-indigo-950 border border-indigo-500/20 text-indigo-300 px-2.5 py-1 rounded-full font-bold">
                    Connected: {workspace.google_ads_account_name}
                  </span>
                )}
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">Google Ads Customer ID</label>
                    <input
                      type="text"
                      value={googleCustomerId}
                      onChange={handleGoogleCustomerIdChange}
                      placeholder="e.g. 123-456-7890"
                      maxLength={12}
                      className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">Developer Token</label>
                    <div className="relative">
                      <input
                        type={showGoogleToken ? 'text' : 'password'}
                        value={googleDevToken}
                        onChange={(e) => setGoogleDevToken(e.target.value)}
                        placeholder="e.g. abcde12345..."
                        className="w-full pl-4 pr-10 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowGoogleToken(!showGoogleToken)}
                        className="absolute right-3 top-2.5 text-slate-300 hover:text-white transition-colors"
                      >
                        {showGoogleToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-100 text-xs block">Google AdWords Account Authorization</span>
                    <span className="text-xs text-slate-300 mt-0.5 leading-relaxed block max-w-md">
                      Grant authorization to upload click conversion metrics. Directs to Google AdWords sign-in approval portal.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleGoogleOAuthConnect}
                    className="flex items-center space-x-1.5 bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md shrink-0"
                  >
                    <span>Connect Google OAuth</span>
                  </button>
                </div>

                {googleTestStatus.status !== 'idle' && (
                  <div className={`p-3 rounded-xl border text-xs font-bold flex items-center space-x-2 ${
                    googleTestStatus.status === 'testing' 
                      ? 'bg-slate-800/80 border-slate-700 text-slate-300' 
                      : googleTestStatus.status === 'success'
                      ? 'bg-emerald-950/40 border-emerald-500/20 text-emerald-400'
                      : 'bg-rose-950/40 border-rose-500/20 text-rose-400'
                  }`}>
                    <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${googleTestStatus.status === 'testing' ? 'animate-spin text-indigo-400' : ''}`} />
                    <span>{googleTestStatus.message || 'Verifying credentials connection...'}</span>
                  </div>
                )}

                <div className="pt-2 flex items-center space-x-4">
                  <button
                    type="button"
                    onClick={handleTestGoogleConnection}
                    className="flex items-center space-x-1.5 bg-slate-850 hover:bg-slate-800 text-slate-300 border border-slate-700 px-4 py-2.5 rounded-xl text-xs font-bold transition-all"
                  >
                    <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                    <span>Test Connection</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveGoogleDevToken}
                    disabled={saving}
                    className="flex items-center space-x-1.5 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition-all"
                  >
                    <Save className="w-4 h-4 shrink-0" />
                    <span>Save credentials</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: WEBHOOKS REGISTRY */}
          {activeTab === 'webhooks' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-bold text-slate-100 flex items-center space-x-2">
                  <LinkIcon className="w-4 h-4 text-indigo-400" />
                  <span>CRM Webhook Registry</span>
                </h3>
                <p className="text-xs text-slate-300 mt-0.5">Integrate incoming lead streams using copyable workspace endpoints.</p>
              </div>

              <div className="bg-indigo-950/20 border border-indigo-500/20 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <span className="font-bold text-indigo-300 text-xs block">Webhook Secret Key</span>
                  <span className="text-xs text-slate-300 leading-relaxed block mt-0.5 max-w-md">
                    Secure ingestion channels by setting header <code className="bg-slate-800/80 px-1 py-0.5 rounded border border-slate-700 text-slate-300 font-mono text-xs">x-webhook-secret</code> or query string token.
                  </span>
                  
                  <div className="mt-2.5 flex items-center space-x-2">
                    <span className="text-xs text-slate-400 font-bold block uppercase tracking-wider">Current Secret:</span>
                    <span className="text-xs text-indigo-200 font-mono px-2 py-0.5 bg-slate-900 border border-slate-800 rounded font-bold block">
                      {newSecretOnce ? newSecretOnce : '••••••••••••••••••••••••••••••••'}
                    </span>
                    {newSecretOnce && (
                      <span className="text-xs text-emerald-400 font-bold block animate-pulse">
                        (Copy this now! Shown once)
                      </span>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowSecretRegenModal(true)}
                  className="flex items-center space-x-1.5 bg-indigo-950 hover:bg-indigo-900 text-indigo-300 border border-indigo-500/30 px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0"
                >
                  <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                  <span>Regenerate Key</span>
                </button>
              </div>

              {/* CRM Webhook URLs */}
              <div className="space-y-3">
                {[
                  { name: 'Custom / MADR CRM', adapter: 'custom' },
                  { name: 'Sell.do', adapter: 'selldo' },
                  { name: 'Zoho CRM', adapter: 'zoho' },
                  { name: 'Salesforce', adapter: 'salesforce' },
                  { name: 'LeadSquared', adapter: 'leadsquared' },
                ].map((crm) => (
                  <div key={crm.adapter} className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block">
                      {crm.name}
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        readOnly
                        value={getWebhookUrl(crm.adapter)}
                        className="w-full pl-3 pr-12 py-2 bg-slate-850 border border-slate-700 rounded-xl text-xs font-mono text-slate-300 select-all focus:outline-none focus:ring-0"
                      />
                      <button
                        type="button"
                        onClick={() => handleCopyWebhook(crm.adapter)}
                        className="absolute right-2 p-1.5 hover:bg-slate-700/60 rounded-lg text-slate-300 hover:text-white transition-all"
                      >
                        {copiedUrl === crm.adapter ? (
                          <Check className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Custom Stage Mappings */}
              <div className="pt-6 border-t border-slate-800 space-y-4">
                <div>
                  <span className="font-bold text-slate-200 text-xs block">Custom Stage Mappings</span>
                  <span className="text-xs text-slate-400 mt-0.5 block leading-relaxed">
                    Map your CRM&apos;s stage names to internal statuses. Takes priority over the built-in maps. Use this when your client&apos;s CRM uses different stage names (e.g. &quot;Hot Lead&quot; → interested).
                  </span>
                </div>

                <div className="space-y-2">
                  {/* Header row */}
                  <div className="grid grid-cols-[1fr_1fr_32px] gap-2 px-1">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">CRM Stage Value</span>
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Internal Status</span>
                    <span />
                  </div>

                  {customMappings.map((row, i) => (
                    <div key={i} className="grid grid-cols-[1fr_1fr_32px] gap-2 items-center">
                      <input
                        type="text"
                        value={row.crm_value}
                        onChange={(e) => {
                          const updated = [...customMappings];
                          updated[i] = { ...updated[i]!, crm_value: e.target.value };
                          setCustomMappings(updated);
                        }}
                        placeholder="e.g. Hot Lead"
                        className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 font-mono focus:outline-none focus:border-indigo-500"
                      />
                      <select
                        value={row.internal_status}
                        onChange={(e) => {
                          const updated = [...customMappings];
                          updated[i] = { ...updated[i]!, internal_status: e.target.value };
                          setCustomMappings(updated);
                        }}
                        className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500 h-auto"
                      >
                        <option value="">— select —</option>
                        {['new','fresh','interested','in_call_center','visit_done','final_negotiation','booking_done','positive_stage','claimed','converted','junk','failed'].map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setCustomMappings(customMappings.filter((_, idx) => idx !== i))}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-950/30 transition-all"
                      >
                        ×
                      </button>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={() => setCustomMappings([...customMappings, { crm_value: '', internal_status: 'new' }])}
                    className="flex items-center space-x-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-bold py-1 transition-colors"
                  >
                    <span>+ Add Mapping</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleSaveMappings}
                  disabled={mappingsSaving}
                  className="flex items-center space-x-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all"
                >
                  {mappingsSaving ? (
                    <span>Saving...</span>
                  ) : (
                    <span>Save Mappings</span>
                  )}
                </button>
              </div>

              {/* Integration Guides */}
              <div className="pt-6 border-t border-slate-800 space-y-4">
                <span className="font-bold text-slate-200 text-xs block">Integration Guides</span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="border border-slate-800 p-4 rounded-xl space-y-1.5">
                    <span className="font-bold text-indigo-400 text-xs block">Sell.do</span>
                    <span className="text-xs text-slate-400 leading-relaxed block">Settings → Integrations → Webhooks. Add the Sell.do URL above, set method POST, attach to Lead Created and Stage Changed events.</span>
                  </div>
                  <div className="border border-slate-800 p-4 rounded-xl space-y-1.5">
                    <span className="font-bold text-indigo-400 text-xs block">Zoho CRM</span>
                    <span className="text-xs text-slate-400 leading-relaxed block">Setup → Developer Space → Webhooks. Create webhook pointing to the Zoho URL above. Attach to Lead workflow rules on create and status change.</span>
                  </div>
                  <div className="border border-slate-800 p-4 rounded-xl space-y-1.5">
                    <span className="font-bold text-indigo-400 text-xs block">Salesforce</span>
                    <span className="text-xs text-slate-400 leading-relaxed block">Setup → Process Builder or Flow. Call the Salesforce URL as an HTTP POST action on Lead Status changes. Pass the webhook secret as header <code className="bg-slate-800 px-1 rounded font-mono">x-webhook-secret</code>.</span>
                  </div>
                  <div className="border border-slate-800 p-4 rounded-xl space-y-1.5">
                    <span className="font-bold text-indigo-400 text-xs block">Custom / Any CRM</span>
                    <span className="text-xs text-slate-400 leading-relaxed block font-mono">POST to custom URL with header <code className="bg-slate-800 px-1 rounded">x-webhook-secret</code>. Body: <code className="bg-slate-800 px-1 rounded">{`{"external_id":"...","name":"...","lead_status":"..."}`}</code></span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: SELL.DO SYNC */}
          {activeTab === 'selldo' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-bold text-slate-100 flex items-center space-x-2">
                  <RefreshCw className="w-4 h-4 text-indigo-400" />
                  <span>Sell.do API Sync</span>
                </h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  Automatically pull leads from Sell.do every 10 minutes using your API key. No webhook setup needed.
                </p>
              </div>

              {/* API Key Input */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">Sell.do API Key</label>
                <p className="text-xs text-slate-400">Find this in Sell.do → Marketing Automation → Lead Integrations → API Based Integrations. Copy the key next to your integration.</p>
                <div className="flex items-center space-x-2 mt-2">
                  <div className="relative flex-1">
                    <input
                      type={showSelldoKey ? 'text' : 'password'}
                      value={selldoApiKey}
                      onChange={(e) => setSelldoApiKey(e.target.value)}
                      placeholder="paste your sell.do api key here"
                      className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSelldoKey(!showSelldoKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
                    >
                      {showSelldoKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <button
                    type="button"
                    disabled={selldoSaving}
                    onClick={async () => {
                      if (!activeWorkspace?.slug) return;
                      setSelldoSaving(true);
                      try {
                        const res = await authFetch(`/api/workspaces/${activeWorkspace.slug}/selldo`, {
                          method: 'PATCH',
                          body: JSON.stringify({ selldo_api_key: selldoApiKey }),
                        });
                        if (res.ok) showToast('success', 'Sell.do API key saved.');
                        else showToast('error', 'Failed to save API key.');
                      } finally {
                        setSelldoSaving(false);
                      }
                    }}
                    className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 shrink-0"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{selldoSaving ? 'Saving...' : 'Save Key'}</span>
                  </button>
                </div>
              </div>

              {/* Sync Status */}
              <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-200 block">Sync Status</span>
                    <span className="text-xs text-slate-400 mt-0.5 block">
                      {selldoLastSynced ? `Last synced: ${selldoLastSynced}` : 'Never synced — run a manual sync first.'}
                    </span>
                    {selldoSyncResult && (
                      <span className={`text-xs mt-1 block font-mono ${selldoSyncResult.error ? 'text-red-400' : 'text-emerald-400'}`}>
                        {selldoSyncResult.error
                          ? `Error: ${selldoSyncResult.error}`
                          : `✓ Fetched ${selldoSyncResult.fetched} leads, processed ${selldoSyncResult.processed}`}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={selldoSyncing || !selldoApiKey}
                    onClick={async () => {
                      if (!activeWorkspace?.slug) return;
                      setSelldoSyncing(true);
                      setSelldoSyncResult(null);
                      try {
                        const res = await authFetch(`/api/workspaces/${activeWorkspace.slug}/selldo/sync`, { method: 'POST' });
                        const data = await res.json();
                        if (res.ok && data.success) {
                          setSelldoSyncResult({ fetched: data.fetched, processed: data.processed });
                          setSelldoLastSynced(new Date(data.synced_at).toLocaleString());
                          showToast('success', `Synced ${data.processed} leads from Sell.do`);
                        } else {
                          setSelldoSyncResult({ error: data.error || 'Sync failed' });
                          showToast('error', data.error || 'Sync failed');
                        }
                      } catch (e: any) {
                        setSelldoSyncResult({ error: e.message });
                      } finally {
                        setSelldoSyncing(false);
                      }
                    }}
                    className="flex items-center space-x-1.5 px-4 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition-all shrink-0"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${selldoSyncing ? 'animate-spin' : ''}`} />
                    <span>{selldoSyncing ? 'Syncing...' : 'Sync Now'}</span>
                  </button>
                </div>
              </div>

              {/* Auto-sync info */}
              <div className="bg-indigo-950/20 border border-indigo-500/20 rounded-xl p-4">
                <span className="text-xs font-bold text-indigo-300 block mb-1">Auto-Sync (every 10 min)</span>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Once your API key is saved, Vercel automatically syncs new and updated leads from Sell.do every 10 minutes in the background. Only leads created or updated since the last sync are fetched — no duplicates.
                </p>
              </div>

              {/* Where to find API key */}
              <div className="border border-slate-800 rounded-xl p-4 space-y-2">
                <span className="text-xs font-bold text-slate-200 block">Where to find your API key in Sell.do</span>
                <ol className="text-xs text-slate-400 space-y-1 list-decimal list-inside leading-relaxed">
                  <li>Go to <span className="text-slate-200 font-mono">Marketing Automation → Lead Integrations</span></li>
                  <li>Click <span className="text-slate-200 font-mono">API Based Integrations</span></li>
                  <li>Find your integration in the list (e.g. "Digital mojo")</li>
                  <li>Copy the long alphanumeric <span className="text-slate-200 font-mono">API KEY</span> from that row</li>
                </ol>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* MODAL 1: CONFIRM SECRET REGENERATE */}
      {showSecretRegenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 max-w-md w-full rounded-2xl p-6 space-y-4 shadow-xl">
            <div className="flex items-center space-x-3 text-indigo-400">
              <RefreshCw className="w-6 h-6 animate-spin" />
              <h3 className="font-bold text-slate-100 text-sm">Regenerate Webhook Secret?</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              This will immediately invalidate the old secret key. All active CRM webhooks using the old token will fail authentication immediately until updated with the new one.
            </p>
            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                onClick={() => setShowSecretRegenModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleRegenerateSecret}
                disabled={saving}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all"
              >
                Regenerate Key
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: CONFIRM WORKSPACE DELETION */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-slate-900 border border-rose-500/30 max-w-md w-full rounded-2xl p-6 space-y-4 shadow-xl">
            <div className="flex items-center space-x-3 text-rose-500">
              <ShieldAlert className="w-6 h-6 animate-bounce" />
              <h3 className="font-bold text-slate-100 text-sm">Verify Workspace Deletion</h3>
            </div>
            <p className="text-xs text-rose-300 bg-rose-950/20 border border-rose-500/20 p-3 rounded-xl leading-relaxed">
              **Warning**: This action is extremely destructive. It will permanently delete this workspace, custom integrations, leads registry histories, and charts.
            </p>
            
            {workspace && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 block">
                  Type <span className="text-slate-200 font-bold">"{workspace.name}"</span> to confirm:
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder={workspace.name}
                  className="w-full px-4 py-2 bg-slate-850 border border-slate-750 rounded-xl text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-rose-500 transition-all font-mono"
                />
              </div>
            )}

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteConfirmText('');
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteWorkspace}
                disabled={saving || !workspace || deleteConfirmText !== workspace.name}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:bg-rose-950 text-white rounded-xl text-xs font-bold transition-all shadow-md"
              >
                Delete Forever
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
