# Roadmap
## PlastiCash by EcoCyclers

Part of the constitution, with [`mission.md`](mission.md) and [`tech-stack.md`](tech-stack.md). This file splits [`06-build-order.md`](06-build-order.md) into small phases of about one sitting (2–4 hours) each. **06 wins** on any conflict. Scope details come from [`02-api.md`](02-api.md), [`03-screens-and-routes.md`](03-screens-and-routes.md) and [`04-money-rules-and-tests.md`](04-money-rules-and-tests.md). Test numbers refer to the required tests in 04.

How to use it:
- Build in order. Finish a step, including its tests, before starting the next.
- Each step ends with its tests passing and a commit. Kenzy makes every commit.
- Update `LOG.md` daily: what was done, what broke, what's next.
- Order only. No dates.

---

## Step 0 — Before code

**Step done when (06):** research is signed off and the spike works. Don't start feature code before this step is done.

| Phase | Scope | Done when | Tests |
|---|---|---|---|
| 0.1 Field research | 2 real conversations with evidence: a photo of a buy-back price board, a waste picker, and a household or school | Notes and evidence are in `RESEARCH.md` | — |
| 0.2 Desk research | 2 competitors; 3 cited sources (National Policy on Plastic Waste Management, NESREA EPR, US EPA WARM for CO₂ factors); 3 design decisions tied to findings | `RESEARCH.md` is signed off | — |
| 0.3 Webhook spike | In `/spikes` (≤ 50 lines): receive a Paystack **test** webhook and verify its signature | A real test webhook passes the signature check | — |

Paper design is already done: the specs folder is the ERD, endpoints and screens.

## Step 1 — Skeleton

**Step done when (06):** `pytest` runs one passing test against Postgres; `npm run dev` shows a page.

| Phase | Scope | Done when | Tests |
|---|---|---|---|
| 1.1 Repo layout | Monorepo folders per `CLAUDE.md`; `docker-compose.yml` with `db-test`; `api/.env.example` and `web/.env.example` with empty values | `docker compose up -d db-test` starts Postgres on port 5433 | — |
| 1.2 API skeleton | FastAPI app, `config.py`, `db.py`, `GET /api/v1/health`; pytest wired to `TEST_DATABASE_URL` | `pytest` runs one passing test against Postgres | — |
| 1.3 Web skeleton | Next.js App Router + TypeScript, Tailwind, shadcn/ui, daisyUI with prefix `d-`; colour tokens and fonts from `DESIGN_BRIEF.md` | `npm run dev` shows a page | — |

## Step 2 — Database

**Step done when (06):** `alembic upgrade head` + seed work on Supabase; a test proves the unique credit index rejects a second PICKUP_CREDIT.

| Phase | Scope | Done when | Tests |
|---|---|---|---|
| 2.1 Models | SQLModel models for the 7 tables and all enums | Models import cleanly and match `01-data-model.md` | — |
| 2.2 First migration | Alembic migration for tables; `env.py` excludes `auth`, `storage`, `realtime`; partial unique indexes, checks and views via `op.execute` | `alembic upgrade head` runs on the test Postgres | — |
| 2.3 RLS and Realtime | RLS on all 7 tables, the `pickups` SELECT policy, `supabase_realtime` publication; stubs for `auth.uid()`, roles and the publication in `tests/conftest.py` | The migration applies on both the test Postgres and Supabase | — |
| 2.4 Credit index test | Test that a second `PICKUP_CREDIT` for the same pickup is rejected | The test passes | (index test) |
| 2.5 Seed | `scripts/seed.py`: admin, 2 collectors, 3 individuals, 2 organizations, prices, areas, ~20 pickups across statuses, 3 withdrawals, 5 bales | Upgrade + seed work on Supabase | — |

## Step 3 — Auth and profiles

**Step done when (06):** each seeded role logs in and lands on its own area; access test 16 passes.

| Phase | Scope | Done when | Tests |
|---|---|---|---|
| 3.1 API auth | `auth.py`: verify Supabase JWT (JWKS or HS256), load profile, reject inactive users; `require_user`, `require_collector`, `require_admin` | A valid token loads the profile; a bad token gets 401 | — |
| 3.2 Me endpoints | `POST /me/profile`, `GET /me` with `display_name`, `PATCH /me` | Profile is created and returned with the right display name | — |
| 3.3 Web login | Supabase sign-up and login pages; `middleware.ts` redirects to `/login` without a session | A seeded user can log in and out | — |
| 3.4 Onboarding and areas | Sign-up step 2 (Individual / Organization); `/app`, `/collector`, `/ops-portal` layouts redirect on wrong role; "Welcome, {name}" header | Each seeded role lands on its own area | — |
| 3.5 Access test | A USER calling `/admin/*` gets 403 | Test passes | 16 |

