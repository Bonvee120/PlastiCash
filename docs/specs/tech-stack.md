# Tech stack
## PlastiCash by EcoCyclers

Part of the constitution, with [`mission.md`](mission.md) and [`roadmap.md`](roadmap.md). This file restates decisions from [`CLAUDE.md`](../../CLAUDE.md), [`TRD.md`](../TRD.md), [`05-setup-and-env.md`](05-setup-and-env.md), [`01-data-model.md`](01-data-model.md) and [`DESIGN_BRIEF.md`](../DESIGN_BRIEF.md). If this file and those docs disagree, the docs win. Items the docs leave open are listed in section 8, not decided here.

## 1. Architecture

```
Browser (Next.js on Vercel) ──login──▶ Supabase Auth ──JWT──▶ browser
Browser ◀──Realtime (own pickup rows)── Supabase
Browser ──HTTPS + Bearer JWT──▶ FastAPI on Render (Docker) ──SQL──▶ Supabase Postgres
FastAPI ──▶ Paystack · Termii · Cloudinary (signatures) · WeasyPrint (in-process)
Paystack webhook ──▶ FastAPI
Cron (every 15 min, X-Cron-Secret) ──▶ FastAPI /jobs/reminders
```

- The browser talks to Supabase **only** for login and Realtime subscriptions to its own pickup rows.
- **All reads and writes of app data go through FastAPI**, which enforces roles, ownership and the money rules.
- Photos upload **directly from the browser to Cloudinary** with a signature from FastAPI. Only the URL is saved.

## 2. Stack

### Web (`web/`)

| Concern | Choice | Notes |
|---|---|---|
| Framework | Next.js (App Router), TypeScript | Deployed on Vercel |
| Styling | Tailwind CSS, shadcn/ui, daisyUI | daisyUI class prefix `d-`. shadcn for forms, dialogs, toasts and tables |
| Theme | One set of colour tokens | Set as CSS variables for shadcn **and** as the daisyUI theme. Light mode only |
| Fonts | Plus Jakarta Sans (headings), Inter (body, tabular numbers) | Loaded with `next/font` |
| Icons | Lucide | 24 px, 2 px stroke, always with a text label |
| Motion | Framer Motion | 150–250 ms, respects `prefers-reduced-motion` |
| Feedback | Sonner toasts, shadcn Skeleton | Every form submit toasts |
| Maps | Leaflet + OpenStreetMap (react-leaflet) | Client-only component |
| QR | `qrcode` (show), `html5-qrcode` (scan) | Collector scans with the phone camera |
| Auth | Supabase Auth (email + password) | `middleware.ts` redirects; area layouts check role (UX only) |

### API (`api/`)

| Concern | Choice | Notes |
|---|---|---|
| Language | Python 3.12 | |
| Framework | FastAPI | Base URL `/api/v1`, JSON in and out |
| ORM and migrations | SQLModel, Alembic | Alembic owns the `public` schema; Supabase schemas excluded |
| DB driver | psycopg | `postgresql+psycopg://` URLs |
| HTTP client | httpx | Mocked with respx in tests |
| PDF | WeasyPrint | System libraries installed in the Docker image |
| Tests | pytest, httpx, respx | Real Postgres, never SQLite |
| Runtime | Docker (`python:3.12-slim`) | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |

### Data (Supabase)

| Concern | Choice | Notes |
|---|---|---|
| Database | Supabase Postgres 15+ | Tests run on Postgres 16 (docker compose `db-test`, port 5433) |
| Auth | Supabase Auth | JWT verified by FastAPI via JWKS, or HS256 secret on legacy projects |
| Realtime | `postgres_changes` on `pickups` only | RLS-filtered: own or assigned rows |
| RLS | Enabled on all 7 tables | Only `pickups` has a SELECT policy |
| Storage | Not used | Photos go to Cloudinary |

## 3. Integrations

| Service | Calls | Failure handling |
|---|---|---|
| Paystack (test mode) | `GET /bank`, `GET /bank/resolve`, `POST /transferrecipient`, `POST /transfer`, webhook | Timeouts → FAILED + REVERSAL if the transfer was not accepted. The webhook is the source of truth for final status |
| Termii | Send SMS (OTP, reminders), behind `SMS_ENABLED` | Failure is logged and does not block the flow. The user can still confirm in the app; resend is available |
| Cloudinary | Upload signature (server), direct upload (browser) | Retry in the browser. Photo required before submit. `f_auto,q_auto,w_<size>`, max 5 MB |
| Supabase | Auth, Realtime, Postgres | Realtime failure falls back to polling `GET /pickups/{id}` every 15 s |

## 4. Data conventions

