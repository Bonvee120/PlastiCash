# 06 — Build order

Build in this order. Each step ends with its tests passing and a commit. Don't start feature code before step 0 is done (capstone research gate).

## Step 0 — Before code (Kenzy, with Claude's help on writing)
- `RESEARCH.md` signed off: 2 real conversations with evidence (photo of a buy-back price board, a waste picker and a household or school), 2 competitors, 3 cited sources (National Policy on Plastic Waste Management, NESREA EPR, US EPA WARM for CO₂ factors), 3 design decisions tied to findings.
- **Spike** in `/spikes` (≤ 50 lines): receive a Paystack **test** webhook and verify its signature.
- Paper design: this specs folder is the ERD, endpoints and screens.
**Done when:** research is signed off and the spike works.

## Step 1 — Skeleton
Monorepo layout, FastAPI `/health`, Next.js app with Tailwind + shadcn + daisyUI (prefix `d-`), docker-compose with `db-test`, `.env.example` files, CI-free local test run.
**Done when:** `pytest` runs one passing test against Postgres; `npm run dev` shows a page.

## Step 2 — Database
SQLModel models and the first Alembic migration for all 7 tables, enums, constraints, partial unique indexes, RLS + Realtime policy on pickups. Seed script.
**Done when:** `alembic upgrade head` + seed work on Supabase; a test proves the unique credit index rejects a second PICKUP_CREDIT.

## Step 3 — Auth and profiles
Supabase sign-up/login in web; JWT verification in API; `/me`, `/me/profile`; role guards; sign-up step 2 (Individual/Organization); "Welcome, {name}" header.
**Done when:** each seeded role logs in and lands on its own area; access tests 14–16 pass.

## Step 4 — Money core (the hard part) — API only
Ledger service, balance, `pickup_state.transition`, `credit_pickup`, withdrawals request/approve/reject, Paystack client (recipient, transfer), webhook with signature check.
**Done when:** tests 1–6 and 10–11 pass.

## Step 5 — Pickup flow — API
Prices + estimate, create request (50 kg rule, pooling flag), Cloudinary signature, assign, start, location, QR scan, weigh with price snapshot, OTP (Termii behind `SMS_ENABLED`), confirm, dispute, resolve, walk-in.
**Done when:** tests 7–8, 12–13, 18 pass.

## Step 6 — User screens
Dashboard, request form with estimate + progress bar, pickups list/detail with QR, Realtime live map, confirm/dispute, wallet + withdraw, bank details, guide page.
**Done when:** a seeded user can request, watch, confirm and withdraw end to end against the local API.

## Step 7 — Collector screens
Today's list, start + location sending, QR scan, weigh form with photo, OTP entry, hub walk-in.
**Done when:** a full pickup works on a phone browser from REQUESTED to COMPLETED.

## Step 8 — Admin portal
Stats, pickups board with area pooling totals and assign, disputes, prices, withdrawals approve/reject, users + create collector + adjustments, stock and bales.
**Done when:** every admin action works; test 19 passes.

## Step 9 — Impact, ESG PDF, reminders job
Impact page and API, ESG PDF for organizations (WeasyPrint), `/jobs/reminders` with auto-confirm.
**Done when:** tests 9, 17, 20 pass; a PDF downloads for a seeded organization.

## Step 10 — Landing page, polish, deploy
Landing page (problem, how it works, live prices, who it's for, who pays, impact), toasts and skeletons everywhere, mobile check, deploy API to Render and web to Vercel, set Paystack webhook and cron, seed production demo data. README with: The problem (with evidence), The hard part, Why this design (with sources), Who pays.
**Done when:** the main journey works on the deployed URLs; all 20 tests in 04-money-rules-and-tests.md pass (the capstone minimum is 15); README and LOG.md are complete.

## Out of scope for the MVP
WhatsApp bot, mobile money payouts, multiple logins per organization, admin-defined time slots, plastic credits/EPR data sales, route optimisation.
