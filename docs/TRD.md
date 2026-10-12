# Technical Requirements Document (TRD)
## PlastiCash by EcoCyclers

Companion to `PRD.md`. Detailed endpoint, table and test lists are in `specs/02-api.md`, `BACKEND_SCHEMA.md` and `specs/04-money-rules-and-tests.md`.

---

## 1. Architecture

```
 ┌───────────────────────────┐        ┌────────────────────────────┐
 │  Browser (phone/desktop)  │        │        Supabase            │
 │  Next.js app on Vercel    │──login▶│  Auth (email + password)   │
 │                           │◀─JWT───│                            │
 │                           │◀─live──│  Realtime (pickups rows)   │
 └─────────────┬─────────────┘        │  Postgres database         │
               │ HTTPS + Bearer JWT   └──────────────▲─────────────┘
               ▼                                     │ SQL (owner role)
 ┌───────────────────────────┐                       │
 │  FastAPI on Render        │───────────────────────┘
 │  (Docker)                 │──▶ Paystack (banks, recipients, transfers)
 │  all writes + rules       │◀── Paystack webhook (transfer events)
 │                           │──▶ Termii (SMS codes, reminders)
 │                           │──▶ Cloudinary (signed upload params)
 │                           │──▶ WeasyPrint (ESG PDF, in-process)
 └─────────────▲─────────────┘
               │ every 15 min, X-Cron-Secret
        cron-job.org / GitHub Actions
```

Rules:
- The browser talks to Supabase **only** for login and for Realtime subscriptions to its own pickup rows.
- **All reads and writes of app data go through FastAPI**, which enforces roles, ownership and money rules.
- Photos upload **directly from the browser to Cloudinary** using a signature from FastAPI; only the URL is saved.

## 2. Technology stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | Next.js (App Router), TypeScript | Deployed on Vercel |
| Styling | Tailwind CSS, shadcn/ui, daisyUI (`d-` prefix) | Shared colour tokens; shadcn for forms, dialogs, toasts |
| Motion | Framer Motion | Respects reduced motion |
| Feedback | Sonner toasts, shadcn Skeleton | Every form submit toasts |
| Maps | Leaflet + OpenStreetMap (react-leaflet) | Client-only component |
| QR | `qrcode` (show), `html5-qrcode` (scan) | Collector scans with phone camera |
| Backend | Python 3.12, FastAPI (async), SQLModel `AsyncSession` on `asyncpg`, Alembic (async env) | Docker on Render |
| Database | Supabase Postgres 15+ | Alembic owns the `public` schema |
| Auth | Supabase Auth | JWT verified by FastAPI |
| Realtime | Supabase Realtime (postgres_changes) | `pickups` only, RLS-filtered |
| Payments | Paystack (test mode) | Bank resolve, transfer recipient, transfer, webhook |
| SMS | Termii | OTP and reminders, behind `SMS_ENABLED` flag |
| Media | Cloudinary | Signed uploads, auto format/width |
| PDF | WeasyPrint | System libs installed in the Docker image |
| Tests | pytest, pytest-asyncio, httpx `AsyncClient`, respx | Real Postgres via docker compose |

## 3. Authentication and authorization

1. User signs up/logs in with Supabase Auth in the browser.
2. Browser sends `Authorization: Bearer <access_token>` on every API call.
3. FastAPI verifies the token (Supabase JWKS, or the HS256 secret on legacy projects), takes `sub` as the user id, loads `profiles`.
4. Guards per router: `require_user`, `require_collector`, `require_admin`.
5. Ownership check in every handler (user ↔ own pickups/withdrawals; collector ↔ assigned pickups).
6. Collector accounts are created by an admin through FastAPI using the Supabase service role key (server only).
7. The first admin is created by the seed script.
8. Next.js `middleware.ts` redirects unauthenticated users; each area layout redirects on wrong role. This is for UX only; the API is the real gate.

## 4. Data

- 7 tables: `profiles`, `prices`, `pickups`, `pickup_items`, `ledger_entries`, `withdrawals`, `bales`. Full DDL in `BACKEND_SCHEMA.md`.
- Money: `bigint` kobo. Weights: `numeric(10,2)` kg, `Decimal` in Python. Rounding: half-up to the kobo.
- Balance is computed: `SUM(ledger_entries.amount_kobo)` per user.
- Ledger is insert-only; partial unique indexes guarantee one credit per pickup, one hold and one reversal per withdrawal.
- Prices are versioned; `pickup_items` store a price snapshot.
- RLS on all tables; only `pickups` has a SELECT policy (own or assigned) for Realtime.

## 5. Core processes

### 5.1 Pickup state machine
`REQUESTED → ASSIGNED → EN_ROUTE → AWAITING_CONFIRMATION → COMPLETED`, with `DISPUTED` (→ COMPLETED by admin) and `CANCELLED` (from REQUESTED/ASSIGNED). HUB walk-ins start at `AWAITING_CONFIRMATION`. One function performs all transitions under a row lock; illegal transitions return 409.

