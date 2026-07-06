'use client';

import React, { useState } from 'react';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useLeads } from '@/hooks/useLeads';
import { Lead } from '@/types';
import { STATUS_MAP } from '@/lib/statusMap';
import { authFetch } from '@/lib/clientAuth';
import {
  Database,
  Plus,
  Search,
  X,
  Download,
  Info,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Trash2,
} from 'lucide-react';
import styles from './leads.module.css';

export default function LeadsPage() {
  const { activeWorkspace } = useWorkspace();
  const { leads, loading } = useLeads(activeWorkspace?.id);

  const [searchQuery, setSearchQuery] = useState('');
  const [crmFilter, setCrmFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [sourceCrm, setSourceCrm] = useState('custom');
  const [gclaw, setGclaw] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const getStatusBadgeClass = (status: string): string => {
    switch (status) {
      case 'new':
        return styles.badgeNew;
      case 'interested':
        return styles.badgeInterested;
      case 'claimed':
        return styles.badgeClaimed;
      case 'junk':
        return styles.badgeBase;
      default:
        return styles.badgeBase;
    }
  };

  const getCrmBadgeClass = (crm: string): string => {
    switch (crm.toLowerCase()) {
      case 'meta':
      case 'facebook':
        return styles.badgeMeta;
      case 'google':
        return styles.badgeGoogle;
      default:
        return styles.badgeBase;
    }
  };

  const handleStatusChange = async (leadId: string, newStatus: string) => {
    try {
      const response = await authFetch(`/api/leads/${activeWorkspace?.slug}/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) {
        const errData = await response.json();
        alert(errData.error || 'Failed to update lead status');
      }
    } catch (e) {
      console.error(e);
      alert('Network error updating status');
    }
  };

  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() && !phone.trim()) {
      setError('Please provide an email or phone number to fire conversion data.');
      return;
    }

    setError('');
    setSubmitting(true);

    try {
      const response = await authFetch(`/api/leads/${activeWorkspace?.slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim() || 'Sandbox Lead',
          email: email.trim(),
          phone: phone.trim(),
          source_crm: sourceCrm,
          _gcl_aw: gclaw.trim(),
        }),
      });

      if (!response.ok) {
        const resData = await response.json();
        throw new Error(resData.error || 'Failed to ingest sandbox lead.');
      }

      setIsOpen(false);
      setName('');
      setEmail('');
      setPhone('');
      setSourceCrm('custom');
      setGclaw('');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCSVExport = () => {
    const headers = ['Name', 'Phone', 'Email', 'Source CRM', 'Status', 'Meta Fired', 'Google Fired', 'Created At'];
    const rows = filteredLeads.map(l => {
      const createdTime = l.created_at?.toDate ? l.created_at.toDate() : new Date(l.created_at);
      return [
        l.name,
        l.phone || '',
        l.email || '',
        l.source_crm,
        l.lead_status,
        l.meta_event_fired || 'None',
        l.google_event_fired || 'None',
        createdTime.toISOString(),
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,'
      + [headers.join(','), ...rows.map(e => e.map(val => `"${val.replace(/"/g, '""')}"`).join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `leads_export_${activeWorkspace?.slug || 'adsync'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getFilteredLeads = () => {
    return leads.filter((lead) => {
      const matchesSearch =
        lead.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (lead.email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (lead.phone || '').toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCrm = crmFilter === 'all' || lead.source_crm.toLowerCase() === crmFilter.toLowerCase();
      const matchesStatus = statusFilter === 'all' || lead.lead_status.toLowerCase() === statusFilter.toLowerCase();

      return matchesSearch && matchesCrm && matchesStatus;
    });
  };

  const filteredLeads = getFilteredLeads();
  const totalPages = Math.ceil(filteredLeads.length / itemsPerPage);
  const paginatedLeads = filteredLeads.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleDeleteLead = async (leadId: string) => {
    if (confirmDeleteId !== leadId) {
      setConfirmDeleteId(leadId);
      return;
    }
    setConfirmDeleteId(null);
    try {
      const response = await authFetch(`/api/leads/${activeWorkspace?.slug}/${leadId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const errData = await response.json();
        alert(errData.error || 'Failed to delete lead');
        return;
      }
      if (selectedLead?.id === leadId) setSelectedLead(null);
    } catch (e) {
      console.error(e);
      alert('Network error deleting lead');
    }
  };

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <h1 className={styles.title}>Leads Ledger</h1>
          <p className={styles.subtitle}>
            Monitor client records, search profiles, inline edit stages, and track exact CAPI histories.
          </p>
        </div>
        <div className={styles.actions}>
          <button
            onClick={handleCSVExport}
            disabled={filteredLeads.length === 0}
            className="inline-flex items-center gap-2 bg-white hover:bg-gray-100 text-gray-700 border border-gray-200 px-4 py-2.5 rounded-md text-xs font-bold disabled:opacity-50 transition-all"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={() => setIsOpen(true)}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 rounded-md text-xs font-bold transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>New Sandbox Lead</span>
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarSearch}>
          <Search className="w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search leads by name, email, or phone..."
          />
        </div>

        <select
          value={crmFilter}
          onChange={(e) => {
            setCrmFilter(e.target.value);
            setCurrentPage(1);
          }}
          className="px-3 py-2.5 bg-white text-gray-700 border border-gray-200 rounded-md text-xs font-bold"
        >
          <option value="all">All CRM Sources</option>
          <option value="custom">Custom Webhook</option>
          <option value="zoho">Zoho CRM</option>
          <option value="salesforce">Salesforce CRM</option>
          <option value="leadsquared">LeadSquared</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setCurrentPage(1);
          }}
          className="px-3 py-2.5 bg-white text-gray-700 border border-gray-200 rounded-md text-xs font-bold"
        >
          <option value="all">All Lead Statuses</option>
          {Object.keys(STATUS_MAP).map((statusKey) => (
            <option key={statusKey} value={statusKey}>
              {statusKey.toUpperCase().replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className={styles.tableWrapper}>
        <div className={styles.tableFlex}>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>Source CRM</th>
                  <th>Lifecycle Status</th>
                  <th>EI Last Fired</th>
                  <th className="text-center">Fired Signals</th>
                  <th className="text-right">Created At</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} className={styles.emptyState}>
                      <div className="animate-pulse font-semibold">Streaming leads ledger...</div>
                    </td>
                  </tr>
                ) : paginatedLeads.length === 0 ? (
                  <tr>
                    <td colSpan={9} className={styles.emptyState}>
                      <Database className="w-8 h-8 text-gray-300" />
                      <p className="font-semibold text-gray-500">No matching lead records found</p>
                      <p className="text-xs text-gray-400 mt-1">Adjust search parameters or ingest a sandbox lead above.</p>
                    </td>
                  </tr>
                ) : (
                  paginatedLeads.map((lead) => {
                    const createdTime = lead.created_at?.toDate
                      ? lead.created_at.toDate()
                      : new Date(lead.created_at);

                    return (
                      <tr
                        key={lead.id}
                        onClick={() => setSelectedLead(lead)}
                        className="group cursor-pointer"
                      >
                        <td className={styles.cellName}>
                          <span className="truncate max-w-[120px] inline-block">
                            {lead.name}
                          </span>
                          <ExternalLink className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 text-blue-500 transition-opacity ml-1 inline" />
                        </td>

                        <td className={styles.cellSecondary}>
                          {lead.phone || '—'}
                        </td>

                        <td className={styles.cellSecondary}>
                          {lead.email || '—'}
                        </td>

                        <td>
                          <span className={`${styles.badgeBase} ${getCrmBadgeClass(lead.source_crm)}`}>
                            {lead.source_crm.toUpperCase()}
                          </span>
                        </td>

                        <td onClick={(e) => e.stopPropagation()}>
                          <select
                            value={lead.lead_status}
                            onChange={(e) => handleStatusChange(lead.id, e.target.value)}
                            className={`${styles.statusSelect} ${getStatusBadgeClass(lead.lead_status)}`}
                          >
                            {Object.keys(STATUS_MAP).map((statusKey) => (
                              <option key={statusKey} value={statusKey}>
                                {statusKey.toUpperCase().replace(/_/g, ' ')}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td className="font-mono font-bold text-gray-400">
                          {STATUS_MAP[lead.lead_status] || 'None'}
                        </td>

                        <td className="text-center">
                          <div className="flex items-center justify-center gap-1.5 text-xs font-extrabold tracking-wider select-none">
                            <span className={lead.meta_event_fired ? 'text-blue-600' : 'text-gray-300'}>META</span>
                            <span className="text-gray-300">•</span>
                            <span className={lead.google_event_fired ? 'text-amber-500' : 'text-gray-300'}>GOOGLE</span>
                          </div>
                        </td>

                        <td className="text-right text-gray-400">
                          <span className="text-xs">
                            {createdTime.toLocaleDateString()} {createdTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </td>

                        <td onClick={(e) => e.stopPropagation()}>
                          {confirmDeleteId === lead.id ? (
                            <div className="flex gap-1">
                              <button
                                onClick={() => handleDeleteLead(lead.id)}
                                className="px-2 py-1 bg-red-600 hover:bg-red-500 text-white rounded text-xs font-bold"
                              >
                                Confirm
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-xs font-bold"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleDeleteLead(lead.id)}
                              className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded transition-all"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className={styles.paginationContainer}>
              <span>Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredLeads.length)} of {filteredLeads.length} items</span>
              <div className={styles.paginationControls}>
                <button
                  onClick={() => setCurrentPage(c => Math.max(c - 1, 1))}
                  disabled={currentPage === 1}
                  className={styles.paginationBtn}
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {Array.from({ length: totalPages }).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentPage(i + 1)}
                    className={`${styles.paginationBtn} ${currentPage === i + 1 ? styles.active : ''}`}
                  >
                    {i + 1}
                  </button>
                ))}
                <button
                  onClick={() => setCurrentPage(c => Math.min(c + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className={styles.paginationBtn}
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Side Panel */}
      {selectedLead && (
        <div className={styles.panelBackdrop} onClick={() => setSelectedLead(null)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className={styles.sidePanel}
          >
            {/* Panel Header */}
            <div className={styles.panelHeader}>
              <div className={styles.panelIcon}>
                <Database className="w-5 h-5" />
              </div>
              <div>
                <div className={styles.panelTitle}>{selectedLead.name}</div>
                <div className={styles.panelSubtitle}>Lead opportunity logs</div>
              </div>
              <button
                onClick={() => setSelectedLead(null)}
                className={styles.panelClose}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Panel Body */}
            <div className={styles.panelBody}>
              {/* Contact Details */}
              <div className={styles.panelSection}>
                <div className={styles.panelSectionLabel}>Client Contact details</div>
                <div className={styles.detailGrid}>
                  <div className={styles.detailItem}>
                    <label>Email Profile</label>
                    <div className={styles.value}>{selectedLead.email || '—'}</div>
                  </div>
                  <div className={styles.detailItem}>
                    <label>Phone number</label>
                    <div className={styles.value}>{selectedLead.phone || '—'}</div>
                  </div>
                </div>

                <div className={styles.detailGrid} style={{ marginTop: 'var(--space-3)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--border-subtle)' }}>
                  <div className={styles.detailItem}>
                    <label>CRM Source Link</label>
                    <div className={styles.value} style={{ textTransform: 'uppercase' }}>{selectedLead.source_crm}</div>
                  </div>
                  <div className={styles.detailItem}>
                    <label>Lifecycle Status</label>
                    <div className={styles.value} style={{ textTransform: 'capitalize' }}>
                      {selectedLead.lead_status.replace(/_/g, ' ')}
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 'var(--space-3)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--border-subtle)' }}>
                  <label className={styles.panelSectionLabel} style={{ marginBottom: 'var(--space-2)' }}>PII Hashed String</label>
                  <div className={styles.piiBlock}>
                    <div className={styles.piiRow}>
                      <span className={styles.piiLabel}>EM:</span>
                      <span className={styles.piiValue}>{selectedLead.email_sha256 || '—'}</span>
                    </div>
                    <div className={styles.piiRow}>
                      <span className={styles.piiLabel}>PH:</span>
                      <span className={styles.piiValue}>{selectedLead.phone_sha256 || '—'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Status Timeline */}
              <div className={styles.panelSection}>
                <div className={styles.panelSectionLabel}>Status Transition Timeline</div>
                {(!selectedLead.status_history || selectedLead.status_history.length === 0) ? (
                  <div style={{ padding: 'var(--space-6) 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '12px' }}>
                    No status modifications processed.
                  </div>
                ) : (
                  <div className={styles.timeline}>
                    {selectedLead.status_history.map((hist: any, i: number) => {
                      const t = new Date(hist.fired_at || hist.changed_at);
                      return (
                        <div key={i} className={styles.timelineItem}>
                          <div className={styles.timelineDot}></div>
                          <div className={styles.timelineContent}>
                            <div className={styles.tlStatus}>
                              {hist.status.replace(/_/g, ' ').toUpperCase()}
                            </div>
                            <div className={styles.tlDate}>
                              {t.toLocaleDateString()} {t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                            <div className={styles.tlChannels}>
                              <span style={{ color: hist.meta_success !== false ? 'var(--color-success)' : 'var(--text-disabled)' }}>Meta</span>
                              <span style={{ color: 'var(--text-disabled)' }}>/</span>
                              <span style={{ color: hist.google_success !== false ? 'var(--color-success)' : 'var(--text-disabled)' }}>Google</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Panel Footer */}
            <div className={styles.panelFooter}>
              {confirmDeleteId === selectedLead.id ? (
                <div className={styles.panelDeletePrompt}>
                  <span>Delete this lead?</span>
                  <button
                    onClick={() => handleDeleteLead(selectedLead.id)}
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded text-xs font-bold"
                  >
                    Confirm Delete
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    className="px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-white rounded text-xs font-bold"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => handleDeleteLead(selectedLead.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-red-950/60 text-slate-400 hover:text-red-400 border border-slate-600 hover:border-red-500/30 rounded text-xs font-bold transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Lead</span>
                </button>
              )}
              <button
                onClick={() => setSelectedLead(null)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded text-xs font-bold transition-all"
              >
                Close Panel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal - Create Lead */}
      {isOpen && (
        <div className={styles.modalBackdrop} onClick={() => setIsOpen(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className={styles.modal}
          >
            <div className={styles.modalHeader}>
              <div>
                <h3 className={styles.modalTitle}>Manual Sandbox Lead</h3>
                <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                  Triggers automatic hashing and CAPI conversion
                </p>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className={styles.modalClose}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {error && (
              <div style={{ padding: '12px 16px', background: 'var(--color-danger-muted)', border: '1px solid rgba(242, 92, 92, 0.2)', color: 'var(--color-danger)', borderRadius: 'var(--radius-md)', fontSize: '12px', margin: '20px 24px 0' }}>
                <Info className="w-4 h-4 inline mr-2" />
                {error}
              </div>
            )}

            <form onSubmit={handleCreateLead} className={styles.modalBody}>
              <div className={styles.formGrid2}>
                <div className={styles.formField}>
                  <label className={styles.formLabel}>Lead Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. John Doe"
                  />
                </div>

                <div className={styles.formField}>
                  <label className={styles.formLabel}>CRM Origin</label>
                  <select
                    value={sourceCrm}
                    onChange={(e) => setSourceCrm(e.target.value)}
                  >
                    <option value="custom">Custom Webhook</option>
                    <option value="zoho">Zoho CRM</option>
                    <option value="salesforce">Salesforce CRM</option>
                    <option value="leadsquared">LeadSquared</option>
                  </select>
                </div>
              </div>

              <div className={styles.formGrid2}>
                <div className={styles.formField}>
                  <label className={styles.formLabel}>Email Address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="john@example.com"
                  />
                </div>

                <div className={styles.formField}>
                  <label className={styles.formLabel}>Phone Number</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="e.g. 9876543210"
                  />
                </div>
              </div>

              <div className={styles.formField}>
                <label className={styles.formLabel}>Google Click ID (_gcl_aw / GCLID)</label>
                <input
                  type="text"
                  value={gclaw}
                  onChange={(e) => setGclaw(e.target.value)}
                  placeholder="e.g. Cj0KCQjwy42qBhCeARIsAHg-sWj32rB..."
                />
              </div>

              <div style={{ paddingTop: 'var(--space-4)', borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-bold disabled:opacity-50"
                >
                  {submitting ? 'Creating...' : 'Trigger Lead Capture'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