## Step 4 — Money core (API only)

**Step done when (06):** tests 1–6 and 10–11 pass.

| Phase | Scope | Done when | Tests |
|---|---|---|---|
| 4.1 Ledger | `services/ledger.py`: insert-only entries, balance from `SUM`, `credit_pickup()` that treats `IntegrityError` as "already credited" | Double credit is a no-op | 1 |
| 4.2 State machine | `services/pickup_state.py::transition()` with the pickup row locked; `IllegalTransition` → 409 | Only the transitions in 04 are allowed | — |
| 4.3 Price snapshot | Current price lookup; item amount `round_half_up(net_kg × price_kobo_per_kg)` with the snapshot stored on the item | A later price change leaves the amount unchanged | 6 |
| 4.4 Withdrawal request | `POST /withdrawals`: lock profile row, check bank details, min ₦1,000 and balance, insert PENDING + HOLD | Concurrent requests can't overdraw | 2, 10 |
| 4.5 Approve and reject | Admin approve (PENDING → PROCESSING, then transfer) and reject (→ REJECTED + REVERSAL) | Reject restores the balance | 11 |
| 4.6 Paystack client | `services/paystack.py`: banks, resolve, transfer recipient, transfer; mocked with respx | Client calls are covered by mocked tests | — |
| 4.7 Webhook | `POST /webhooks/paystack`: HMAC-SHA512 on the raw body, `compare_digest`, lock withdrawal, idempotent PAID / FAILED + REVERSAL | Duplicates change nothing; bad signature gets 401 | 3, 4, 5 |

## Step 5 — Pickup flow (API)

**Step done when (06):** tests 7–8, 12–15, 18 pass.

| Phase | Scope | Done when | Tests |
|---|---|---|---|
| 5.1 Prices and estimate | `GET /prices/current`, `POST /estimate` | Estimate gives the right kg and the 50 kg check | 18 |
| 5.2 Requests | `POST /uploads/signature` (Cloudinary); `POST /pickups` with the 50 kg rule and `pool=true`; list, detail, cancel | Below 50 kg returns `BELOW_MINIMUM` unless pooled | — |
| 5.3 Assign and travel | Admin assign; `GET /collector/pickups`; start (→ EN_ROUTE); location updates only while EN_ROUTE | A collector can start an assigned pickup and send location; a collector can't act on a pickup not assigned to them | 15 |
| 5.4 Scan and weigh | QR scan; `/weigh` with price snapshot, deductions, totals, `under_minimum`, location cleared | Weigh without scan returns 409; deduction > gross is rejected | 7, 12 |
| 5.5 OTP | 6-digit OTP hashed with `OTP_SECRET`, 30 min, 5 attempts, 3 resends; `services/termii.py` behind `SMS_ENABLED` | 5 wrong codes lock the OTP | 13 |
| 5.6 Confirm, dispute, resolve | User confirm; collector OTP confirm; dispute; admin resolve with the original price snapshot | Resolve credits once at the resolved weight; a user can't read or confirm another user's pickup | 8, 14 |
| 5.7 Hub walk-in | `GET /collector/users/search`, `POST /collector/walk-ins` (HUB pickup → AWAITING_CONFIRMATION) | A walk-in reaches AWAITING_CONFIRMATION with items | — |

## Step 6 — User screens

**Step done when (06):** a seeded user can request, watch, confirm and withdraw end to end against the local API.

| Phase | Scope | Done when | Tests |
|---|---|---|---|
| 6.1 Shared UI | Button, Card, StatusBadge, MoneyDisplay, Timeline, EmptyState, Stepper; Sonner, Skeletons; user layout with bottom nav; API client in `lib/` | Components render with the brand tokens | — |
| 6.2 Dashboard | `/app`: greeting, wallet card, active pickup card, "Request pickup", impact strip | Dashboard shows seeded data | — |
| 6.3 Request form | `/app/request` stepper: materials, estimate with live progress bar to 50 kg, photo, map pin + address + area, date + window, review | A request is created, or pooled when under 50 kg | — |
| 6.4 Pickups | `/app/pickups` list and `/app/pickups/[id]` with timeline and QR code | The user sees status and the QR code | — |
| 6.5 Live map and confirm | Realtime collector marker (15 s polling fallback); weight table; Confirm and Dispute with countdown | The user can confirm or dispute | — |
| 6.6 Wallet and bank | `/app/settings` bank details with resolved name; `/app/wallet` balance, history, withdraw | The user can save a bank account and withdraw | — |
| 6.7 Guide and check | `/guide` page; run the full user journey | Step done-when met | — |

