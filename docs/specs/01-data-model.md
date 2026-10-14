# 01 — Data model

Runnable SQL for all of this is in `docs/BACKEND_SCHEMA.md`.

7 tables in the `public` schema, managed only by Alembic. Supabase's own `auth` schema is not touched by Alembic: exclude it in `alembic/env.py` with `include_object` / `include_schemas=False`.

Conventions: `id` is UUID (`gen_random_uuid()`), timestamps are `timestamptz` defaulting to `now()`, money is `bigint` kobo, weights are `numeric(10,2)` kg.

## Enums

- `role`: `USER`, `COLLECTOR`, `ADMIN`
- `account_type`: `INDIVIDUAL`, `ORGANIZATION` (only meaningful for `USER`)
- `material`: `PET`, `PLASTIC`, `SACHET`, `CAN`, `TIN`
- `pickup_status`: `REQUESTED`, `ASSIGNED`, `EN_ROUTE`, `AWAITING_CONFIRMATION`, `DISPUTED`, `COMPLETED`, `CANCELLED`
- `pickup_channel`: `DOOR`, `HUB`
- `confirmed_via`: `APP`, `OTP`, `AUTO`, `ADMIN`
- `ledger_type`: `PICKUP_CREDIT`, `WITHDRAWAL_HOLD`, `WITHDRAWAL_REVERSAL`, `ADJUSTMENT`
- `withdrawal_status`: `PENDING`, `PROCESSING`, `PAID`, `FAILED`, `REJECTED`
- `bale_status`: `IN_STORE`, `PROCESSED`, `SOLD`

## 1. `profiles`

One row per Supabase Auth user. `id` = `auth.users.id`.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | same as auth user id |
| role | role | default `USER` |
| account_type | account_type null | required when role = USER |
| full_name | text | individual's name, or org contact person |
| org_name | text null | required for ORGANIZATION |
| org_type | text null | company, school, NGO, church, estate, other |
| cac_number | text null | optional |
| phone | text unique | Nigerian format, stored as +234… |
| email | text | copy of auth email |
| address | text null | |
| area | text null | from the fixed list of Enugu areas (see seed) |
| bank_name, bank_code, account_number, account_name | text null | set after `/bank/resolve` check |
| paystack_recipient_code | text null | created when bank details are saved |
| verified_picker | bool default false | admin badge |
| is_active | bool default true | admin can deactivate |
| created_at | timestamptz | |

Display name for greeting: `org_name` if ORGANIZATION, else first word of `full_name`.

## 2. `prices`

Versioned price list. The current price for a material is the row with the latest `effective_from <= now()`.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| material | material | |
| price_kobo_per_kg | bigint | e.g. PET 18500 = ₦185 |
| kg_per_full_sack | numeric(6,2) | for estimates (EcoCyclers standard sack) |
| items_per_kg | int null | bottles/cans per kg for the guide |
| co2_kg_saved_per_kg | numeric(6,3) | emission factor (fill from US EPA WARM) |
| effective_from | timestamptz | |
| set_by | uuid FK profiles | |
| created_at | timestamptz | |

Index: `(material, effective_from desc)`. Rows are never edited; a price change is a new row.

## 3. `pickups`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK profiles | the seller |
| collector_id | uuid FK profiles null | assigned collector |
| channel | pickup_channel | DOOR or HUB |
| status | pickup_status | |
| area | text | for pooling |
| address | text null | |
| lat, lng | numeric(9,6) null | map pin |
| preferred_date | date null | user's choice |
| preferred_window | text null | `MORNING` / `AFTERNOON` |
| scheduled_date | date null | set by admin on assign |
| pooled | bool default false | under-50 kg request waiting for an area pickup day |
| estimate_sacks | numeric(5,1) null | full EcoCyclers sacks |
| estimate_note | text null | e.g. "2 rice sacks of bottles" |
| estimated_kg | numeric(10,2) null | computed at request time |
| request_photo_url | text null | Cloudinary |
| qr_token | text unique | random 32 chars, shown as QR to the user |
| qr_scanned_at | timestamptz null | |
| collector_lat, collector_lng | numeric(9,6) null | latest only, while EN_ROUTE |
| collector_location_at | timestamptz null | |
| weighed_at | timestamptz null | |
| weigh_photo_url | text null | collector's photo of the scale/load |
| total_net_kg | numeric(10,2) null | sum of items |
| total_amount_kobo | bigint null | sum of items |
| under_minimum | bool default false | DOOR pickup with total_net_kg < 50 |
| otp_hash | text null | hash of 6-digit code |
| otp_expires_at | timestamptz null | |
| otp_attempts | int default 0 | lock after 5 |
| otp_resends | int default 0 | max 3 |
| reminders_sent | int default 0 | 0–3 |
| last_reminder_at | timestamptz null | |
| confirmed_at | timestamptz null | |
| confirmed_via | confirmed_via null | |
| dispute_photo_url | text null | |
| dispute_claimed_kg | numeric(10,2) null | |
| dispute_reason | text null | |
| disputed_at | timestamptz null | |
| resolved_kg | numeric(10,2) null | admin's final total |
| resolved_by | uuid FK profiles null | |
| resolution_note | text null | |
| cancelled_reason | text null | |
| created_at, updated_at | timestamptz | |

Indexes: `(status)`, `(area, status)`, `(collector_id, status)`, `(user_id, created_at desc)`.

## 4. `pickup_items`

One row per material in a pickup.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| pickup_id | uuid FK pickups on delete cascade | |
| material | material | |
| gross_kg | numeric(10,2) | ≥ 0 |
| deduction_kg | numeric(10,2) default 0 | contamination, ≤ gross |
| deduction_reason | text null | required if deduction > 0 |
| net_kg | numeric(10,2) | gross − deduction |
| price_kobo_per_kg | bigint | **snapshot** of price at weighing |
| price_id | uuid FK prices | which version |
| amount_kobo | bigint | round_half_up(net_kg × price) |

