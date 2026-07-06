# DIGICHECK — How It Works & Client Setup Guide

Internal conversion-tracking platform (clone of easyinsights.ai). It receives CRM
leads, hashes their PII, fires server-side **Meta Conversions API** and optionally
**Google Ads** conversion events, and shows live dashboards — one isolated
workspace per client.

---

## 1. How the app works

### The pipeline

```
 Client's CRM  ──webhook──▶  /api/webhooks/<slug>/<crm>
 (Zoho, SF,                        │
  LeadSquared,                     ▼
  custom)              Normalise + hash email/phone (SHA-256)
                                   │
                                   ▼
                     Save / update lead in Firestore
                     workspaces/<id>/leads
                                   │
                          ┌────────┴────────┐
                          ▼                 ▼
                   Meta CAPI event    Google Ads event
                   (/events POST)     (click conversion, needs gclid)
                          │                 │
                          ▼                 ▼
                   Increment conversions counters
                                   │
                                   ▼
                   Dashboard updates in real time
                   (Firestore onSnapshot listeners)
```

### Key concepts

- **Workspace = one client.** Each has its own slug, webhook secret, Meta pixel,
  Google account, leads, and conversion counters. Switch clients with the
  **Active Client** dropdown (bottom-left sidebar).
- **Lead lifecycle status drives events.** When a lead is created or its
  `lead_status` changes, the matching `EI_*` event fires to Meta/Google.
- **All writes are server-side** (Firebase Admin SDK). The browser only *reads*
  the dashboard, governed by Firestore security rules (members-only).
- **PII is hashed** before leaving the server (email lowercased→SHA-256; phone
  digits-only, `91` prefixed for 10-digit Indian numbers→SHA-256). Raw PII is
  never sent to Meta/Google.

### Lead status → conversion event mapping

The CRM's status value (case-insensitive) maps to the event sent:

| CRM lead status      | Event fired           |
|----------------------|-----------------------|
| `new`                | `EI_New`              |
| `interested`         | `EI_Interested`       |
| `in_call_center`     | `EI_InCallCenter`     |
| `visit_done`         | `EI_Visit_Done`       |
| `final_negotiation`  | `EI_Final_negotiation`|
| `claimed`            | `EI_Claimed`          |
| `junk`               | `EI_Junk`             |
| `failed`             | `EI_Failed`           |

A status not in this list is stored but fires **no** event. New leads with an
unmapped status default to `EI_New`.

---

## 2. One-time platform setup (already done)

These are configured once for the whole platform, not per client:

- **Firebase project:** `insight-meta` (Firestore + Auth).
- **Auth:** Google sign-in, restricted to `@digitalmojo.in`.
- **Firestore rules + indexes:** deployed from `firestore.rules` /
  `firestore.indexes.json`.
- **Hosting:** Vercel — env vars set in the Vercel dashboard (see `.env.example`).

If standing up a fresh environment, see `SETUP.md`.

---

## 3. Onboarding a new client

### Step 1 — Create the workspace

1. Sign in (Google, `@digitalmojo.in`).
2. Sidebar → **+ Add Client Tenant** (or the **Create Workspace** screen on first login).
3. Enter the **Client Name** and a **slug** (e.g. `amara-realty`).
   - The slug defines all the client's webhook URLs — keep it short and stable.

### Step 2 — Meta Conversions API (per client)

Each client has their **own** Meta pixel and CAPI token.

1. In the client's Meta **Business Manager** → Events Manager → the client's
   **Pixel/Dataset** → note the **Pixel ID**.
2. Business Settings → **System Users** → generate a token with the
   **`ads_management`** (Conversions API) permission, and assign the **pixel asset**
   to that system user.
3. In DIGICHECK → **Settings → Meta CAPI Integration**:
   - **Meta Pixel ID** → the pixel ID
   - **Meta Conversions Access Token** → the system-user token
   - **Test Event Code** (optional) → from Events Manager → **Test Events** tab.
     If set, the verification routes to the Test Events view only (no production data).
4. Click **Test Connection**. It sends a **real CAPI test event** and reports:
   - ✅ *"Verified — Meta accepted a live CAPI test event."* → good.
   - ❌ *"Access token is invalid or expired."* → regenerate the token.
   - ❌ *"Token lacks Conversions API permission for this pixel."* → fix the
     system-user permission / pixel asset assignment.
   - ❌ *"Pixel ID not found or incorrect."* → wrong pixel ID.
5. Click **Save credentials.** Save is **blocked** if the token can't actually
   send events — so bad tokens are caught now, not weeks later.

### Step 3 — Google Ads (optional, per client)

Skip if you only need Meta. Google events require a **gclid** on the lead.

1. **Settings → Google Ads API**:
   - **Google Ads Customer ID** (e.g. `123-456-7890`)
   - **Developer Token**
2. Click **Connect Google OAuth** → authorize → returns a refresh token.
3. For conversions to fire, incoming leads must carry a Google click id in
   `_gcl_aw` (or the CRM-mapped field below). No gclid = Google event skipped
   (Meta still fires).

### Step 4 — CRM webhook (per client)

1. **Settings → Webhooks Registry** → **Regenerate Key** → copy the **secret**
   (shown once).
2. Copy the endpoint URL for the client's CRM (also on that page):
   ```
   https://<your-domain>/api/webhooks/<slug>/custom
   https://<your-domain>/api/webhooks/<slug>/zoho
   https://<your-domain>/api/webhooks/<slug>/salesforce
   https://<your-domain>/api/webhooks/<slug>/leadsquared
   ```
