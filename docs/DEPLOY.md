# Deploy PlastiCash

API on Render (Docker, Frankfurt, free plan), web on Vercel, database/login/realtime on the existing Supabase project.
Do the steps in order; each ends with a check. Secrets are typed into the dashboards only, never into files.

You need: the repo pushed to GitHub (`Bonvee120/PlastiCash`), and accounts on Render, Vercel, Paystack (test mode) and Supabase.

## 1. API on Render

1. Render → **New → Blueprint** → choose the GitHub repo. Render reads `render.yaml` and proposes the service `plasticash-api`.
2. Fill in the values marked "sync: false", copying them from your `api/.env`:
   `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYSTACK_SECRET_KEY`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `TERMII_API_KEY`, `TERMII_SENDER_ID`, `TERMII_BASE_URL`, `OTP_SECRET`, `CRON_SECRET`.
   For `FRONTEND_ORIGIN` type `http://localhost:3000` for now; step 3 sets the real one.
   - `CLOUDINARY_CLOUD_NAME` must be the lowercase cloud name from the Cloudinary dashboard (see LOG.md, Step 7).
3. Apply. The first build takes a few minutes (WeasyPrint's libraries). On start, `RUN_MIGRATIONS=1` runs `alembic upgrade head` (the free plan has no pre-deploy step).

**Check:** `https://<your-api>.onrender.com/api/v1/health` returns `{"ok":true}`, and `/api/v1/prices/current` lists 5 prices.

Connections: Supabase's session pooler allows 15 clients for the whole project. Render uses up to 10 (`DB_POOL_SIZE` 5 + `DB_MAX_OVERFLOW` 5). While the deployed API runs, stop the local API or start it with `DB_POOL_SIZE=2 DB_MAX_OVERFLOW=2`.

The free instance sleeps after 15 idle minutes; the first request after that takes about a minute. The cron (step 6) wakes it every 15 minutes.

## 2. Web on Vercel

1. Vercel → **Add New → Project** → import the GitHub repo.
2. **Root Directory:** `web`. Keep **"Include files outside the root directory in the Build Step"** on: the web app imports `design/theme.css` from the repo root.
3. Environment variables (Production):
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (from `web/.env.local`)
   - `NEXT_PUBLIC_API_URL` = `https://<your-api>.onrender.com/api/v1`
   - `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` (same lowercase cloud name)
   - optional: `NEXT_PUBLIC_HUB_ADDRESS`, `NEXT_PUBLIC_WHATSAPP_NUMBER` (international format, e.g. 2348031234567)
   - `NEXT_PUBLIC_SITE_URL` once you have your own domain (canonical links, sitemap, social cards); until then Vercel's production URL is used
   - The landing page and guide are prerendered during the build with prices from the API, so deploy the API (step 1) first.
4. Deploy.

**Check:** the Vercel URL shows the landing page with live prices and the impact totals.

## 3. Connect them

1. Render → `plasticash-api` → Environment → set `FRONTEND_ORIGIN` = your Vercel URL (e.g. `https://plasticash.vercel.app`, no trailing slash) → save (it redeploys).
2. Supabase → Authentication → URL Configuration: **Site URL** = the Vercel URL; add `https://<vercel-url>/auth/callback` to **Redirect URLs**.

**Check:** log in on the Vercel URL as `chinaza@example.com`; the dashboard shows the wallet and pickups.

## 4. Paystack webhook

Paystack dashboard (test mode) → Settings → API Keys & Webhooks → **Test Webhook URL** = `https://<your-api>.onrender.com/api/v1/webhooks/paystack`. Remove the old ngrok URL.

Transfers: Paystack currently refuses payouts from this business ("You cannot initiate third party payouts as a starter business"). Until the business is cleared for transfers, approving a withdrawal fails safely (FAILED, money returned to the wallet).

**Check:** Paystack's webhook test sends an event; the API log shows `POST /api/v1/webhooks/paystack` with 200 (events it doesn't act on are acknowledged with 200 too), never 401.

## 5. Data

The Supabase project is already migrated and seeded with the demo data (8 people, prices, pickups in every status, withdrawals, bales). Don't seed again: `scripts/seed.py` refuses a non-empty database. Seeded logins use `SEED_PASSWORD` from `api/.env`.

## 6. Reminders cron (GitHub Actions)

1. GitHub repo → Settings → Secrets and variables → Actions → New repository secret:
   - `API_URL` = `https://<your-api>.onrender.com` (no `/api/v1`, no trailing slash)
   - `CRON_SECRET` = the same value as the API's `CRON_SECRET`
2. Actions → **Reminders job** → Run workflow (manual run).

**Check:** the run is green and its log ends with `{"checked":…,"reminders":…,"auto_confirmed":…,"failed":[]}`. After that it runs every 15 minutes by itself (`.github/workflows/reminders.yml`).

## 7. The main journey on the deployed URLs

1. Chinaza (phone width): request a pickup with a photo → it appears on the ops board.
2. Admin (`/ops-portal`): assign it to Ifeanyi for today.
3. Ifeanyi (phone): Start trip → Chinaza's pickup page shows the collector on the map → type or scan Chinaza's QR → weigh with a photo.
4. Chinaza: confirm the weight → points in the wallet.
5. Chinaza: withdraw ₦1,000 → admin approves (fails at Paystack until transfers are enabled; the money comes back).
6. Green Hills School: `/app/impact` → Download PDF.
