export interface Workspace {
  id: string;
  name: string;
  slug: string;
  owner_uid: string;
  members: string[];
  meta_pixel_id: string;
  meta_access_token: string;
  meta_ad_account_id?: string; // act_XXXX — required for Custom Audience sync
  google_ads_customer_id: string;
  google_ads_developer_token: string;
  google_ads_refresh_token: string;
  google_ads_account_name?: string;
  webhook_secret: string;
  custom_stage_map?: Record<string, string>;
  meta_pixel_name?: string;
  selldo_api_key?: string;
  selldo_last_synced_at?: any; // Firestore Timestamp
  created_at: any; // Firestore Timestamp
}

export interface StatusHistoryItem {
  status: string;
  changed_at: number; // Unix timestamp
  source: string; // e.g. "webhook" | "manual"
  ei_event_fired: string; // e.g. "EI_New", "EI_Junk"
}

export interface Lead {
  id: string;
  workspace_id: string;
  source_crm: string; // zoho | salesforce | leadsquared | custom
  external_id: string;
  name: string;
  email: string;
  phone: string;
  email_sha256: string;
  phone_sha256: string;
  lead_status: string;
  status_history: StatusHistoryItem[];
  page_url: string;
  referrer: string;
  user_agent: string;
  _ga: string;
  _gcl_aw: string;
  _fbc: string;
  _fbp: string;
  _ei_sid: string;
  cookie_str: string;
  meta_event_fired?: string;
  google_event_fired?: string;
  last_fired_at?: any; // Firestore Timestamp — set on first successful CAPI fire
  client_ip?: string;
  created_at: any; // Firestore Timestamp
  updated_at: any; // Firestore Timestamp
  raw_payload: Record<string, any>;
}

export interface Conversion {
  id: string;
  name: string;
  platform: 'meta' | 'google';
  account_name: string;
  event_name: string;
  count: number;
  last_fired_at: any; // Firestore Timestamp
  created_at: any; // Firestore Timestamp
}

export interface Audience {
  id: string;
  name: string;
  description: string;
  platform: 'meta' | 'google';
  account_name: string;
  tag: 'Positive Stage' | 'Negative Stage';
  size: number;
  retention_days: number;
  status: 'Pending Sync' | 'Syncing' | 'Synced' | 'Error' | 'Usable' | 'Not Usable';
  external_audience_id: string | null;
  sync_error?: string | null;
  last_synced_at?: any; // Firestore Timestamp
  created_at: any; // Firestore Timestamp
}

export interface WorkflowNode {
  id: string; // Unique node identifier (e.g. "node_1")
  type: 'action' | 'tag' | 'account' | 'conversion';
  label: string;
  connected_to: string[]; // Target Node IDs
  platform?: 'meta' | 'google';
  conversion_name?: string;
}

export interface Workflow {
  id: string;
  name: string;
  nodes: WorkflowNode[];
  created_at: any; // Firestore Timestamp;
}