3. In the client's CRM, add an **outbound webhook / workflow** that POSTs on lead
   create + status change, with the header:
   ```
   x-webhook-secret: <the secret>
   ```
   (The secret may instead be passed as `?secret=...` in the URL or a
   `webhook_secret` body field.)

#### What each adapter reads from the payload

All adapters need at minimum an **email or phone** and a **status**. Field names
are matched flexibly:

| Field        | Custom            | Zoho                          | Salesforce                  | LeadSquared                    |
|--------------|-------------------|-------------------------------|-----------------------------|--------------------------------|
| Unique ID    | `external_id`     | `id` / `Lead_ID`              | `Id` / `LeadId`             | `LeadIdentifier` / `LeadId`    |
| Name         | `name`            | `Full_Name` / First+Last      | `Name` / First+Last         | `Name` / First+Last            |
| Email        | `email`           | `Email`                       | `Email`                     | `EmailAddress`                 |
| Phone        | `phone`           | `Phone` / `Mobile`            | `Phone` / `MobilePhone`     | `Phone` / `Mobile`             |
| Status       | `lead_status`     | `Lead_Status`                 | `Status`                    | `LeadStatus`                   |
| Google gclid | `_gcl_aw`         | `Gclid`                       | `GoogleClickId`             | `GCLID`                        |
| Meta fbc     | `_fbc`            | `fbclid`                      | `FacebookClickId`           | `FBCID`                        |

#### Minimal `custom` payload

```json
{
  "external_id": "lead_123",
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "9876543210",
  "lead_status": "new",
  "_gcl_aw": "optional-google-click-id",
  "_fbc": "optional-meta-click-id"
}
```

- **`external_id`** must be stable per lead — the same value on a status update
  edits the existing lead (and fires the new event) instead of creating a duplicate.

### Step 5 — Verify it's live

```bash
curl -X POST https://<your-domain>/api/webhooks/<slug>/custom \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: <secret>" \
  -d '{"external_id":"verify_1","name":"Verify Lead","email":"verify@test.com","phone":"9123456789","lead_status":"new"}'
```

Expected: `{"success":true,"action":"create","id":"..."}`. Then send the same
`external_id` with `"lead_status":"interested"` → `{"action":"update"}` and an
`EI_Interested` event fires.

---

## 4. What you need to see LIVE data on the dashboard

A checklist — leads only appear when **all** of these are true:

1. **Firebase client config** points to `insight-meta`
   (`NEXT_PUBLIC_FIREBASE_*` env vars set in Vercel; redeploy after changes —
   these are baked in at build time).
2. **Firestore security rules published** (members-only read). Without them the
   browser's read is blocked and the dashboard shows empty.
3. **You are a member** of the client's workspace (creator is automatically;
   invited colleagues are added on their first login via the invite sync).
4. **The workspace exists** and you've selected it in the **Active Client** dropdown.
5. **The CRM webhook is configured** with the **correct current secret** and is
   actually POSTing (test with the curl above).
6. For **Meta** events to register in Events Manager: valid **Pixel ID + CAPI
   token** saved (Test Connection green).
7. For **Google** events: **Customer ID + Developer Token + OAuth refresh token**
   saved, **and** leads carry a `gclid`.

If the dashboard is empty but the webhook curl returns `success:true`, the lead
**is** in Firestore — the issue is #1–#4 (client config / rules / membership /
wrong workspace selected), not ingestion.

---

## 5. Quick troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Webhook `Unauthorized secret` | Secret in CRM ≠ Firestore secret | Regenerate in Settings, update the CRM |
| `success:true` but no leads on dashboard | Firestore rules not published, or wrong workspace selected | Publish `firestore.rules`; check Active Client dropdown |
| Meta "Test Connection" fails (code 190) | Token invalid/expired | Generate a new system-user CAPI token |
| Meta fails (code 200/10) | Token lacks CAPI permission for the pixel | Assign pixel asset + `ads_management` to the system user |
| Google events never fire | No `gclid` on the lead, or OAuth not connected | Ensure CRM passes the click id; connect Google OAuth |
| Login `auth/unauthorized-domain` | Domain not in Firebase authorized list | Firebase → Auth → Settings → Authorized domains |
| Colleague can't see a client | Invite not yet resolved | They must sign in once; ensure `members_v2` index is deployed |

---

## 6. Endpoint reference

| Purpose | Method | Path |
|---------|--------|------|
| Custom CRM webhook | POST | `/api/webhooks/<slug>/custom` |
| Zoho / Salesforce / LeadSquared | POST | `/api/webhooks/<slug>/{zoho\|salesforce\|leadsquared}` |
| Create workspace | POST | `/api/workspaces` (auth) |
| Save Meta creds | POST | `/api/workspaces/<slug>/meta` (auth) |
| Verify Meta token | POST | `/api/workspaces/<slug>/meta/test` (auth) |
| Save Google creds | POST | `/api/workspaces/<slug>/google` (auth) |
| Regenerate webhook secret | POST | `/api/workspaces/<slug>/webhook-secret` (auth) |
| List leads | GET | `/api/leads/<slug>` |

> Webhook endpoints always return HTTP 200 (even on auth failure) so CRMs don't
> disable the webhook on errors — check the `success` field in the JSON body.
