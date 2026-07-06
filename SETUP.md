# DIGICHECK — Internal Setup Guide

Replacing easyinsights.ai internally. Phase 1 (security) is done in code.
This guide covers the console/config steps only you can do.

## 1. Firebase Console (project: insight-meta)

### Enable Google sign-in
1. Authentication → Sign-in method → **Google** → Enable → Save.
2. Authentication → Settings → Authorized domains → add:
   - `localhost`
   - your Vercel domain (e.g. `digicheck.vercel.app`) once deployed

### Publish Firestore security rules
1. Firestore Database → **Rules** tab.
2. Paste the contents of `firestore.rules` (in this repo) → **Publish**.
   - Locks reads to workspace members; all writes are server-side (Admin SDK).

## 2. Environment variables

Local `.env.local` already has these. For Vercel, add them in
Project → Settings → Environment Variables (same keys):

| Key | Notes |
|-----|-------|
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Full service-account JSON, one line |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Client config |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `insight-meta.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `insight-meta` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | |
| `ENCRYPTION_KEY` | 32+ char random string (token encryption) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Only if using Google Ads |
| `NEXT_PUBLIC_ALLOWED_AUTH_DOMAIN` | Optional: restrict login to `yourcompany.com` |

## 3. First login & workspace creation

1. Run `npm run dev` (or open the Vercel URL).
2. Click **Sign in with Google** → use your office account.
3. First time you'll have no workspaces → redirected to **Create Workspace**.
4. Create one per client (name + slug). The slug defines the webhook URL.

> The old test workspaces (`deevyashakti`, `deevyashaktirealty`) are owned by
> the retired sandbox user and won't appear after Google login. Recreate the
> ones you need — cleaner than migrating the duplicates.

## 4. Per-client onboarding (repeat per client)

1. Create the client's workspace (step 3).
2. Settings → **Meta CAPI Integration** → enter that client's Pixel ID + token → Save.
3. Settings → **Webhooks Registry** → Regenerate Key → copy the secret.
4. In the client's CRM, add an outbound webhook to:
   `https://<your-domain>/api/webhooks/<slug>/custom`
   with header `x-webhook-secret: <secret>`.
5. Leads flow in live → dashboard + Meta CAPI fire automatically.

## 5. Deploy to Vercel (Phase 2)

```bash
npm i -g vercel
vercel            # first run: link/create project
vercel --prod     # production deploy
```
After deploy: add the Vercel domain to Firebase Authorized domains (step 1),
and set all env vars (step 2) in the Vercel dashboard.

## What changed in code (Phase 1 security)

- Google sign-in replaces the `mock-uid-123` bypass (`AuthContext`, login page).
- API write routes verify the Firebase ID token (`authMiddleware`).
- `/api/workspaces` derives owner from the verified token, not client input.
- Workspaces are created only via the register flow (auto-seed removed).
- `firestore.rules` restricts client reads to workspace members.