## Step 7 — Collector screens

**Step done when (06):** a full pickup works on a phone browser from REQUESTED to COMPLETED.

| Phase | Scope | Done when | Tests |
|---|---|---|---|
| 7.1 Today and start | `/collector` list; job page with Start and location every 20 s while open | Location reaches the user's map | — |
| 7.2 QR scan | Camera scan with `html5-qrcode` | A matching QR unlocks weighing | — |
| 7.3 Weigh and OTP | Weigh form per material with deduction and photo; OTP entry | A pickup completes by OTP | — |
| 7.4 Walk-in and phone run | `/collector/walk-in`; full run on a phone browser | Step done-when met | — |

## Step 8 — Admin portal

**Step done when (06):** every admin action works; test 19 passes.

| Phase | Scope | Done when | Tests |
|---|---|---|---|
| 8.1 Layout and stats | `/ops-portal` sidebar layout; `GET /admin/stats` and dashboard | Stats show seeded totals | — |
| 8.2 Pickups board | Board by status, area and date filters, area totals for pooling, assign | Admin can assign a collector and date | — |
| 8.3 Disputes | Both photos side by side; final kg per material + note → resolve | A dispute resolves and credits once | — |
| 8.4 Prices | History and add a new version (price, kg per sack, items per kg, CO₂ factor) | A new version applies to new weighings only | — |
| 8.5 Withdrawals | Queue; approve and reject with confirm dialogs | Approve sends the transfer; reject returns the money | — |
| 8.6 Users | List, deactivate, verified picker, change role; create collector (service role key, server only); ledger adjustments with a note | Each user action works | — |
| 8.7 Stock and bales | Raw stock, create bale (≤ raw stock), process, sell with buyer + price, real loss % | Over-weight bale is rejected | 19 |

## Step 9 — Impact, ESG PDF, reminders job

**Step done when (06):** tests 9, 17, 20 pass; a PDF downloads for a seeded organization.

| Phase | Scope | Done when | Tests |
|---|---|---|---|
| 9.1 Impact | `GET /impact` and `/app/impact`: kg by material, points earned, CO₂ saved | Impact matches completed pickups | 20 |
| 9.2 ESG PDF | `GET /reports/esg` with WeasyPrint, organizations only; month/year picker | A PDF downloads for a seeded organization | 17 |
| 9.3 Reminders job | `POST /jobs/reminders` with `X-Cron-Secret`: reminders at 2, 12, 24 h; auto-confirm at 48 h, each pickup in its own locked transaction | Running the job twice doesn't double-credit | 9 |

## Step 10 — Landing page, polish, deploy

**Step done when (06):** the main journey works on the deployed URLs; all 20 tests in 04-money-rules-and-tests.md pass (the capstone minimum is 15); README and LOG.md are complete.

| Phase | Scope | Done when | Tests |
|---|---|---|---|
| 10.1 Landing page | Problem, how it works, live prices, who it's for, who pays, impact | Landing page renders live prices | — |
| 10.2 Polish | Toasts and skeletons everywhere; empty states; mobile check at 360 px | Every page passes the mobile check | — |
| 10.3 Deploy | API to Render (Docker, pre-deploy `alembic upgrade head`); web to Vercel; `FRONTEND_ORIGIN` set | Both deployed URLs respond | — |
| 10.4 Wire production | Paystack test webhook URL; cron for `/jobs/reminders`; seed production demo data | The main journey works on the deployed URLs | — |
| 10.5 Write-up | README: the problem (with evidence), the hard part, why this design (with sources), who pays; `LOG.md` complete | All 20 tests pass; README and LOG.md complete | all |

---

## Out of scope for the MVP

WhatsApp bot, mobile money payouts, multiple logins per organization, admin-defined time slots, plastic credits/EPR data sales, route optimisation.
