'use client';

import React, { useEffect, useState } from 'react';
import ReactFlow, { Background, Controls, Handle, Position } from 'reactflow';
import { useWorkspace } from '@/hooks/useWorkspace';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { STATUS_MAP } from '@/lib/statusMap';
import { GitFork, ArrowLeft, RefreshCw, ZoomIn, ZoomOut, Maximize, Pencil, Save, X, RotateCcw } from 'lucide-react';
import Link from 'next/link';

// Inject ReactFlow styles directly
import 'reactflow/dist/style.css';

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

const ActionIcon = () => (
  <span className="w-5 h-5 shrink-0 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center font-bold border border-blue-200">
    ⚡
  </span>
);

const TagIcon = () => (
  <span className="w-5 h-5 shrink-0 rounded-md bg-orange-50 text-orange-600 flex items-center justify-center font-bold border border-orange-200">
    🏷️
  </span>
);

// Custom Node Component
const CustomWorkflowNode = ({ data }: any) => {
  return (
    <div className={`p-4 rounded-xl bg-white border border-slate-200 shadow-sm w-[230px] text-xs relative transition-all hover:shadow-md ${data.borderColor}`}>
      <div className={`w-full h-1.5 absolute top-0 left-0 rounded-t-xl ${data.topColor}`} />
      
      {data.hasLeftHandle && (
        <Handle 
          type="target" 
          position={Position.Left} 
          style={{ background: '#94a3b8', width: 8, height: 8, border: '2px solid white' }} 
        />
      )}
      
      <div className="flex flex-col space-y-1.5 mt-0.5">
        <span className={`uppercase font-extrabold tracking-widest text-xs ${data.labelColor}`}>
          {data.typeLabel}
        </span>
        <div className="flex items-center space-x-2 text-slate-700 font-bold text-xs leading-tight">
          {data.icon}
          <span className="truncate">{data.content}</span>
        </div>
        {data.badge && (
          <span className={`px-2 py-0.5 rounded-full text-xs font-bold self-start mt-1 border ${data.badgeClass}`}>
            {data.badge}
          </span>
        )}
      </div>

      {data.hasRightHandle && (
        <Handle 
          type="source" 
          position={Position.Right} 
          style={{ background: '#94a3b8', width: 8, height: 8, border: '2px solid white' }} 
        />
      )}
    </div>
  );
};

const nodeTypes = {
  custom: CustomWorkflowNode,
};

