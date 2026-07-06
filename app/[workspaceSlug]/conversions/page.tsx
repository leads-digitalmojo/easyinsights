'use client';

import React, { useState, useEffect } from 'react';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useLeads } from '@/hooks/useLeads';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Conversion, Lead } from '@/types';
import {
  Activity,
  Calendar,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  X,
  SlidersHorizontal,
  Info,
  ExternalLink,
} from 'lucide-react';
import Link from 'next/link';

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

export default function ConversionsPage() {
  const { activeWorkspace } = useWorkspace();
  const { leads, loading: leadsLoading } = useLeads(activeWorkspace?.id);
  const [conversions, setConversions] = useState<Conversion[]>([]);
  const [loading, setLoading] = useState(true);

  // Tabs: overview | activity | channels
  const [activeTab, setActiveTab] = useState<'overview' | 'activity' | 'channels'>('overview');

  // Filter state: last 7 days default
  const [datePreset, setDatePreset] = useState<'today' | 'yesterday' | '7days' | '30days' | 'custom'>('7days');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setStartDateEnd] = useState<string>('');

  // Pagination for Overview tab
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Selected conversion for slide-over detail
  const [selectedConversion, setSelectedConversion] = useState<Conversion | null>(null);

  // Activity filter: platform (all | meta | google)
  const [platformFilter, setPlatformFilter] = useState<'all' | 'meta' | 'google'>('all');

  // Listen to conversions
  useEffect(() => {
    if (!activeWorkspace?.id) {
      setConversions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const convRef = collection(db, 'workspaces', activeWorkspace.id, 'conversions');
    const unsubscribe = onSnapshot(
      convRef,
      (snapshot) => {
        const list: Conversion[] = [];
        snapshot.forEach((doc) => {
          list.push(doc.data() as Conversion);
        });
        setConversions(list);
        setLoading(false);
      },
      (error) => {
        console.error('Error listening to conversions:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [activeWorkspace?.id]);

  // Date Range Bounds Helper
  const getDateBounds = () => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    switch (datePreset) {
      case 'today':
        return { start: startOfToday.getTime(), end: now.getTime() };
      case 'yesterday':
        const yesterdayStart = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);
        return { start: yesterdayStart.getTime(), end: startOfToday.getTime() - 1 };
      case '7days':
        return { start: now.getTime() - 7 * 24 * 60 * 60 * 1000, end: now.getTime() };
      case '30days':
        return { start: now.getTime() - 30 * 24 * 60 * 60 * 1000, end: now.getTime() };
      case 'custom':
        const customStart = startDate ? new Date(startDate).getTime() : 0;
        const customEnd = endDate ? new Date(endDate).getTime() : now.getTime();
        return { start: customStart, end: customEnd };
      default:
        return { start: now.getTime() - 7 * 24 * 60 * 60 * 1000, end: now.getTime() };
    }
  };

  const { start: filterStartTime, end: filterEndTime } = getDateBounds();

  // Filter conversions by date (aggregate matches in that range)
  // Since Firestore stored total count, we can simulate range count by looking at status_history in leads!
  // This is highly granular and robust!
  const getFilteredConversions = (): Conversion[] => {
    // 1. Compile counts from leads' history within range
    const rangeCounts: Record<string, { meta: number; google: number; lastFired: number }> = {};

    leads.forEach((lead) => {
      if (!lead.status_history) return;
      lead.status_history.forEach((hist: any) => {
        const firedTime = hist.fired_at || hist.changed_at;
        if (firedTime >= filterStartTime && firedTime <= filterEndTime) {
          const eventName = hist.ei_event_fired || hist.ei_event || hist.status;
          if (!rangeCounts[eventName]) {
            rangeCounts[eventName] = { meta: 0, google: 0, lastFired: 0 };
          }
          if (hist.meta_success !== false) rangeCounts[eventName]!.meta++;
          if (hist.google_success !== false) rangeCounts[eventName]!.google++;
          if (firedTime > rangeCounts[eventName]!.lastFired) {
            rangeCounts[eventName]!.lastFired = firedTime;
          }
        }
      });
    });

    // 2. Map to dynamic conversions list
    const result: Conversion[] = conversions.map((c) => {
      const live = rangeCounts[c.event_name];
      const count = c.platform === 'meta' 
        ? (live?.meta ?? c.count) 
        : c.platform === 'google' 
          ? (live?.google ?? c.count) 
          : ((live?.meta ?? 0) + (live?.google ?? 0) || c.count);

      return {
        ...c,
        count: count,
        last_fired_at: live?.lastFired ? new Date(live.lastFired) : c.last_fired_at,
      };
    });

    // Sort count descending
    return result.sort((a, b) => b.count - a.count);
  };

  const filteredConversions = getFilteredConversions();

  // Overview Tab Pagination
  const totalPages = Math.ceil(filteredConversions.length / itemsPerPage);
  const paginatedConversions = filteredConversions.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Activity Tab Events compiler
  const getActivityEvents = () => {
    const list: any[] = [];
    leads.forEach((lead) => {
      if (!lead.status_history) return;
      lead.status_history.forEach((hist: any) => {
        const firedTime = hist.fired_at || hist.changed_at;
        if (firedTime >= filterStartTime && firedTime <= filterEndTime) {
          const eventName = hist.ei_event_fired || hist.ei_event || hist.status;
          
          if (hist.meta_success !== false && (platformFilter === 'all' || platformFilter === 'meta')) {
            list.push({
              id: `${lead.id}_meta_${firedTime}`,
              eventName,
              leadName: lead.name,
              platform: 'meta',
              firedAt: firedTime,
              status: hist.status || lead.lead_status,
            });
          }
          if (hist.google_success !== false && (platformFilter === 'all' || platformFilter === 'google')) {
            list.push({
              id: `${lead.id}_google_${firedTime}`,
              eventName,
              leadName: lead.name,
              platform: 'google',
              firedAt: firedTime,
              status: hist.status || lead.lead_status,
            });
          }
        }
      });
    });

    return list.sort((a, b) => b.firedAt - a.firedAt).slice(0, 100);
  };

  const activityEvents = getActivityEvents();

  // Channels Breakdown compiler
  const getChannelBreakdowns = () => {
    const metaEvents: Record<string, number> = {};
    const googleEvents: Record<string, number> = {};

    leads.forEach((lead) => {
      if (!lead.status_history) return;
      lead.status_history.forEach((hist: any) => {
        const firedTime = hist.fired_at || hist.changed_at;
        if (firedTime >= filterStartTime && firedTime <= filterEndTime) {
          const eventName = hist.ei_event_fired || hist.ei_event || hist.status;
          if (hist.meta_success !== false) {
            metaEvents[eventName] = (metaEvents[eventName] || 0) + 1;
          }
          if (hist.google_success !== false) {
            googleEvents[eventName] = (googleEvents[eventName] || 0) + 1;
          }
        }
      });
    });

    const totalMeta = Object.values(metaEvents).reduce((s, c) => s + c, 0);
    const totalGoogle = Object.values(googleEvents).reduce((s, c) => s + c, 0);

    return { metaEvents, googleEvents, totalMeta, totalGoogle };
  };

  const { metaEvents, googleEvents, totalMeta, totalGoogle } = getChannelBreakdowns();

  return (
    <div className="space-y-6 animate-fadeIn relative">
      
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between space-y-4 md:space-y-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Conversion Signals</h1>
          <p className="text-slate-600 text-sm mt-0.5 font-medium">
            Monitor dynamic ad events, API fire logs, and granular channel attributions.
          </p>
        </div>

        {/* Date Filters Picker presets */}
        <div className="flex flex-wrap items-center gap-2 bg-white border border-slate-200 p-1 rounded-xl shadow-sm self-start md:self-auto text-xs">
          <button
            onClick={() => setDatePreset('today')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
              datePreset === 'today' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            Today
          </button>
          <button
            onClick={() => setDatePreset('yesterday')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
              datePreset === 'yesterday' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            Yesterday
          </button>
          <button
            onClick={() => setDatePreset('7days')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
              datePreset === '7days' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            Last 7 Days
          </button>
          <button
            onClick={() => setDatePreset('30days')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
              datePreset === '30days' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            Last 30 Days
          </button>
          
          <div className="h-4 w-px bg-slate-200 mx-1" />

          {/* Custom Date Range */}
          <div className="flex items-center space-x-1 pl-1">
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setDatePreset('custom');
              }}
              className="bg-transparent border-none text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer"
            />
            <span className="text-slate-300 font-bold">-</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setStartDateEnd(e.target.value);
                setDatePreset('custom');
              }}
              className="bg-transparent border-none text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Tabs Switcher Navigation */}
      <div className="flex items-center space-x-2 border-b border-slate-200 text-sm font-semibold">
        <button
          onClick={() => setActiveTab('overview')}
          className={`pb-3 px-1 transition-all border-b-2 flex items-center space-x-2 ${
            activeTab === 'overview'
              ? 'border-indigo-600 text-indigo-600 font-bold'
              : 'border-transparent text-slate-600 hover:text-slate-800'
          }`}
        >
          <SlidersHorizontal className="w-4 h-4" />
          <span>Overview</span>
        </button>
        <button
          onClick={() => setActiveTab('activity')}
          className={`pb-3 px-1 transition-all border-b-2 flex items-center space-x-2 ${
            activeTab === 'activity'
              ? 'border-indigo-600 text-indigo-600 font-bold'
              : 'border-transparent text-slate-600 hover:text-slate-800'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Activity Log</span>
        </button>
        <button
          onClick={() => setActiveTab('channels')}
          className={`pb-3 px-1 transition-all border-b-2 flex items-center space-x-2 ${
            activeTab === 'channels'
              ? 'border-indigo-600 text-indigo-600 font-bold'
              : 'border-transparent text-slate-600 hover:text-slate-800'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span>Channels Breakdown</span>
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === 'overview' && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden animate-fadeIn">
          {loading || leadsLoading ? (
            <div className="p-12 text-center text-slate-600 animate-pulse">Loading conversion ledger...</div>
          ) : filteredConversions.length === 0 ? (
            <div className="p-16 text-center text-slate-600 bg-slate-50/20">
              <Activity className="w-10 h-10 mx-auto text-slate-400 mb-2 animate-bounce" />
              <p className="font-semibold text-slate-700">No conversion signals found in this range</p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto leading-normal">
                Trigger lead stage updates manually or send Zoho/Salesforce webhook requests to generate live conversion counters.
              </p>
            </div>
          ) : (
            <div className="flex flex-col">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 font-semibold uppercase tracking-wider border-b border-slate-100 select-none">
                      <th className="p-4">Event Signal Name</th>
                      <th className="p-4">Target Ad Platform</th>
                      <th className="p-4 text-center">Fired Counts</th>
                      <th className="p-4 text-right">Last Synchronized At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {paginatedConversions.map((conv) => {
                      const firedDate = conv.last_fired_at?.toDate
                        ? conv.last_fired_at.toDate()
                        : conv.last_fired_at ? new Date(conv.last_fired_at) : null;

                      return (
                        <tr
                          key={conv.id}
                          onClick={() => setSelectedConversion(conv)}
                          className="hover:bg-slate-50/60 transition-all cursor-pointer group"
                        >
                          <td className="p-4 font-semibold text-slate-800 text-sm flex items-center space-x-2">
                            <span>{conv.name}</span>
                            <ExternalLink className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 text-indigo-500 transition-opacity" />
                          </td>
                          <td className="p-4">
                            <div className="flex items-center space-x-1.5">
                              {conv.platform === 'meta' && <FacebookIcon />}
                              {conv.platform === 'google' && <GoogleIcon />}
                              {conv.platform !== 'meta' && conv.platform !== 'google' && (
                                <>
                                  <FacebookIcon />
                                  <GoogleIcon />
                                </>
                              )}
                              <span className="capitalize text-xs text-slate-600 font-bold ml-1">
                                {conv.platform === 'meta' ? 'Meta Custom' : conv.platform === 'google' ? 'Google Click' : 'Unified Multi'}
                              </span>
                            </div>
                          </td>
                          <td className="p-4 text-center font-extrabold text-slate-800 text-sm">
                            {conv.count.toLocaleString()}
                          </td>
                          <td className="p-4 text-right font-medium text-slate-600">
                            {firedDate ? (
                              <span>
                                {firedDate.toLocaleDateString()} {firedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            ) : (
                              <span className="text-slate-300">n/a</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-slate-600 bg-slate-50/30">
                  <span>Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredConversions.length)} of {filteredConversions.length} items</span>
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => setCurrentPage(c => Math.max(c - 1, 1))}
                      disabled={currentPage === 1}
                      className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    {Array.from({ length: totalPages }).map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setCurrentPage(i + 1)}
                        className={`w-7 h-7 rounded-lg border flex items-center justify-center transition-all ${
                          currentPage === i + 1 
                            ? 'bg-slate-900 text-white border-slate-900 shadow-sm' 
                            : 'border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                      >
                        {i + 1}
                      </button>
                    ))}
                    <button
                      onClick={() => setCurrentPage(c => Math.min(c + 1, totalPages))}
                      disabled={currentPage === totalPages}
                      className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'activity' && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden animate-fadeIn">
          {/* Table Filters header */}
          <div className="p-4 border-b border-slate-100 bg-slate-50/30 flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-700">Live Inbound Activity (Last 100 entries)</span>
            <div className="flex items-center space-x-1.5">
              <button
                onClick={() => setPlatformFilter('all')}
                className={`px-3 py-1 rounded-lg font-bold border transition-all ${
                  platformFilter === 'all' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                All Platforms
              </button>
              <button
                onClick={() => setPlatformFilter('meta')}
                className={`px-3 py-1 rounded-lg font-bold border transition-all flex items-center space-x-1 ${
                  platformFilter === 'meta' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <FacebookIcon />
                <span>Meta Only</span>
              </button>
              <button
                onClick={() => setPlatformFilter('google')}
                className={`px-3 py-1 rounded-lg font-bold border transition-all flex items-center space-x-1 ${
                  platformFilter === 'google' ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <GoogleIcon />
                <span>Google Only</span>
              </button>
            </div>
          </div>

          {activityEvents.length === 0 ? (
            <div className="p-16 text-center text-slate-400">
              <Activity className="w-8 h-8 mx-auto text-slate-300 mb-2" />
              <p className="font-semibold text-slate-500">No activity records recorded in range</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 font-semibold uppercase tracking-wider border-b border-slate-100">
                    <th className="p-4">Event Mapped Name</th>
                    <th className="p-4">Matched Lead Owner</th>
                    <th className="p-4">Channel Platform</th>
                    <th className="p-4">CRM Status State</th>
                    <th className="p-4 text-right">Synchronization Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {activityEvents.map((act) => {
                    const firedDate = new Date(act.firedAt);
                    return (
                      <tr key={act.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="p-4 font-mono font-bold text-slate-700 bg-slate-50/30">{act.eventName}</td>
                        <td className="p-4 font-semibold text-slate-800 text-sm">{act.leadName}</td>
                        <td className="p-4">
                          <div className="flex items-center space-x-1.5">
                            {act.platform === 'meta' ? <FacebookIcon /> : <GoogleIcon />}
                            <span className="capitalize text-xs text-slate-600 font-bold ml-1">
                              {act.platform === 'meta' ? 'Meta Graph' : 'Google AdWords'}
                            </span>
                          </div>
                        </td>
                        <td className="p-4">
                          <span className="px-2 py-0.5 rounded text-xs uppercase font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            {act.status.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="p-4 text-right font-medium text-slate-600">
                          {firedDate.toLocaleDateString()} {firedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'channels' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-fadeIn">
          {/* Meta Pixel breakdown */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center space-x-2">
                <FacebookIcon />
                <div>
                  <h3 className="font-semibold text-slate-800 text-sm">Meta Pixel Integration</h3>
                  <p className="text-xs text-slate-600 font-semibold uppercase tracking-wider">
                    Pixel ID: {activeWorkspace?.meta_pixel_id || 'Amara Pixel V1'}
                  </p>
                </div>
              </div>
              <span className="font-extrabold text-lg text-blue-600">{totalMeta} fired</span>
            </div>

            <div className="p-5 flex-1 space-y-4">
              <span className="text-xs uppercase font-bold text-slate-600 tracking-wider block">Conversion Events count</span>
              {Object.keys(metaEvents).length === 0 ? (
                <div className="text-center p-8 text-slate-400 text-xs">No Meta event conversions recorded.</div>
              ) : (
                <div className="space-y-3">
                  {Object.entries(metaEvents).map(([name, count]) => {
                    const pct = totalMeta > 0 ? (count / totalMeta) * 100 : 0;
                    return (
                      <div key={name} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-700 font-mono">{name}</span>
                          <span className="font-extrabold text-slate-800">{count} ({pct.toFixed(0)}%)</span>
                        </div>
                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Google Ads breakdown */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center space-x-2">
                <GoogleIcon />
                <div>
                  <h3 className="font-semibold text-slate-800 text-sm">Google Ads Integration</h3>
                  <p className="text-xs text-slate-600 font-semibold uppercase tracking-wider">
                    Customer ID: {activeWorkspace?.google_ads_customer_id || 'Amara-Deevyashakti'}
                  </p>
                </div>
              </div>
              <span className="font-extrabold text-lg text-amber-600">{totalGoogle} fired</span>
            </div>

            <div className="p-5 flex-1 space-y-4">
              <span className="text-xs uppercase font-bold text-slate-600 tracking-wider block">Conversion Events count</span>
              {Object.keys(googleEvents).length === 0 ? (
                <div className="text-center p-8 text-slate-400 text-xs">No Google event conversions recorded.</div>
              ) : (
                <div className="space-y-3">
                  {Object.entries(googleEvents).map(([name, count]) => {
                    const pct = totalGoogle > 0 ? (count / totalGoogle) * 100 : 0;
                    return (
                      <div key={name} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-700 font-mono">{name}</span>
                          <span className="font-extrabold text-slate-800">{count} ({pct.toFixed(0)}%)</span>
                        </div>
                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-amber-500 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Premium Sheet slide-over pane */}
      {selectedConversion && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-xs animate-fadeIn">
          <div 
            onClick={(e) => e.stopPropagation()} 
            className="w-full max-w-md bg-slate-900 border-l border-slate-800 h-full p-6 text-white flex flex-col shadow-2xl relative overflow-y-auto animate-slideLeft text-xs"
          >
            {/* Close Button */}
            <button
              onClick={() => setSelectedConversion(null)}
              className="absolute top-4 right-4 text-slate-300 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Icon Header */}
            <div className="flex items-center space-x-3 mb-6 mt-2 pb-5 border-b border-slate-800">
              <div className="w-10 h-10 rounded-lg bg-emerald-600/20 border border-emerald-800/40 flex items-center justify-center text-emerald-400">
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-lg text-white leading-tight tracking-tight">{selectedConversion.name}</h3>
                <span className="text-xs uppercase text-emerald-400 font-bold tracking-wider">Conversion Detail Registry</span>
              </div>
            </div>

            {/* Specs list */}
            <div className="space-y-6 flex-1">
              <div className="space-y-4 bg-slate-950/40 border border-slate-800 p-4 rounded-xl">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-widest block">Signal Parameters</span>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-slate-400 block text-xs uppercase font-bold tracking-wider">System Event</span>
                    <span className="font-semibold text-slate-200 mt-0.5 block font-mono">{selectedConversion.event_name}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-xs uppercase font-bold tracking-wider">Upload Type</span>
                    <span className="font-semibold text-slate-200 mt-0.5 block capitalize">{selectedConversion.platform} channel</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-3 border-t border-slate-800">
                  <div>
                    <span className="text-slate-400 block text-xs uppercase font-bold tracking-wider">Connected Account</span>
                    <span className="font-semibold text-slate-200 mt-0.5 block truncate">{selectedConversion.account_name}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-xs uppercase font-bold tracking-wider">Total Uploads</span>
                    <span className="font-extrabold text-emerald-400 text-sm mt-0.5 block">{selectedConversion.count.toLocaleString()}</span>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800">
                  <span className="text-slate-400 block text-xs uppercase font-bold tracking-wider">Last Sync Time</span>
                  <span className="font-semibold text-slate-200 mt-0.5 block">
                    {selectedConversion.last_fired_at ? (
                      selectedConversion.last_fired_at.toDate 
                        ? selectedConversion.last_fired_at.toDate().toLocaleString() 
                        : new Date(selectedConversion.last_fired_at).toLocaleString()
                    ) : 'No synchronization logs recorded.'}
                  </span>
                </div>
              </div>

              {/* Informative Guidance card */}
              <div className="bg-indigo-950/20 border border-indigo-800/40 p-4 rounded-xl flex items-start space-x-3 text-xs leading-relaxed text-indigo-300">
                <Info className="w-5 h-5 shrink-0 text-indigo-400 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-bold text-slate-200 uppercase tracking-widest text-xs block">Integration Checklist</span>
                  <p>When leads in your CRM change to this corresponding stage, AdSync triggers the Meta Conversions API and Google Ads Click Conversions offline. Ensure custom event mappings are configured in your Facebook Events Manager and Google Ads dashboard.</p>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800 flex items-center justify-end">
              <button
                onClick={() => setSelectedConversion(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700/80 rounded-xl text-xs font-semibold transition-colors"
              >
                Close Panel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
