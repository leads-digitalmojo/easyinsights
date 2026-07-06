'use client';

import React, { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useLeads } from '@/hooks/useLeads';
import { Conversion, Lead } from '@/types';
import {
  Activity,
  Award,
  Database,
  Link as LinkIcon,
  Calendar,
  ChevronDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from 'recharts';
import styles from './dashboard.module.css';

export default function WorkspaceDashboard() {
  const { activeWorkspace } = useWorkspace();
  const { leads, loading: leadsLoading } = useLeads(activeWorkspace?.id);
  const [conversions, setConversions] = useState<Conversion[]>([]);
  const [conversionsLoading, setConversionsLoading] = useState(true);

  // Date Range State (default to last 7 days)
  const [dateRange, setDateRange] = useState<'today' | 'yesterday' | '7days' | '30days' | '90days'>('7days');
  const [showMoreDropdown, setShowMoreDropdown] = useState(false);

  // Real-time listener for conversions subcollection
  useEffect(() => {
    if (!activeWorkspace?.id) {
      setConversions([]);
      setConversionsLoading(false);
      return;
    }

    setConversionsLoading(true);
    const convRef = collection(db, 'workspaces', activeWorkspace.id, 'conversions');
    const unsubscribe = onSnapshot(
      convRef,
      (snapshot) => {
        const list: Conversion[] = [];
        snapshot.forEach((doc) => {
          list.push(doc.data() as Conversion);
        });
        setConversions(list);
        setConversionsLoading(false);
      },
      (error) => {
        console.error('Error fetching real-time conversions:', error);
        setConversionsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [activeWorkspace?.id]);

  // Dynamic Date Range Limits & Math
  const getPeriodBounds = () => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    
    let duration = 7 * 24 * 60 * 60 * 1000; // 7 days default
    let currentStart = now.getTime() - duration;
    let currentEnd = now.getTime();

    if (dateRange === 'today') {
      duration = now.getTime() - startOfToday;
      currentStart = startOfToday;
      currentEnd = now.getTime();
    } else if (dateRange === 'yesterday') {
      duration = 24 * 60 * 60 * 1000;
      currentStart = startOfToday - duration;
      currentEnd = startOfToday - 1;
    } else if (dateRange === '30days') {
      duration = 30 * 24 * 60 * 60 * 1000;
      currentStart = now.getTime() - duration;
      currentEnd = now.getTime();
    } else if (dateRange === '90days') {
      duration = 90 * 24 * 60 * 60 * 1000;
      currentStart = now.getTime() - duration;
      currentEnd = now.getTime();
    }

    const previousStart = currentStart - duration;
    const previousEnd = currentStart - 1;

    return { currentStart, currentEnd, previousStart, previousEnd, duration };
  };

  const { currentStart, currentEnd, previousStart, previousEnd } = getPeriodBounds();

  // Helper to parse lead creation dates
  const getLeadTime = (lead: Lead) => {
    if (lead.created_at?.toDate) return lead.created_at.toDate().getTime();
    if (lead.created_at) return new Date(lead.created_at).getTime();
    return 0;
  };

  // 1. Leads Metric Aggregates
  const currentLeadsCount = leads.filter(l => {
    const t = getLeadTime(l);
    return t >= currentStart && t <= currentEnd;
  }).length;

  const previousLeadsCount = leads.filter(l => {
    const t = getLeadTime(l);
    return t >= previousStart && t <= previousEnd;
  }).length;

  const leadsPctChange = previousLeadsCount > 0 
    ? ((currentLeadsCount - previousLeadsCount) / previousLeadsCount) * 100 
    : currentLeadsCount > 0 ? 100 : 0;

  // 2. Conversions Uploaded — sum of counts from conversions subcollection (only incremented on real CAPI success)
  const currentConversionsCount = conversions.reduce((sum, c) => sum + (c.count || 0), 0);

  // 3. Active Conversions — distinct event types that have fired at least once
  const activeConversionsCount = conversions.filter(c => c.count > 0).length;

  // Recharts 1: Lead Count Trend Line (dates in range)
  const getLineChartData = () => {
    const daysMap: Record<string, number> = {};
    const daysToShow = dateRange === 'today' || dateRange === 'yesterday' ? 24 : dateRange === '7days' ? 7 : dateRange === '30days' ? 30 : 90;
    
    const localeOptions: Intl.DateTimeFormatOptions = daysToShow <= 7 
      ? { weekday: 'short', day: 'numeric' } 
      : { month: 'short', day: 'numeric' };

    for (let i = daysToShow - 1; i >= 0; i--) {
      const d = new Date();
      if (dateRange === 'today') {
        d.setHours(d.getHours() - i);
        daysMap[`${d.getHours()}:00`] = 0;
      } else if (dateRange === 'yesterday') {
        d.setDate(d.getDate() - 1);
        d.setHours(d.getHours() - i);
        daysMap[`${d.getHours()}:00`] = 0;
      } else {
        d.setDate(d.getDate() - i);
        const label = d.toLocaleDateString('en-US', localeOptions);
        daysMap[label] = 0;
      }
    }

    leads.forEach((lead) => {
      const t = getLeadTime(lead);
      if (t >= currentStart && t <= currentEnd) {
        const d = new Date(t);
        if (dateRange === 'today' || dateRange === 'yesterday') {
          const key = `${d.getHours()}:00`;
          if (daysMap[key] !== undefined) daysMap[key]++;
        } else {
          const key = d.toLocaleDateString('en-US', localeOptions);
          if (daysMap[key] !== undefined) daysMap[key]++;
        }
      }
    });

    return Object.entries(daysMap).map(([day, count]) => ({
      date: day,
      leads: count,
    }));
  };

  const lineChartData = getLineChartData();

  // Recharts 2: Top 5 Conversions BarChart — sourced from conversions subcollection
  const getBarChartData = () => {
    const countsMap: Record<string, number> = {};
    conversions.forEach((c) => {
      const key = c.event_name || c.name;
      if (key) countsMap[key] = (countsMap[key] || 0) + (c.count || 0);
    });

    const sorted = Object.entries(countsMap)
      .map(([name, count]) => ({
        name: name.length > 12 ? name.substring(0, 10) + '...' : name,
        fullName: name,
        count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    if (sorted.length === 0) {
      return [
        { name: 'EI_New', fullName: 'EI_New', count: 0 },
        { name: 'EI_Interested', fullName: 'EI_Interested', count: 0 },
      ];
    }
    return sorted;
  };

  const barChartData = getBarChartData();

  // Channels tables counts — sourced from conversions subcollection (real CAPI fires only)
  const metaPixel = activeWorkspace?.meta_pixel_id || '—';
  const googleAds = activeWorkspace?.google_ads_customer_id || '—';

  const metaCount = conversions
    .filter(c => c.platform === 'meta')
    .reduce((sum, c) => sum + (c.count || 0), 0);

  const googleCount = conversions
    .filter(c => c.platform === 'google')
    .reduce((sum, c) => sum + (c.count || 0), 0);

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.headerSection}>
        <div className={styles.headerTop}>
          <h1 className={styles.title}>Signal Control Center</h1>
          <p className={styles.subtitle}>
            Monitor real-time CRM webhook events and API conversion sync rates.
          </p>
        </div>

        {/* Date presets selector */}
        <div className={styles.dateRangeContainer} style={{ position: 'relative' }}>
          <div className={styles.dateRangeGroup}>
            <button
              onClick={() => setDateRange('today')}
              className={`${styles.dateRangeBtn} ${dateRange === 'today' ? styles.active : ''}`}
            >
              Today
            </button>
            <button
              onClick={() => setDateRange('yesterday')}
              className={`${styles.dateRangeBtn} ${dateRange === 'yesterday' ? styles.active : ''}`}
            >
              Yesterday
            </button>
            <button
              onClick={() => setDateRange('7days')}
              className={`${styles.dateRangeBtn} ${dateRange === '7days' ? styles.active : ''}`}
            >
              Last 7 Days
            </button>

            <div className={styles.dateRangeDivider} />

            <button
              onClick={() => setShowMoreDropdown(!showMoreDropdown)}
              className={styles.dateRangeBtn}
              style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <span>More presets</span>
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* More Presets Dropdown popup */}
          {showMoreDropdown && (
            <div className={styles.dateRangeDropdown}>
              <button
                onClick={() => {
                  setDateRange('30days');
                  setShowMoreDropdown(false);
                }}
                className={styles.dateRangeDropdownItem}
              >
                <Calendar className="w-4 h-4" />
                <span>Last 30 Days</span>
              </button>
              <button
                onClick={() => {
                  setDateRange('90days');
                  setShowMoreDropdown(false);
                }}
                className={styles.dateRangeDropdownItem}
              >
                <Calendar className="w-4 h-4" />
                <span>Last 90 Days</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Stat Cards */}
      <div className={styles.statsGrid}>
        {/* Leads Card */}
        <div className={styles.statCard}>
          <div className={styles.statCardContent}>
            <div className={styles.statCardIcon}>
              <Database className="w-6 h-6" />
            </div>
            <div className={styles.statCardBody}>
              <span className={styles.statCardLabel}>Leads tracked</span>
              <div className={styles.statCardValue}>
                <span>{leadsLoading ? '...' : currentLeadsCount.toLocaleString()}</span>
                <span className={`${styles.statCardBadge} ${leadsPctChange >= 0 ? styles.success : styles.danger}`}>
                  {leadsPctChange >= 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                  {Math.abs(leadsPctChange).toFixed(0)}%
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Conversions Card */}
        <div className={styles.statCard}>
          <div className={styles.statCardContent}>
            <div className={styles.statCardIcon}>
              <Activity className="w-6 h-6" />
            </div>
            <div className={styles.statCardBody}>
              <span className={styles.statCardLabel}>Conversions Uploaded</span>
              <div className={styles.statCardValue}>
                <span>{conversionsLoading ? '...' : currentConversionsCount.toLocaleString()}</span>
                <span className={`${styles.statCardBadge} ${styles.info}`}>total</span>
              </div>
            </div>
          </div>
        </div>

        {/* Active Events Card */}
        <div className={styles.statCard}>
          <div className={styles.statCardContent}>
            <div className={styles.statCardIcon}>
              <Award className="w-6 h-6" />
            </div>
            <div className={styles.statCardBody}>
              <span className={styles.statCardLabel}>Active Conversions</span>
              <div className={styles.statCardValue}>
                <span>{conversionsLoading ? '...' : activeConversionsCount}</span>
                <span className={`${styles.statCardBadge} ${styles.success}`}>Live</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className={styles.chartsGrid}>
        {/* Lead Capture Velocity */}
        <div className={styles.chartCard}>
          <div className={styles.chartCardHeader}>
            <div>
              <h3 className={styles.chartCardTitle}>Lead Capture Velocity</h3>
              <p className={styles.chartCardSubtitle}>Dynamic trend over selected period</p>
            </div>
            <Database className="w-4 h-4 text-slate-500" />
          </div>
          <div className={styles.chartContainer}>
            {leadsLoading ? (
              <div className={styles.loadingText}>
                <span className="spinner" />
                Computing lead sparkline...
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={lineChartData} margin={{ left: -20, right: 10, top: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#6B7280' }} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: '#6B7280' }} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1A1E28',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '8px',
                      color: '#F0F2F7',
                      fontSize: '13px',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="leads"
                    stroke="#5B6BF8"
                    strokeWidth={3}
                    dot={{ r: 4, strokeWidth: 1, fill: '#ffffff' }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Top Status Conversions */}
        <div className={styles.chartCard}>
          <div className={styles.chartCardHeader}>
            <div>
              <h3 className={styles.chartCardTitle}>Top Status Conversions</h3>
              <p className={styles.chartCardSubtitle}>Top 5 conversion event tags</p>
            </div>
            <Activity className="w-4 h-4 text-slate-500" />
          </div>
          <div className={styles.chartContainer}>
            {leadsLoading ? (
              <div className={styles.loadingText}>
                <span className="spinner" />
                Syncing conversion frequencies...
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barChartData} margin={{ left: -20, right: 10, top: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#6B7280' }} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: '#6B7280' }} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1A1E28',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '8px',
                      color: '#F0F2F7',
                      fontSize: '13px',
                    }}
                    cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                    labelFormatter={(label, items) => {
                      const entry = items[0]?.payload;
                      return entry ? entry.fullName : label;
                    }}
                  />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]} fill="#5B6BF8" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Ad Account Integrations */}
      <div className={styles.integrationGrid}>
        {/* Meta */}
        <div className={styles.integrationCard}>
          <div className={styles.integrationCardHeader}>
            <div className={styles.integrationCardTitle}>
              <span className={`${styles.integrationCardIcon} ${styles.meta}`}>f</span>
              <div>
                <div className={styles.integrationCardTitleText}>Meta Pixel Integration</div>
                <div className={styles.integrationCardSubtitle}>Fired Events</div>
              </div>
            </div>
            <LinkIcon className="w-4 h-4 text-slate-500" />
          </div>
          <div className={styles.integrationCardBody}>
            <table className={styles.integrationTable}>
              <thead>
                <tr>
                  <th>Account Name</th>
                  <th className="text-center">Platform ID</th>
                  <th className="text-right">Conversions Uploaded</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className={styles.accountName}>Meta Pixel Linked Channel</td>
                  <td className={styles.accountId}>{metaPixel}</td>
                  <td className={styles.conversionCount}>{metaCount.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Google */}
        <div className={styles.integrationCard}>
          <div className={styles.integrationCardHeader}>
            <div className={styles.integrationCardTitle}>
              <span className={`${styles.integrationCardIcon} ${styles.google}`}>G</span>
              <div>
                <div className={styles.integrationCardTitleText}>Google Ads Integration</div>
                <div className={styles.integrationCardSubtitle}>Fired Events</div>
              </div>
            </div>
            <LinkIcon className="w-4 h-4 text-slate-500" />
          </div>
          <div className={styles.integrationCardBody}>
            <table className={styles.integrationTable}>
              <thead>
                <tr>
                  <th>Account Name</th>
                  <th className="text-center">Customer ID</th>
                  <th className="text-right">Conversions Uploaded</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className={styles.accountName}>Google Customer Match Channel</td>
                  <td className={styles.accountId}>{googleAds}</td>
                  <td className={styles.conversionCount}>{googleCount.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
