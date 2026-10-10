# 02 — API (FastAPI)

Base URL: `/api/v1`. JSON in and out. Money in responses is given as both `amount_kobo` and `points` (= naira, `amount_kobo / 100`).

## Auth

- The browser logs in with Supabase Auth and sends `Authorization: Bearer <supabase access token>` to FastAPI.
- `auth.py` verifies the JWT (Supabase JWKS at `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`, or the legacy `SUPABASE_JWT_SECRET` if the project uses HS256), reads `sub`, loads the `profiles` row, rejects inactive users.
- Guards: `require_user`, `require_collector`, `require_admin`. Ownership is checked in every handler (a user can only touch their own pickups and withdrawals; a collector only their assigned pickups).
- Errors: `401` no/invalid token, `403` wrong role or not owner, `404` not found (also used instead of 403 when revealing existence would leak), `409` illegal state change or duplicate, `422` validation.

## Me (any logged-in user)

| Method | Path | What it does |
|---|---|---|
| POST | `/me/profile` | Create profile after sign-up: account_type, full_name, phone, org fields, address, area |
| GET | `/me` | Profile + `display_name` for the greeting |
| PATCH | `/me` | Update allowed profile fields |
| GET | `/banks` | Nigerian bank list (proxied from Paystack `GET /bank?country=nigeria`, cached) |
| POST | `/me/bank` | `{bank_code, account_number}` → Paystack `/bank/resolve` → shows account_name → create transfer recipient (`type: nuban`, `currency: NGN`) → save |

## Prices and guide (public)

| Method | Path | What it does |
|---|---|---|
| GET | `/prices/current` | Current price per material, kg per sack, items per kg |
| POST | `/estimate` | `{items:[{material, sacks? , item_count?}]}` → estimated kg and points, and whether it meets the 50 kg door minimum |

## User: pickups

| Method | Path | What it does |
|---|---|---|
| POST | `/uploads/signature` | Signed Cloudinary upload params (folder by purpose: request, weigh, dispute) |
| POST | `/pickups` | Create DOOR request: materials, estimate, photo, pin, address, area, preferred date and window. Computes `estimated_kg`. If < 50 kg, returns `400` with `{code:"BELOW_MINIMUM", estimated_kg, suggestion:"HUB_OR_AREA_DAY"}` unless `pool=true`, in which case it's saved as REQUESTED and flagged for pooling. |
| GET | `/pickups` | My pickups, newest first, paginated |
| GET | `/pickups/{id}` | Detail incl. items, collector first name, live location (only while EN_ROUTE), QR token (only while ASSIGNED/EN_ROUTE) |
| POST | `/pickups/{id}/cancel` | Only while REQUESTED or ASSIGNED |
| POST | `/pickups/{id}/confirm` | User confirms in app → COMPLETED + credit (see money rules) |
| POST | `/pickups/{id}/dispute` | `{photo_url, claimed_kg, reason}` while AWAITING_CONFIRMATION → DISPUTED |

## User: wallet, impact, report

| Method | Path | What it does |
|---|---|---|
| GET | `/wallet` | Balance (points + kobo), ledger entries paginated |
| POST | `/withdrawals` | `{amount_kobo}` → PENDING + HOLD (locking, see money rules). Requires saved bank details. Min ₦1,000. |
| GET | `/withdrawals` | My withdrawals |
| GET | `/impact` | Totals: kg by material, total kg, points earned, CO₂ saved (computed from completed pickups × factor) |
| GET | `/reports/esg?year=2026&month=10` | ORGANIZATION only. PDF (WeasyPrint): org name, period, kg by material, CO₂ saved, pickup count, certificate line. `month` optional (annual if omitted). |

## Collector

