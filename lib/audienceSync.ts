import { adminDb } from '@/lib/firebaseAdmin';
import { decrypt } from '@/lib/encrypt';
import { statusMatchesTag, AudienceTag } from '@/lib/statusMap';
import { Workspace, Audience, Lead } from '@/types';

export interface AudienceMember {
  email_sha256: string;
  phone_sha256: string;
}

export interface SyncResult {
  success: boolean;
  size: number;
  externalAudienceId?: string | null;
  error?: string;
}

/**
 * Scans the workspace's leads and returns the deduplicated hashed identifiers
 * of every lead whose status qualifies for the audience's tag.
 */
export async function collectAudienceMembers(
  workspaceId: string,
  tag: AudienceTag
): Promise<AudienceMember[]> {
  const leadsSnap = await adminDb
    .collection('workspaces')
    .doc(workspaceId)
    .collection('leads')
    .get();

  const seen = new Set<string>();
  const members: AudienceMember[] = [];

  leadsSnap.forEach((doc: any) => {
    const lead = doc.data();
    if (!statusMatchesTag(lead.lead_status || '', tag)) return;

    const email = lead.email_sha256 || '';
    const phone = lead.phone_sha256 || '';
    if (!email && !phone) return; // nothing to match on

    const dedupeKey = `${email}|${phone}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);

    members.push({ email_sha256: email, phone_sha256: phone });
  });

  return members;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// Meta Custom Audiences
// ─────────────────────────────────────────────────────────────────────────

const META_GRAPH = 'https://graph.facebook.com/v18.0';

async function createMetaCustomAudience(
  adAccountId: string,
  accessToken: string,
  audience: Audience
): Promise<{ id?: string; error?: string }> {
  const res = await fetch(`${META_GRAPH}/${adAccountId}/customaudiences`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `${audience.name} [MOJOINSIGHTS]`,
      subtype: 'CUSTOM',
      description: audience.description || `MOJOINSIGHTS ${audience.tag} segment`,
      customer_file_source: 'USER_PROVIDED_ONLY',
      retention_days: audience.retention_days || 540,
      access_token: accessToken,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok && data.id) return { id: data.id };
  return { error: data.error?.message || `Meta create audience failed (${res.status})` };
}

/** Adds or removes hashed members on an existing Meta Custom Audience. */
async function mutateMetaUsers(
  audienceId: string,
  accessToken: string,
  members: AudienceMember[],
  op: 'ADD' | 'REMOVE'
): Promise<{ count: number; error?: string }> {
  let count = 0;
  // Meta accepts up to 10k rows per request; stay well under.
  for (const batch of chunk(members, 5000)) {
    const data = batch.map((m) => [m.email_sha256 || '', m.phone_sha256 || '']);
    const res = await fetch(`${META_GRAPH}/${audienceId}/users`, {
      method: op === 'ADD' ? 'POST' : 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: accessToken,
        payload: { schema: ['EMAIL', 'PHONE'], data },
      }),
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok || result.error) {
      return { count, error: result.error?.message || `Meta user upload failed (${res.status})` };
    }
    count += result.num_received ?? batch.length;
  }
  return { count };
}

async function syncMetaCustomAudience(
  workspace: Workspace,
  audience: Audience,
  members: AudienceMember[]
): Promise<SyncResult> {
  const adAccountId = workspace.meta_ad_account_id;
  if (!adAccountId) {
    return { success: false, size: 0, error: 'Meta Ad Account ID is not configured in Settings.' };
  }
  if (!workspace.meta_access_token) {
    return { success: false, size: 0, error: 'Meta access token is not configured.' };
  }
  const accessToken = decrypt(workspace.meta_access_token);

  // Create the Custom Audience on first sync, reuse its id afterwards.
  let audienceId = audience.external_audience_id || null;
  if (!audienceId) {
    const created = await createMetaCustomAudience(adAccountId, accessToken, audience);
    if (created.error || !created.id) {
      return { success: false, size: 0, error: created.error || 'Could not create Meta audience.' };
    }
    audienceId = created.id;
  }

  if (members.length === 0) {
    return { success: true, size: 0, externalAudienceId: audienceId };
  }

  const upload = await mutateMetaUsers(audienceId, accessToken, members, 'ADD');
  if (upload.error) {
    return { success: false, size: 0, externalAudienceId: audienceId, error: upload.error };
  }

  return { success: true, size: members.length, externalAudienceId: audienceId };
}

// ─────────────────────────────────────────────────────────────────────────
// Google Customer Match
// ─────────────────────────────────────────────────────────────────────────

const GOOGLE_ADS = 'https://googleads.googleapis.com/v15';

async function getGoogleAccessToken(refreshToken: string): Promise<{ token?: string; error?: string }> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return { error: 'Server is missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET.' };
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    return {
      error: /invalid_grant/i.test(err)
        ? 'Google refresh token expired — reconnect the account.'
        : `OAuth failed: ${err.slice(0, 120)}`,
    };
  }
  const data = await res.json();
  return { token: data.access_token };
}

async function syncGoogleCustomerMatch(
  workspace: Workspace,
  audience: Audience,
  members: AudienceMember[]
): Promise<SyncResult> {
  const customerId = (workspace.google_ads_customer_id || '').replace(/-/g, '');
  if (!customerId || !workspace.google_ads_developer_token || !workspace.google_ads_refresh_token) {
    return {
      success: false,
      size: 0,
      error: 'Google Ads customer ID, developer token, or OAuth connection is missing.',
    };
  }

  const devToken = decrypt(workspace.google_ads_developer_token);
  const refreshToken = decrypt(workspace.google_ads_refresh_token);

  const tokenRes = await getGoogleAccessToken(refreshToken);
  if (tokenRes.error || !tokenRes.token) {
    return { success: false, size: 0, error: tokenRes.error || 'Could not obtain Google access token.' };
  }
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${tokenRes.token}`,
    'developer-token': devToken,
  };

  // 1. Create the Customer Match user list on first sync.
  let userListResource = audience.external_audience_id || null;
  if (!userListResource) {
    const res = await fetch(`${GOOGLE_ADS}/customers/${customerId}/userLists:mutate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        operations: [
          {
            create: {
              name: `${audience.name} [MOJOINSIGHTS] ${Date.now()}`,
              description: audience.description || `MOJOINSIGHTS ${audience.tag} segment`,
              membershipStatus: 'OPEN',
              membershipLifeSpan: audience.retention_days || 540,
              crmBasedUserList: { uploadKeyType: 'CONTACT_INFO', dataSourceType: 'FIRST_PARTY' },
            },
          },
        ],
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error || !data.results?.[0]?.resourceName) {
      return { success: false, size: 0, error: data.error?.message || `Google create user list failed (${res.status})` };
    }
    userListResource = data.results[0].resourceName;
  }

  if (members.length === 0) {
    return { success: true, size: 0, externalAudienceId: userListResource };
  }

  // 2. Create an offline user data job tied to the user list.
  const jobRes = await fetch(`${GOOGLE_ADS}/customers/${customerId}/offlineUserDataJobs:create`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      job: {
        type: 'CUSTOMER_MATCH_USER_LIST',
        customerMatchUserListMetadata: { userList: userListResource },
      },
    }),
  });
  const jobData = await jobRes.json().catch(() => ({}));
  if (!jobRes.ok || jobData.error || !jobData.resourceName) {
    return { success: false, size: 0, externalAudienceId: userListResource, error: jobData.error?.message || `Google create job failed (${jobRes.status})` };
  }
  const jobResource = jobData.resourceName;

  // 3. Add hashed identifiers in batches.
  for (const batch of chunk(members, 5000)) {
    const operations = batch.map((m) => {
      const userIdentifiers: any[] = [];
      if (m.email_sha256) userIdentifiers.push({ hashedEmail: m.email_sha256 });
      if (m.phone_sha256) userIdentifiers.push({ hashedPhoneNumber: m.phone_sha256 });
      return { create: { userIdentifiers } };
    });

    const addRes = await fetch(`${GOOGLE_ADS}/${jobResource}:addOperations`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ operations, enablePartialFailure: true }),
    });
    const addData = await addRes.json().catch(() => ({}));
    if (!addRes.ok || addData.error) {
      return { success: false, size: 0, externalAudienceId: userListResource, error: addData.error?.message || `Google addOperations failed (${addRes.status})` };
    }
  }

  // 4. Run the job (Google processes it asynchronously).
  const runRes = await fetch(`${GOOGLE_ADS}/${jobResource}:run`, { method: 'POST', headers, body: '{}' });
  if (!runRes.ok) {
    const runErr = await runRes.json().catch(() => ({}));
    return { success: false, size: 0, externalAudienceId: userListResource, error: runErr.error?.message || `Google run job failed (${runRes.status})` };
  }

  return { success: true, size: members.length, externalAudienceId: userListResource };
}

// ─────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────

/**
 * Full batch sync of one audience: collects every qualifying lead and pushes
 * the segment to the relevant ad platform. Used by the manual "Sync" action.
 */
export async function syncAudience(workspace: Workspace, audience: Audience): Promise<SyncResult> {
  const members = await collectAudienceMembers(workspace.id, audience.tag);

  if (audience.platform === 'meta') {
    return syncMetaCustomAudience(workspace, audience, members);
  }
  if (audience.platform === 'google') {
    return syncGoogleCustomerMatch(workspace, audience, members);
  }
  return { success: false, size: 0, error: `Unknown platform '${audience.platform}'.` };
}

/**
 * Incremental real-time sync for a single lead transition. Adds the lead's
 * hashed identifiers to every already-provisioned audience whose tag matches
 * the new status (and removes it from the opposite tag). Audiences that have
 * not been created on-platform yet are skipped — no fake IDs are minted.
 *
 * Intended for a Firestore onLeadStatusChange trigger. The Vercel app uses the
 * batch syncAudience() path instead.
 */
export async function syncLeadToAudiences(
  workspace: Workspace,
  lead: Lead,
  newStatus: string
): Promise<void> {
  const status = (newStatus || '').toLowerCase().trim();
  const member: AudienceMember = {
    email_sha256: lead.email_sha256 || '',
    phone_sha256: lead.phone_sha256 || '',
  };
  if (!member.email_sha256 && !member.phone_sha256) return;

  const isPositive = statusMatchesTag(status, 'Positive Stage');
  const isNegative = statusMatchesTag(status, 'Negative Stage');
  if (!isPositive && !isNegative) return; // neutral status — nothing to do

  const addTag: AudienceTag = isPositive ? 'Positive Stage' : 'Negative Stage';
  const removeTag: AudienceTag = isPositive ? 'Negative Stage' : 'Positive Stage';

  const audSnap = await adminDb.collection('workspaces').doc(workspace.id).collection('audiences').get();

  for (const doc of audSnap.docs) {
    const audience = doc.data() as Audience;
    if (!audience.external_audience_id) continue; // not provisioned on-platform yet

    const op: 'ADD' | 'REMOVE' | null =
      audience.tag === addTag ? 'ADD' : audience.tag === removeTag ? 'REMOVE' : null;
    if (!op) continue;

    try {
      if (audience.platform === 'meta' && workspace.meta_access_token) {
        const token = decrypt(workspace.meta_access_token);
        await mutateMetaUsers(audience.external_audience_id, token, [member], op);
      } else if (audience.platform === 'google' && op === 'ADD') {
        // Google Customer Match removals require a separate job; only ADD is
        // handled incrementally — periodic batch syncAudience() reconciles the rest.
        await syncGoogleCustomerMatch(workspace, audience, [member]);
      }
    } catch (e: any) {
      console.error(`[Audience Sync] ${audience.platform} ${op} failed for ${audience.id}:`, e.message);
    }
  }
}