- 7 tables: `profiles`, `prices`, `pickups`, `pickup_items`, `ledger_entries`, `withdrawals`, `bales`. Full DDL in [`BACKEND_SCHEMA.md`](../BACKEND_SCHEMA.md).
- Money is `bigint` **kobo** (₦1 = 100 kobo; 1 point = ₦1). API responses give both `amount_kobo` and `points`.
- Weights are `numeric(10,2)` kg, `Decimal` in Python. Rounding is half-up to the kobo.
- IDs are UUIDs (`gen_random_uuid()`). Times are `timestamptz` defaulting to `now()`.
- `ledger_entries` and `prices` are insert-only. `pickup_items` keep a price snapshot.
- Balance = `SUM(ledger_entries.amount_kobo)` per user. There is no balance column.
- Errors: `{"code": "...", "message": "...", "details": {...}}` with 400 / 401 / 403 / 404 / 409 / 422 / 502.
- Structured JSON logs with a request id. Never log secrets, OTPs or full account numbers (mask to the last 4 digits).

## 5. Repo layout

```
/
├─ CLAUDE.md
├─ docker-compose.yml        # api + postgres for tests
├─ docs/
│  ├─ product-description.md, app-logic.md, PRD.md, TRD.md, APP_FLOW.md, BACKEND_SCHEMA.md, DESIGN_BRIEF.md
│  └─ specs/                 # 01..06 + mission.md, tech-stack.md, roadmap.md
├─ api/
│  ├─ Dockerfile
│  ├─ alembic/ , alembic.ini
│  ├─ app/
│  │  ├─ main.py, config.py, db.py, auth.py, models.py, schemas.py
│  │  ├─ routers/            # me.py, pickups.py, collector.py, admin.py, wallet.py, webhooks.py, jobs.py
│  │  └─ services/           # ledger.py, pickup_state.py, paystack.py, termii.py, cloudinary.py, pdf.py, impact.py
│  ├─ scripts/seed.py
│  └─ tests/
└─ web/
   ├─ app/                   # routes, see 03-screens-and-routes.md
   ├─ components/
   └─ lib/                   # api client, supabase client, formatters
```

## 6. Environments and hosting

| Env | Web | API | DB |
|---|---|---|---|
| Local | `npm run dev` | `uvicorn --reload` | Supabase dev project; tests on local Postgres |
| Production (demo) | Vercel (root `web/`) | Render Docker web service, pre-deploy `alembic upgrade head`, health check `/api/v1/health` | Supabase project |

- Paystack test webhook URL: `https://<render-url>/api/v1/webhooks/paystack`.
- Cron: `POST https://<render-url>/api/v1/jobs/reminders` every 15 min with header `X-Cron-Secret`.
- CORS allows only `FRONTEND_ORIGIN` (the Vercel URL in production).
- Free tiers: Supabase pauses idle projects and Render sleeps when idle. Wake both before the demo.
- Env vars for `api/.env` and `web/.env.local` are listed in [`05-setup-and-env.md`](05-setup-and-env.md). The service role key, Paystack secret, Cloudinary secret, OTP secret and cron secret never reach `web/`.

## 7. Tooling and commands

Install: Node 20+, Python 3.12, Docker Desktop, Git. Web uses npm; API uses a venv with `requirements.txt`.

- API dev: `cd api && uvicorn app.main:app --reload`
- Migrations: `cd api && alembic revision --autogenerate -m "..." && alembic upgrade head`
- Tests: `docker compose up -d db-test && cd api && pytest`
- Seed: `cd api && python -m scripts.seed`
- Web dev: `cd web && npm run dev`
- Local Paystack webhooks: expose the API with a tunnel (e.g. ngrok).

## 8. Open — decide at scaffold or deploy

The docs don't decide these. Choose them at the step shown, then record the choice here.

| Item | Decide at | Note |
|---|---|---|
| Versions of Next.js, Tailwind, daisyUI, shadcn/ui | Step 1 | **Decided (1.3):** Next.js 16.4, React 19.3, Tailwind CSS 4, daisyUI 5.7 (prefix set in `app/globals.css` with `@plugin "daisyui" { prefix: "d-"; }`), shadcn CLI 4.21 with the `base-nova` style (Base UI primitives) |
| Linter and formatter (web and api) | Step 1 | **Web (1.3):** ESLint 9 with `eslint-config-next`. Formatter and API linter still open |
| Web Supabase client package | Step 3 | **Decided (3.3):** `@supabase/ssr` 0.12 with `@supabase/supabase-js` 2. Next.js 16 renamed `middleware.ts` to `proxy.ts` (same behaviour); the session check lives in `web/proxy.ts` and `web/lib/supabase/proxy.ts`. `create-next-app` 16.4 turns on Cache Components, so pages that read cookies render inside `<Suspense>` with a Skeleton |
| Chart library for `/app/impact` | Step 9 | Keep the user dashboard under ~500 KB |
| Cron service: cron-job.org or GitHub Actions | Step 10 | Both are allowed by the docs |
| Playwright smoke test | Step 10 | Optional per TRD §10 |