| Method | Path | What it does |
|---|---|---|
| GET | `/collector/pickups?date=` | My assigned pickups for a day |
| POST | `/collector/pickups/{id}/start` | ASSIGNED → EN_ROUTE |
| POST | `/collector/pickups/{id}/location` | `{lat, lng}` every ~20 s, only while EN_ROUTE; updates the latest position on the pickup |
| POST | `/collector/pickups/{id}/scan` | `{qr_token}` must match → sets `qr_scanned_at` |
| POST | `/collector/pickups/{id}/weigh` | Requires `qr_scanned_at`. `{photo_url, items:[{material, gross_kg, deduction_kg, deduction_reason}]}` → snapshots current prices, computes amounts, clears collector location, sets `under_minimum`, generates 6-digit OTP (hash stored, 30 min expiry), sends SMS via Termii with weight + amount + code → AWAITING_CONFIRMATION |
| POST | `/collector/pickups/{id}/otp` | `{code}` read out by the user → COMPLETED + credit. 5 wrong attempts locks OTP (user can still confirm in app). |
| POST | `/collector/pickups/{id}/resend-otp` | New code, max 3 per pickup |
| GET | `/collector/users/search?phone=` | Hub walk-in: find user by phone (returns name and id only) |
| POST | `/collector/walk-ins` | Hub walk-in: `{user_id, photo_url, items}` → creates HUB pickup assigned to this collector, already scanned, then same as `/weigh` |

## Admin

Private portal. Every route is `require_admin`.

| Method | Path | What it does |
|---|---|---|
| GET | `/admin/pickups?status=&area=&date=` | Board. Grouped totals of `estimated_kg` per area for pooling. |
| POST | `/admin/pickups/{id}/assign` | `{collector_id, scheduled_date}` REQUESTED → ASSIGNED |
| POST | `/admin/pickups/{id}/cancel` | `{reason}` |
| GET | `/admin/disputes` | DISPUTED pickups with both photos, collector weight, claimed weight |
| POST | `/admin/pickups/{id}/resolve` | `{items:[{material, net_kg}], note}` → recompute with price snapshot → COMPLETED + credit, `confirmed_via=ADMIN` |
| GET | `/admin/prices` / POST `/admin/prices` | List history / add a new version for a material |
| GET | `/admin/withdrawals?status=` | Review queue |
| POST | `/admin/withdrawals/{id}/approve` | PENDING → PROCESSING, calls Paystack `POST /transfer` with `reference = withdrawal.id`, amount in kobo, `source: balance` |
| POST | `/admin/withdrawals/{id}/reject` | `{reason}` PENDING → REJECTED + REVERSAL |
| POST | `/admin/ledger/adjustments` | `{user_id, amount_kobo, note}` → ADJUSTMENT entry (post-48h complaints) |
| GET | `/admin/users?role=&q=` / PATCH `/admin/users/{id}` | List, deactivate, set `verified_picker`, change role |
| POST | `/admin/collectors` | Create a collector: creates the Supabase auth user (service role key, server side only) + profile with role COLLECTOR |
| GET | `/admin/stock` | Raw kg in store per material, bales by status, real loss % |
| POST | `/admin/bales` | `{material, weight_kg}` (≤ raw stock) → IN_STORE, generates `code` |
| POST | `/admin/bales/{id}/process` / `/sell` | Move status; sell needs `{buyer, sale_price_kobo}` |
| GET | `/admin/stats` | Totals for the admin dashboard: kg this month, points paid, pending withdrawals, open disputes, estimate accuracy by user, disputes per collector |

## Webhooks and jobs (no user auth)

| Method | Path | What it does |
|---|---|---|
| POST | `/webhooks/paystack` | Verify `x-paystack-signature` = HMAC-SHA512(raw body, `PAYSTACK_SECRET_KEY`). Handle `transfer.success` → PAID; `transfer.failed` and `transfer.reversed` → FAILED + REVERSAL. Idempotent. Always return 200 after a valid signature. |
| POST | `/jobs/reminders` | Header `X-Cron-Secret`. Called every 15 min by a cron. For AWAITING_CONFIRMATION pickups: send reminder SMS at 2 h, 12 h, 24 h after `weighed_at` (track `reminders_sent`); at 48 h → COMPLETED, `confirmed_via=AUTO`, credit. |

## Health

`GET /health` → `{ok: true}` (used by Render).