### 5.2 Credit
On entering COMPLETED (app confirm, OTP, auto-confirm, admin resolve): insert `PICKUP_CREDIT`. A duplicate violates the unique index and is treated as "already credited".

### 5.3 Withdrawal
Request: lock profile row → check balance and minimum → insert withdrawal PENDING + HOLD. Approve: PENDING → PROCESSING → Paystack `POST /transfer` with `reference = withdrawal.id`. Reject: → REJECTED + REVERSAL.

### 5.4 Paystack webhook
Verify `x-paystack-signature` (HMAC-SHA512 of raw body with secret key, constant-time compare). Handle `transfer.success` → PAID; `transfer.failed` / `transfer.reversed` → FAILED + REVERSAL. Lock the withdrawal; ignore if already final. Always 200 after a valid signature.

### 5.5 OTP
Generated at weighing, 6 digits via `secrets`, stored as HMAC-SHA256 hash with `OTP_SECRET`, expires in 30 min, 5 attempts, 3 resends. Never logged.

### 5.6 Scheduled job
`POST /jobs/reminders` every 15 min with `X-Cron-Secret`: sends reminders at 2/12/24 h and auto-confirms at 48 h. Each pickup in its own locked transaction, so overlapping runs are safe.

### 5.7 Live location
Collector page posts `{lat,lng}` every ~20 s while EN_ROUTE; API updates the latest position on the pickup row; Supabase Realtime pushes the change to the user's open page. Location is cleared at weighing.

### 5.8 Estimates and pooling
`estimated_kg = Σ(sacks × kg_per_full_sack)` or `item_count ÷ items_per_kg`. Below 50 kg the request is either refused with a hub suggestion or saved as `pooled = true`. The admin board totals estimated kg per area.

### 5.9 Inventory
Raw stock per material = Σ net kg of COMPLETED pickup items − Σ bale weights. Bale creation is refused above raw stock. Loss % = (raw kg in − bale kg) ÷ raw kg in.

### 5.10 Impact and ESG
CO₂ saved = Σ net kg × `co2_kg_saved_per_kg` (from the price version used). ESG PDF rendered from an HTML template with WeasyPrint, organization accounts only.

## 6. Integrations

| Service | Calls | Failure handling |
|---|---|---|
| Paystack | `GET /bank`, `GET /bank/resolve`, `POST /transferrecipient`, `POST /transfer`, webhook | Timeouts → FAILED + REVERSAL if the transfer was not accepted; webhook is the source of truth for final status |
| Termii | Send SMS | Failure is logged and does not block the flow; user can still confirm in app; resend available |
| Cloudinary | Upload signature (server), direct upload (browser) | Retry in browser; photo required before submit |
| Supabase | Auth, Realtime, Postgres | Realtime failure falls back to polling `GET /pickups/{id}` every 15 s |

## 7. Security requirements

- Secrets only in environment variables; `.env` gitignored; `.env.example` committed.
- Service role key, Paystack secret, Cloudinary secret, OTP secret and cron secret never reach the browser.
- CORS allows only `FRONTEND_ORIGIN`.
- Webhook and job endpoints authenticated by signature / shared secret.
- Input validation with Pydantic on every endpoint; numbers bounded (kg ≤ 5,000 per item).
- Rate limits on OTP checks and login-related endpoints (simple in-memory or per-row counters).
- Users never receive other users' data; collectors' phone numbers are never in user responses.
- Admin portal at an unlinked URL **and** role-checked on every API call.
- No secrets, OTPs or full account numbers in logs (mask to last 4 digits).

## 8. Performance requirements

- API p95 < 500 ms for normal reads on the deployed setup (excluding cold start).
- Images: Cloudinary `f_auto,q_auto,w_<size>`; max upload 5 MB.
- Lists paginated (20 per page).
- Realtime only for the one open pickup, not for lists.

## 9. Error handling and logging

- Error responses: `{"code": "BELOW_MINIMUM", "message": "...", "details": {...}}`.
- Codes: 400 business rule, 401, 403, 404, 409 state/duplicate, 422 validation, 502 upstream (Paystack/Termii).
- Structured JSON logs with request id; log every state transition and ledger insert (ids and amounts only).

## 10. Testing

- pytest against real Postgres (docker compose `db-test`), each test in a rolled-back transaction or a fresh schema.
- External calls mocked with respx.
- Minimum 20 tests as listed in `specs/04-money-rules-and-tests.md`, including concurrency tests with two connections.
- Frontend: manual test script for the main journey on a phone; optional Playwright smoke test.

## 11. Environments and deployment

| Env | Web | API | DB |
|---|---|---|---|
| Local | `npm run dev` | `uvicorn --reload` | Supabase dev project; tests on local Postgres |
| Production (demo) | Vercel | Render (Docker), pre-deploy `alembic upgrade head` | Supabase project |

Env vars and accounts: `specs/05-setup-and-env.md`.

## 12. Constraints

- Two-week capstone build, one developer.
- 5–7 tables (exactly 7).
- Paystack in test mode only.
- Free/low hosting tiers (cold starts accepted).
