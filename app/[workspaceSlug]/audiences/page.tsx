'use client';

import React, { useState, useEffect } from 'react';
import { useWorkspace } from '@/hooks/useWorkspace';
import { collection, onSnapshot, doc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Audience } from '@/types';
import { authFetch } from '@/lib/clientAuth';
import {
  Users,
  Plus,
  Edit2,
  Calendar,
  X,
  CheckCircle,
  AlertCircle,
  Database,
  Info,
  Percent,
  RefreshCw,
} from 'lucide-react';

// Platform Icons
const FacebookIcon = () => (
  <span className="w-5 h-5 shrink-0 rounded-full bg-blue-600 text-white flex items-center justify-center font-extrabold font-mono text-xs shadow-sm select-none">
    f
  </span>
);

const GoogleIcon = () => (
  <span className="w-5 h-5 shrink-0 rounded-full bg-amber-500 text-white flex items-center justify-center font-extrabold text-xs shadow-sm select-none">
    G
  </span>
);

export default function AudiencesPage() {
  const { activeWorkspace } = useWorkspace();
  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [isOpen, setIsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedAudienceId, setSelectedAudienceId] = useState<string | null>(null);

  // Form Fields
  const [audienceName, setAudienceName] = useState('');
  const [description, setDescription] = useState('');
  const [platform, setPlatform] = useState<'meta' | 'google'>('meta');
  const [account, setAccount] = useState('');
  const [tag, setTag] = useState<'Positive Stage' | 'Negative Stage'>('Positive Stage');
  const [retentionDays, setRetentionDays] = useState(540);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncToast, setSyncToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Push an audience segment to its ad platform (Meta CA / Google Customer Match)
  const handleSyncAudience = async (aud: Audience) => {
    setSyncingId(aud.id);
    setSyncToast(null);
    try {
      const res = await authFetch(`/api/audiences/${activeWorkspace!.slug}/${aud.id}/sync`, {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSyncToast({ type: 'success', message: `${aud.name}: synced ${data.size?.toLocaleString?.() ?? data.size} members to ${aud.platform === 'meta' ? 'Meta' : 'Google'}.` });
      } else {
        setSyncToast({ type: 'error', message: data.error || 'Sync failed.' });
      }
    } catch (err: any) {
      setSyncToast({ type: 'error', message: err.message || 'Network error during sync.' });
    } finally {
      setSyncingId(null);
      setTimeout(() => setSyncToast(null), 6000);
    }
  };

  // Fetch Audiences in Real-time
  useEffect(() => {
    if (!activeWorkspace?.id) {
      setAudiences([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const audRef = collection(db, 'workspaces', activeWorkspace.id, 'audiences');
    const unsubscribe = onSnapshot(
      audRef,
      (snapshot) => {
        const list: Audience[] = [];
        snapshot.forEach((doc) => {
          list.push(doc.data() as Audience);
        });
        setAudiences(list.sort((a, b) => b.created_at?.seconds - a.created_at?.seconds || 0));
        setLoading(false);
      },
      (error) => {
        console.error('Error listening to audiences:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [activeWorkspace?.id]);

  // Handle Account Selection dynamically based on platform
  useEffect(() => {
    if (activeWorkspace) {
      if (platform === 'meta') {
        setAccount(activeWorkspace.meta_pixel_id || 'Amara Pixel V1');
      } else {
        setAccount(activeWorkspace.google_ads_customer_id || 'Amara-Deevyashakti');
      }
    }
  }, [platform, activeWorkspace]);

  // Open creation modal
  const handleOpenCreate = () => {
    setIsEditing(false);
    setSelectedAudienceId(null);
    setAudienceName('');
    setDescription('');
    setPlatform('meta');
    setTag('Positive Stage');
    setRetentionDays(540);
    setError('');
    setIsOpen(true);
  };

  // Open edit modal
  const handleOpenEdit = (aud: Audience) => {
    setIsEditing(true);
    setSelectedAudienceId(aud.id);
    setAudienceName(aud.name);
    setDescription(aud.description || '');
    setPlatform(aud.platform);
    setTag(aud.tag);
    setRetentionDays(aud.retention_days || 540);
    setAccount(aud.account_name);
    setError('');
    setIsOpen(true);
  };

  // Save / Update Audience
  const handleSaveAudience = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!audienceName.trim()) {
      setError('Please provide an audience name.');
      return;
    }

    setError('');
    setSubmitting(true);

    try {
      if (isEditing && selectedAudienceId) {
        // 1. Handle Edit Mutation
        const audDocRef = doc(db, 'workspaces', activeWorkspace!.id, 'audiences', selectedAudienceId);
        await updateDoc(audDocRef, {
          name: audienceName.trim(),
          description: description.trim(),
          tag,
          retention_days: Number(retentionDays),
        });
      } else {
        // 2. Handle Create Mutation
        const response = await authFetch(`/api/audiences/${activeWorkspace!.slug}`, {
          method: 'POST',
          body: JSON.stringify({
            name: audienceName.trim(),
            description: description.trim(),
            platform,
            tag,
            retention_days: Number(retentionDays),
          }),
        });

        if (!response.ok) {
          const resData = await response.json();
          throw new Error(resData.error || 'Failed to create audience registry.');
        }
      }

      setIsOpen(false);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Sync Toast */}
      {syncToast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center space-x-2 px-4 py-3 rounded-xl shadow-lg border text-xs font-bold max-w-md ${
          syncToast.type === 'success'
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
            : 'bg-red-50 text-red-700 border-red-200'
        }`}>
          {syncToast.type === 'success' ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>{syncToast.message}</span>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between space-y-4 sm:space-y-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Audiences Hub</h1>
          <p className="text-slate-600 text-sm mt-0.5 font-medium">
            Monitor real-time client segmentation, Positive/Negative transitions, and ad custom lists.
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          className="flex items-center space-x-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-2.5 rounded-xl text-xs font-bold shadow-md hover:shadow-indigo-500/20 active:scale-95 transition-all duration-150 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Create Audience</span>
        </button>
      </div>

      {/* Main List Table Grid */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-600 animate-pulse">Loading synced custom audiences...</div>
        ) : audiences.length === 0 ? (
          <div className="p-16 text-center text-slate-600 bg-slate-50/20">
            <Users className="w-10 h-10 mx-auto text-slate-400 mb-2 animate-bounce" />
            <p className="font-semibold text-slate-700">No Custom Audiences configured yet</p>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto leading-normal">
              Create target custom audience segments for Meta Pixel and Google Ads above, or trigger lead status changes to auto-provision them.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-600 font-semibold uppercase tracking-wider border-b border-slate-100">
                  <th className="p-4">Audience Name</th>
                  <th className="p-4">Segment Description</th>
                  <th className="p-4">Connected Ad Account</th>
                  <th className="p-4">Automation Tags</th>
                  <th className="p-4 text-center">Audience Size</th>
                  <th className="p-4 text-center">Retention (Days)</th>
                  <th className="p-4">Channel Status</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {audiences.map((aud) => {
                  return (
                    <tr key={aud.id} className="hover:bg-slate-50/60 transition-colors">
                      {/* Name */}
                      <td className="p-4">
                        <span className="font-bold text-slate-800 text-sm block">{aud.name}</span>
                        <span className="text-xs text-slate-500 block mt-0.5 font-mono">{aud.external_audience_id}</span>
                      </td>

                      {/* Description */}
                      <td className="p-4 text-slate-600 max-w-[180px] truncate" title={aud.description}>
                        {aud.description || 'No description provided.'}
                      </td>

                      {/* Account */}
                      <td className="p-4">
                        <div className="flex items-center space-x-1.5">
                          {aud.platform === 'meta' ? <FacebookIcon /> : <GoogleIcon />}
                          <span className="font-semibold text-slate-700 truncate max-w-[120px]">{aud.account_name}</span>
                        </div>
                      </td>

                      {/* Tags */}
                      <td className="p-4">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${
                          aud.tag.includes('Positive') 
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-150' 
                            : 'bg-orange-50 text-orange-700 border-orange-150'
                        }`}>
                          {aud.tag}
                        </span>
                      </td>

                      {/* Size */}
                      <td className="p-4 text-center font-extrabold text-slate-800 text-sm">
                        {aud.size.toLocaleString()}
                      </td>

                      {/* Retention */}
                      <td className="p-4 text-center font-bold text-slate-600">
                        {aud.retention_days || 540} days
                      </td>

                      {/* Status */}
                      <td className="p-4">
                        {(() => {
                          const synced = aud.status === 'Synced' || aud.status === 'Usable';
                          const isError = aud.status === 'Error' || aud.status === 'Not Usable';
                          const cls = synced
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : isError
                              ? 'bg-red-50 text-red-700 border-red-200'
                              : aud.status === 'Syncing'
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : 'bg-slate-100 text-slate-600 border-slate-200';
                          return (
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold uppercase border ${cls}`}
                              title={aud.sync_error || undefined}
                            >
                              {aud.status}
                            </span>
                          );
                        })()}
                        {aud.last_synced_at && (
                          <div className="text-[10px] text-slate-400 mt-1">
                            {new Date(aud.last_synced_at.seconds ? aud.last_synced_at.seconds * 1000 : aud.last_synced_at).toLocaleString()}
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleSyncAudience(aud)}
                            disabled={syncingId === aud.id}
                            title="Push this segment to the ad platform"
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 transition-all text-xs font-bold"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${syncingId === aud.id ? 'animate-spin' : ''}`} />
                            <span>{syncingId === aud.id ? 'Syncing' : 'Sync'}</span>
                          </button>
                          <button
                            onClick={() => handleOpenEdit(aud)}
                            className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 hover:text-indigo-600 transition-all"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Dialog */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-2xl relative text-white animate-scaleUp text-xs">
            {/* Close */}
            <button
              onClick={() => setIsOpen(false)}
              className="absolute top-4 right-4 text-slate-300 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Title Header */}
            <div className="flex items-center space-x-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-inner">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-lg text-white tracking-tight">
                  {isEditing ? 'Modify Sync Audience' : 'Create Custom Audience'}
                </h3>
                <span className="text-xs uppercase text-indigo-400 font-bold tracking-wider block mt-0.5">
                  Configure real-time automated segmentation parameters
                </span>
              </div>
            </div>

            {error && (
              <div className="mb-4 px-4 py-3 bg-red-950/40 border border-red-800/60 text-red-300 rounded-xl flex items-center space-x-2">
                <AlertCircle className="w-4.5 h-4.5 shrink-0 text-red-400" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSaveAudience} className="space-y-4">
              {/* Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-widest block">Audience Name</label>
                <input
                  type="text"
                  value={audienceName}
                  onChange={(e) => setAudienceName(e.target.value)}
                  placeholder="e.g. EI_Positive Meta Sync"
                  className="w-full px-4 py-2 bg-slate-950/60 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 font-semibold"
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-widest block">Segment Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="Describe your audience target segmentation criteria..."
                  className="w-full px-4 py-2 bg-slate-950/60 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                />
              </div>

              {/* Platform & Account Selection (Read-only if editing to prevent corruption) */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-widest block">Ad Channel</label>
                  <select
                    value={platform}
                    onChange={(e) => setPlatform(e.target.value as 'meta' | 'google')}
                    disabled={isEditing}
                    className="w-full px-4 py-2 bg-slate-950/60 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 disabled:opacity-50 font-bold"
                  >
                    <option value="meta">Meta Ads</option>
                    <option value="google">Google Ads</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-widest block">Target Account</label>
                  <input
                    type="text"
                    value={account}
                    readOnly
                    className="w-full px-4 py-2 bg-slate-950/60 border border-slate-800 rounded-xl text-slate-300 focus:outline-none font-mono"
                  />
                </div>
              </div>

              {/* Tag & Retention */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-widest block">Automation Tag Stage</label>
                  <select
                    value={tag}
                    onChange={(e) => setTag(e.target.value as 'Positive Stage' | 'Negative Stage')}
                    className="w-full px-4 py-2 bg-slate-950/60 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 font-bold"
                  >
                    <option value="Positive Stage">Positive Stage (Interest, Visit, Closed)</option>
                    <option value="Negative Stage">Negative Stage (Junk, Failed)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-widest block">Retention (Days)</label>
                  <input
                    type="number"
                    value={retentionDays}
                    onChange={(e) => setRetentionDays(Number(e.target.value))}
                    min={1}
                    max={540}
                    className="w-full px-4 py-2 bg-slate-950/60 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 font-bold"
                  />
                </div>
              </div>

              {/* Informative Note */}
              <div className="bg-indigo-950/20 border border-indigo-800/40 p-3.5 rounded-xl flex items-start space-x-2.5 text-indigo-300 leading-normal">
                <Info className="w-4.5 h-4.5 shrink-0 text-indigo-400 mt-0.5" />
                <p className="text-xs">
                  When set to a <strong>Positive Stage</strong>, any lead marked as &ldquo;Interested&rdquo;, &ldquo;Visit Done&rdquo;, or &ldquo;Claimed&rdquo; will be synchronized automatically. Negative lead transitions will update Google/Meta Customer Match and trigger instant local exclusions.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-slate-800 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700/80 rounded-xl font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl font-bold hover:shadow-lg hover:shadow-indigo-500/20 transition-all duration-150 disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : isEditing ? 'Update Segment' : 'Build Custom List'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