export default function WorkflowBuilder() {
  const { activeWorkspace, user } = useWorkspace();
  const [conversions, setConversions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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

  // Editable signal-mapping state: lead status -> Meta/Google event name.
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeWorkspace?.slug) return;
    authFetch(`/api/workspaces/${activeWorkspace.slug}/event-mappings`)
      .then((res) => res.json())
      .then((data) => setOverrides(data.overrides || {}))
      .catch((e) => console.error('Failed to load event mappings:', e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspace?.slug]);

  const effectiveEventName = (statusKey: string) => overrides[statusKey] || STATUS_MAP[statusKey] || 'EI_Event';

  const startEditing = () => {
    const merged: Record<string, string> = {};
    Object.keys(STATUS_MAP).forEach((k) => {
      merged[k] = overrides[k] || STATUS_MAP[k];
    });
    setDraft(merged);
    setMapError(null);
    setEditing(true);
  };

  const saveMappings = async () => {
    if (!activeWorkspace?.slug) return;
    setSaving(true);
    setMapError(null);
    try {
      // Only persist entries that differ from the built-in default.
      const changed: Record<string, string> = {};
      Object.keys(STATUS_MAP).forEach((k) => {
        if (draft[k] && draft[k].trim() && draft[k].trim() !== STATUS_MAP[k]) {
          changed[k] = draft[k].trim();
        }
      });
      const res = await authFetch(`/api/workspaces/${activeWorkspace.slug}/event-mappings`, {
        method: 'POST',
        body: JSON.stringify({ overrides: changed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save mappings.');
      setOverrides(changed);
      setEditing(false);
    } catch (e: any) {
      setMapError(e.message || 'Failed to save mappings.');
    } finally {
      setSaving(false);
    }
  };

  // Sync conversions in real-time
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
        const list: any[] = [];
        snapshot.forEach((doc) => {
          list.push(doc.data());
        });
        setConversions(list);
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching conversions in workflow:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [activeWorkspace?.id]);

  // Construct workflow nodes dynamically from STATUS_MAP and workspace config
  const getWorkflowElements = () => {
    const nodes: any[] = [];
    const edges: any[] = [];

    const statuses = Object.keys(STATUS_MAP);
    const metaPixel = activeWorkspace?.meta_pixel_id || 'Amara Pixel V1';
    const googleAds = activeWorkspace?.google_ads_customer_id || 'Amara-Deevyashakti';

    statuses.forEach((statusKey, i) => {
      const eventName = effectiveEventName(statusKey);
      const labelName = statusKey.toUpperCase().replace(/_/g, ' ');
      const rowY = i * 160 + 50;

      // 1. Column 1: Action Node (Blue)
      nodes.push({
        id: `action_${statusKey}`,
        type: 'custom',
        position: { x: 40, y: rowY },
        data: {
          typeLabel: 'Lead Lifecycle Action',
          content: labelName,
          topColor: 'bg-blue-500',
          labelColor: 'text-blue-500',
          borderColor: 'border-blue-100 hover:border-blue-300',
          icon: <ActionIcon />,
          hasLeftHandle: false,
          hasRightHandle: true,
        },
      });

      // 2. Column 2: Tag Node (Orange)
      nodes.push({
        id: `tag_${statusKey}`,
        type: 'custom',
        position: { x: 340, y: rowY },
        data: {
          typeLabel: 'Lead Segmentation',
          content: 'All Leads Segment',
          topColor: 'bg-orange-500',
          labelColor: 'text-orange-500',
          borderColor: 'border-orange-100 hover:border-orange-300',
          badge: 'All Leads',
          badgeClass: 'bg-orange-50 text-orange-600 border-orange-150',
          icon: <TagIcon />,
          hasLeftHandle: true,
          hasRightHandle: true,
        },
      });

      // 3. Column 3: Accounts (2 Accounts)
      // Meta Account (Row offset -35)
      nodes.push({
        id: `meta_acc_${statusKey}`,
        type: 'custom',
        position: { x: 640, y: rowY - 35 },
        data: {
          typeLabel: 'Ad Platform Integration',
          content: `Meta: act_${metaPixel.length > 15 ? metaPixel.substring(0, 10) + '...' : metaPixel}`,
          topColor: 'bg-indigo-500',
          labelColor: 'text-indigo-500',
          borderColor: 'border-indigo-100 hover:border-indigo-300',
          icon: <FacebookIcon />,
          hasLeftHandle: true,
          hasRightHandle: true,
        },
      });

      // Google Account (Row offset +35)
      nodes.push({
        id: `google_acc_${statusKey}`,
        type: 'custom',
        position: { x: 640, y: rowY + 35 },
        data: {
          typeLabel: 'Ad Platform Integration',
          content: `Google Ads: ${googleAds}`,
          topColor: 'bg-indigo-500',
          labelColor: 'text-indigo-500',
          borderColor: 'border-indigo-100 hover:border-indigo-300',
          icon: <GoogleIcon />,
          hasLeftHandle: true,
          hasRightHandle: true,
        },
      });

      // 4. Column 4: Mapped Conversions (2 Event targets)
      // Meta Conversion Event
      nodes.push({
        id: `meta_conv_${statusKey}`,
        type: 'custom',
        position: { x: 940, y: rowY - 35 },
        data: {
          typeLabel: 'Conversion Signal',
          content: eventName,
          topColor: 'bg-emerald-500',
          labelColor: 'text-emerald-500',
          borderColor: 'border-emerald-100 hover:border-emerald-300',
          badge: 'Meta Pixel Upload',
          badgeClass: 'bg-blue-50 text-blue-600 border-blue-150',
          hasLeftHandle: true,
          hasRightHandle: false,
        },
      });

      // Google Conversion Event
      nodes.push({
        id: `google_conv_${statusKey}`,
        type: 'custom',
        position: { x: 940, y: rowY + 35 },
        data: {
          typeLabel: 'Conversion Signal',
          content: eventName,
          topColor: 'bg-emerald-500',
          labelColor: 'text-emerald-500',
          borderColor: 'border-emerald-100 hover:border-emerald-300',
          badge: 'Google Click Upload',
          badgeClass: 'bg-amber-50 text-amber-600 border-amber-150',
          hasLeftHandle: true,
          hasRightHandle: false,
        },
      });

      // 5. Connect Elements via step edges
      edges.push({
        id: `e1_${statusKey}`,
        source: `action_${statusKey}`,
        target: `tag_${statusKey}`,
        type: 'smoothstep',
        style: { stroke: '#cbd5e1', strokeWidth: 2 },
      });

      edges.push({
        id: `e2_${statusKey}`,
        source: `tag_${statusKey}`,
        target: `meta_acc_${statusKey}`,
        type: 'smoothstep',
        style: { stroke: '#cbd5e1', strokeWidth: 2 },
      });

      edges.push({
        id: `e3_${statusKey}`,
        source: `tag_${statusKey}`,
        target: `google_acc_${statusKey}`,
        type: 'smoothstep',
        style: { stroke: '#cbd5e1', strokeWidth: 2 },
      });

      edges.push({
        id: `e4_${statusKey}`,
        source: `meta_acc_${statusKey}`,
        target: `meta_conv_${statusKey}`,
        type: 'smoothstep',
        style: { stroke: '#cbd5e1', strokeWidth: 2 },
      });

      edges.push({
        id: `e5_${statusKey}`,
        source: `google_acc_${statusKey}`,
        target: `google_conv_${statusKey}`,
        type: 'smoothstep',
        style: { stroke: '#cbd5e1', strokeWidth: 2 },
      });
    });

    return { nodes, edges };
  };

  const { nodes, edges } = getWorkflowElements();

  return (
    <div className="space-y-6 animate-fadeIn h-[calc(100vh-140px)] flex flex-col">
      {/* Visual Canvas Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between space-y-4 sm:space-y-0 shrink-0">
        <div>
          <div className="flex items-center space-x-2">
            <Link href={`/${activeWorkspace?.slug}`} className="text-slate-600 hover:text-slate-800 transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Signal Flow Workflow</h1>
          </div>
          <p className="text-slate-600 text-sm mt-0.5 font-medium ml-6">
            Visual model tracing lead transitions to connected Meta Pixels and Google Ads conversion upload channels.
          </p>
        </div>

        <div className="flex items-center space-x-3 self-start sm:self-auto">
          {loading && (
            <div className="flex items-center space-x-2 text-xs text-slate-600">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Syncing workflows...</span>
            </div>
          )}
          {!editing ? (
            <button
              onClick={startEditing}
              className="flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-xl text-xs font-bold shadow-sm transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
              <span>Edit Signal Mappings</span>
            </button>
          ) : (
            <>
              <button
                onClick={() => setEditing(false)}
                disabled={saving}
                className="flex items-center space-x-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-xl text-xs font-bold shadow-sm transition-colors disabled:opacity-50"
              >
                <X className="w-3.5 h-3.5" />
                <span>Cancel</span>
              </button>
              <button
                onClick={saveMappings}
                disabled={saving}
                className="flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-xl text-xs font-bold shadow-sm transition-colors disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{saving ? 'Saving...' : 'Save Mappings'}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Editable Signal Mapping Panel */}
      {editing && (
        <div className="shrink-0 bg-white border border-slate-200 rounded-2xl shadow-sm p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800">
              Lead Status → Conversion Event Mapping
            </h2>
            <p className="text-xs text-slate-500">
              Overrides apply to this workspace only. Leave a field as-is to use the platform default.
            </p>
          </div>
          {mapError && (
            <div className="text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {mapError}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.keys(STATUS_MAP).map((statusKey) => (
              <div key={statusKey} className="flex items-center justify-between space-x-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                <div className="flex flex-col min-w-0">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide truncate">
                    {statusKey.replace(/_/g, ' ')}
                  </span>
                  <span className="text-[10px] text-slate-400">default: {STATUS_MAP[statusKey]}</span>
                </div>
                <input
                  value={draft[statusKey] ?? STATUS_MAP[statusKey]}
                  onChange={(e) => setDraft((d) => ({ ...d, [statusKey]: e.target.value }))}
                  className="w-32 text-xs font-semibold border border-slate-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ReactFlow Visualizer Container */}
      <div className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden shadow-sm relative min-h-[500px]">
        {loading ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-50/80 backdrop-blur-sm">
            <div className="text-center space-y-3">
              <GitFork className="w-10 h-10 mx-auto text-indigo-500 animate-pulse" />
              <p className="text-sm font-semibold text-slate-600">Generating live channel flows...</p>
            </div>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            nodesConnectable={false}
            nodesDraggable={false}
            elementsSelectable={false}
            zoomOnScroll={true}
            zoomOnPinch={true}
            panOnDrag={true}
            className="select-none"
          >
            <Background color="#cbd5e1" gap={16} size={1} />
            <Controls 
              showInteractive={false}
              className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden p-1 space-y-1"
            />
          </ReactFlow>
        )}

        {/* Legend Indicator Overlay */}
        <div className="absolute bottom-4 left-4 z-10 bg-white/90 backdrop-blur-sm border border-slate-200 p-3.5 rounded-xl shadow-md text-xs text-slate-600 font-semibold space-y-2">
          <span className="font-bold text-slate-800 uppercase tracking-widest text-xs block">Workflow Legend</span>
          <div className="flex flex-col space-y-1.5">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded bg-blue-500 border border-blue-600 shrink-0" />
              <span>CRM Status Trigger Action</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded bg-orange-500 border border-orange-600 shrink-0" />
              <span>Target Tag Segment list</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded bg-purple-500 border border-purple-600 shrink-0" />
              <span>Connected Ad Platforms</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded bg-emerald-500 border border-emerald-600 shrink-0" />
              <span>Conversion Event Signal</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
