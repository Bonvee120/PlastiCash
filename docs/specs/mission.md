# Mission
## PlastiCash by EcoCyclers

Part of the constitution, with [`tech-stack.md`](tech-stack.md) and [`roadmap.md`](roadmap.md). This file restates decisions from [`product-description.md`](../product-description.md), [`PRD.md`](../PRD.md), [`app-logic.md`](../app-logic.md) and [`CLAUDE.md`](../../CLAUDE.md). If this file and those docs disagree, the docs win.

## 1. Mission

EcoCyclers makes recycling pay: PlastiCash connects individuals and organizations to EcoCyclers collectors, pays for plastic by weight, and turns that waste into measurable environmental impact and export-ready material.

Launch city: Enugu, Nigeria. Version 1.0 is the MVP built for the capstone.

## 2. The problem

Plastic recycling in Enugu fails for three reasons:

1. **No incentive.** Recyclable plastic has value, but nobody claims it, so it's thrown away.
2. **No convenience.** People who want to recycle have no reliable way to get plastic to a recycler.
3. **No visibility.** Nobody sees what they recycled, earned or saved, so recycling never becomes a habit.

The result is plastic that clogs drains, floods streets, and gets burned or buried.

## 3. Who it serves

| Role | Who | What they do |
|---|---|---|
| **User** | Individuals and organizations | Request pickups, confirm or dispute weights, use the wallet, withdraw, view impact |
| **Collector** | EcoCyclers staff, in the field or at the hub | See only their assigned pickups, share location while on the way, scan the QR code, photograph the load, enter weights |
| **Admin** | EcoCyclers office, through a private portal | Assign pickups, set prices, resolve disputes, review withdrawals, manage stock and bales |

Users have one of two account types, chosen at sign-up:

| | Individual | Organization |
|---|---|---|
| Who | Families, students, scavengers, waste pickers | Companies, schools, NGOs, churches, estates |
| Usual channel | Hub walk-in or area pickup day | Door pickup (50 kg and above) |
| Reports | Personal impact page | Impact page plus an ESG PDF report |
| Login | One per person | One per organization |

Both types use the same dashboard and pickup flow. The account type only changes a few labels and fields, and whether the ESG report is shown.

## 4. How it works

1. **Collect** plastic in an EcoCyclers sack.
2. **Request** a door pickup with an estimate, a photo and a map pin. Requests under 50 kg are pointed to the hub or the next area pickup day.
3. **Assign.** An admin checks the photo and estimate, then assigns a collector.
4. **Pickup.** The user follows the collector's location live.
5. **Weigh.** The collector scans the pickup QR code, photographs the load, and records the weight per material, minus contamination.
6. **Confirm.** The user confirms in the app or with an SMS code, or disputes with their own photo. No answer in 48 hours means auto-confirm.
7. **Get paid.** Points (1 point = ₦1) are credited at the price in force when the plastic was weighed, exactly once.
8. **Withdraw** to a bank account through Paystack, and watch impact grow.

Hub walk-ins follow the same flow from step 5, weighed by a collector stationed at the hub.

## 5. Who pays

EcoCyclers buys plastic from users at the posted price per kg. It sorts the plastic, removes contamination, bales it and **exports it to international companies**. The margin between the buy price and the export price is the revenue. PET bottles are the core material because demand for them is strongest. Door pickups start at 50 kg, and smaller amounts go through the hub, which keeps transport costs under control.

## 6. Success metrics

| Goal | Metric | MVP target |
|---|---|---|
| People get paid fairly and reliably | Pickups paid correctly (no double pay, no missing pay) | 100% |
| Trips are worth it | Average kg per door pickup | ≥ 50 kg |
| Weights are trusted | Pickups disputed | < 5% |
| Users come back | Users with a 2nd pickup within 60 days | ≥ 40% |
| Stock is tracked | Bales in the app match bales in the store | 100% |
| Payouts work | Withdrawals paid within 1 working day of approval | ≥ 95% |

## 7. Principles that never break

The hard part of this product is **money that is always right**. These rules come from `CLAUDE.md` and override convenience every time.

1. **Money is integer kobo.** Never floats. Weights are `Decimal` kg with 2 decimal places. `amount_kobo = round_half_up(net_kg × price_kobo_per_kg)`.
2. **The balance is computed from `ledger_entries`.** There is no balance column. Ledger rows are never updated or deleted; corrections are new `ADJUSTMENT` rows.
3. **A pickup is credited exactly once**, only when it becomes `COMPLETED`, enforced by a unique index.
4. **Withdrawals lock the user's profile row** (`SELECT … FOR UPDATE`) before checking the balance.
5. **The Paystack webhook verifies `x-paystack-signature`** and is idempotent.
6. **Pickup status changes only through `services/pickup_state.py`**, which allows only the transitions in `04-money-rules-and-tests.md`.
7. **Every write goes through FastAPI.** The browser uses Supabase only for login and Realtime subscriptions. FastAPI checks role and ownership on every route.
8. **Privacy.** Users never see a collector's phone number. A collector's location is stored only while the pickup is `EN_ROUTE` and only on that pickup. Users only see their own data.
9. **Secrets live in `.env` files**, which are gitignored. Keys are never committed and never logged.

## 8. Out of scope for the MVP

WhatsApp bot · mobile money payouts · multiple logins per organization · admin-defined time slots · route optimisation · plastic credits / EPR data sales · Igbo and Pidgin translations · native mobile apps.