Unique: `(pickup_id, material)`. Check constraints: `deduction_kg <= gross_kg`, `net_kg >= 0`.

If a dispute is resolved with a different weight, the items are scaled: the admin enters the final kg per material, and amounts are recomputed with the **same price snapshot**.

## 5. `ledger_entries`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK profiles | |
| type | ledger_type | |
| amount_kobo | bigint | positive for credits, negative for debits |
| pickup_id | uuid FK null | for PICKUP_CREDIT |
| withdrawal_id | uuid FK null | for HOLD / REVERSAL |
| note | text null | required for ADJUSTMENT |
| created_by | uuid FK profiles null | admin for ADJUSTMENT |
| created_at | timestamptz | |

Indexes and constraints (these enforce the money rules):
- `UNIQUE (pickup_id) WHERE type = 'PICKUP_CREDIT'`
- `UNIQUE (withdrawal_id) WHERE type = 'WITHDRAWAL_HOLD'`
- `UNIQUE (withdrawal_id) WHERE type = 'WITHDRAWAL_REVERSAL'`
- `CHECK` sign by type: PICKUP_CREDIT > 0, WITHDRAWAL_HOLD < 0, WITHDRAWAL_REVERSAL > 0, ADJUSTMENT ≠ 0
- Index `(user_id, created_at desc)`

Balance: `SELECT COALESCE(SUM(amount_kobo),0) FROM ledger_entries WHERE user_id = :id`.

## 6. `withdrawals`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | also used as the Paystack transfer `reference` |
| user_id | uuid FK profiles | |
| amount_kobo | bigint | ≥ minimum (₦1,000 = 100000) |
| status | withdrawal_status | |
| bank_name, account_number, account_name | text | snapshot at request time |
| paystack_recipient_code | text | snapshot |
| paystack_transfer_code | text null | from Paystack |
| failure_reason | text null | |
| reviewed_by | uuid FK profiles null | |
| reviewed_at, paid_at | timestamptz null | |
| created_at, updated_at | timestamptz | |

## 7. `bales`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| code | text unique | human code, e.g. `PET-2026-0042`, printed as QR |
| material | material | |
| weight_kg | numeric(10,2) | |
| status | bale_status | |
| buyer | text null | when SOLD |
| sale_price_kobo | bigint null | when SOLD |
| created_by | uuid FK profiles | |
| created_at, processed_at, sold_at | timestamptz null | |

Raw stock per material = sum of `pickup_items.net_kg` for COMPLETED pickups − sum of `bales.weight_kg` for that material. Admin cannot create a bale heavier than raw stock.

## 8. `push_subscriptions` (added 13 Oct 2026)

Browser push for admins: one row per browser or device that turned on notifications for new pickup requests.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| profile_id | uuid FK profiles, on delete cascade | the admin |
| endpoint | text unique | the push service's URL for that browser |
| p256dh, auth | text | the browser's keys for encrypting messages |
| created_at | timestamptz | |

RLS on with no policy and no grants for `anon`/`authenticated`: only FastAPI reads it. Rows the push service reports as gone (404/410) are deleted.

## 9–11. Content (added 13 Oct 2026): `posts`, `events`, `hero_slides`

Written by admins in the ops portal, read by anyone through FastAPI (published rows only). RLS on with no policy and no
grants for the browser roles, like every other table.

`posts`: id, slug (unique; from the title; fixed once published), title, excerpt, body_md (Markdown, rendered without raw
HTML), cover_url (Cloudinary), author_id (FK profiles, set null), byline (the writer's name shown to readers; empty = the admin account's name; added 14 Oct 2026), published_at (null = draft), created_at, updated_at.

`events`: id, title, starts_at, ends_at (null or ≥ starts_at), location, is_online, summary, cover_url, link_url
(http/https only), published, created_by (FK profiles, set null), created_at, updated_at. Upcoming = not finished yet
(ends_at, or starts_at when there is no end, is in the future).

`hero_slides`: id, image_url (Cloudinary), headline, subline, position (lower first), active, created_at.

## Row Level Security

Enable RLS on **all 7 tables** in an Alembic migration (`op.execute`). FastAPI connects as the database owner, so RLS doesn't block it. The browser only needs Realtime on `pickups`, so add only these policies:

```sql
alter table pickups enable row level security;
create policy "own pickups readable" on pickups for select to authenticated
  using (user_id = auth.uid() or collector_id = auth.uid());
alter publication supabase_realtime add table pickups;
```

All other tables: RLS enabled, no policies, so the browser can't read them directly.

## Seed data (`scripts/seed.py`)

- 1 admin, 2 collectors (one marked as hub collector in `address`), 3 individuals (incl. "Chinaza Okafor"), 2 organizations (e.g. "Green Hills School", a company).
- Prices: PET ₦185, PLASTIC ₦280, SACHET ₦50, CAN ₦400, TIN ₦200, with sack, items and CO₂ factors (placeholders marked TODO until filled from EPA WARM and your own weighing).
- Areas (Enugu): Independence Layout, New Haven, Trans-Ekulu, Abakpa, Emene, GRA, Achara Layout, Uwani, Ogui, Asata, Coal Camp, Thinkers Corner, Gariki, Agbani Road. Edit to taste.
- ~20 pickups across all statuses, including one DISPUTED and one under-minimum, with their ledger entries; 3 withdrawals (PAID, PENDING, FAILED with reversal); 5 bales across statuses.
