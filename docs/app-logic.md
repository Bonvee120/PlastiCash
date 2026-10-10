# PlastiCash web app: logic and thought process (draft 1)

Source of truth: Kenzy's third description, plus the additions agreed in the thread
(Collector role, disputes with user photo, bottles-per-kg guide, bale inventory).

## 1. Roles

| Role | Who | Can do |
|---|---|---|
| User | Household, school, shop, office | Request pickup, track collector, confirm or dispute weight, wallet, withdraw, impact, ESG PDF |
| Collector | EcoCyclers staff | See only pickups assigned to them, share location while en route, scan QR, photo, enter weights |
| Admin | EcoCyclers office | Assign pickups, set prices, resolve disputes, review withdrawals, manage bales and stock |

Role is one column on the users table. Every API route checks the role and ownership.

## 2. The pickup journey (state machine)

```
REQUESTED ──admin assigns──▶ ASSIGNED ──collector starts──▶ EN_ROUTE
     │                                                          │
     └──user/admin cancels──▶ CANCELLED          collector scans user's QR,
                                                  photo + weights per material
                                                                ▼
                                                   AWAITING_CONFIRMATION
                                         ┌──────────────┼───────────────┐
                                  user confirms     user disputes     48h passes
                                  (in app or OTP)   (photo + claim)   (auto-confirm) 
                                         ▼               ▼               ▼
                                     COMPLETED ◀──admin resolves── DISPUTED
                                  (wallet credited once)
```

Walk-in at the hub: the admin creates the pickup and enters the weights directly, so it starts at AWAITING_CONFIRMATION.

Rules:
- Only legal transitions are allowed (e.g. you cannot complete a CANCELLED pickup). Enforce in one function in FastAPI.
- QR proves the collector was physically with the user. The confirmation (in-app button, or Termii OTP by SMS) proves the user agrees with the weight.
- Collector records **gross kg** and **deduction kg + reason** (contamination) per material. Payable = net kg × price.

## 3. Prices

- `prices` table holds versions: material, ₦/kg, effective_from, set_by.
- When weights are entered, the current price is **copied onto the pickup item**. Later price changes never change old pickups.

## 4. Money: the hard part

Store money as integer kobo (₦1 = 100 kobo), never floats.

**Wallet = ledger.** Balance is the sum of ledger entries, never a stored number you edit.

| Entry type | When | Amount |
|---|---|---|
| PICKUP_CREDIT | pickup becomes COMPLETED | + |
| WITHDRAWAL_HOLD | user requests withdrawal | − |
| WITHDRAWAL_REVERSAL | Paystack transfer failed or reversed | + |

Guarantees and how:
1. **A pickup is paid exactly once.** Unique index on (pickup_id) for PICKUP_CREDIT entries. A second attempt fails at the database.
2. **No overdraw, even with two withdrawal clicks at once.** In one transaction: lock the user's row (`SELECT … FOR UPDATE`), compute the balance, check amount ≤ balance and ≥ minimum, insert withdrawal (PENDING) + WITHDRAWAL_HOLD.
3. **The webhook never pays twice.** Verify the `x-paystack-signature` header (HMAC SHA512 of the body with your secret key). Look up the withdrawal by its transfer reference; if it's already PAID or FAILED, return 200 and do nothing.
4. **A failed transfer reverses exactly once.** Unique index on (withdrawal_id) for WITHDRAWAL_REVERSAL.

Your three tests write themselves: double credit, concurrent withdrawals, duplicate webhook.

**Points:** if you keep them, make 1 point = ₦1 fixed and show both. Otherwise just show naira. Points that change value are a trust problem.

## 5. Disputes

- While AWAITING_CONFIRMATION, the user taps Dispute: uploads own photo, claimed kg, reason.
- Pickup moves to DISPUTED; nothing is credited.
- Admin sees collector photo and user photo side by side, sets the final kg with a note, and the pickup goes to COMPLETED (credit happens then, once).
- Store dispute fields on the pickup row to save a table: dispute_photo_url, claimed_kg, dispute_reason, resolved_kg, resolved_by, resolution_note.
- Track disputes per collector. One collector with many disputes is a signal.

## 6. Live tracking

- Only while EN_ROUTE, the collector's phone sends its position every ~20 seconds.
- Store only the latest position on the pickup (collector_lat, collector_lng, updated_at). No history needed.
- The user's map subscribes to that pickup via Supabase Realtime. Stop sharing once weights are entered.
- The user sees the collector's first name and position, never their phone number (calls go through the office or a masked number later).

## 7. Inventory and bales

- Raw stock per material = total net kg from COMPLETED pickups − kg already put into bales.
- `bales` table: id/QR, material, weight_kg, status (IN_STORE → PROCESSED → SOLD), created_at, sold_price, buyer.
- Admin dashboard: raw kg in store, bales in store, bales processed, bales sold, revenue.
- **Real loss %** = (raw kg in − bale kg out) ÷ raw kg in. That checks your 5% + 2% guesses.

## 8. Small features

- **Welcome, Chinaza:** first name from profile; fallback "Welcome".
- **Bottles per kg guide:** admin-editable table (bottle size → approx. bottles per kg). Show "about N bottles = 1 kg = ₦X today".
- **Impact:** CO₂ saved = net kg × emission factor per material (cite US EPA WARM). Computed, not stored.
- **ESG PDF:** monthly totals per user from completed pickups, rendered with WeasyPrint.
- **Notifications:** driven by pickup status changes (Realtime + toast); SMS only for OTP.

## 9. Tables (7, inside the capstone limit)

1. users (role, name, phone, bank details reference)
2. prices (versioned)
3. pickups (status, schedule, address/pin, collector_id, QR token, location, dispute fields)
4. pickup_items (material, gross kg, deduction kg, reason, price snapshot, photo)
5. ledger_entries
6. withdrawals
7. bales

## 10. Screens

- **Public:** landing page, sign up / login.
- **User:** dashboard (welcome, balance, impact), request pickup, pickup detail (map, confirm/dispute), wallet + withdraw, impact + ESG PDF, bottles guide.
- **Collector:** my pickups today, pickup job (start, scan QR, photo, weights).
- **Admin:** pickups board (assign), disputes, prices, withdrawals, stock and bales, users.

## 11. Decisions from Kenzy (round 2)

1. The collector enters the weight, the user confirms it, and the admin only handles disputes.
2. Points are kept: 1 point = ₦1, fixed.
3. One pickup can hold several materials (pickup_items).
4. The user picks the pickup time. Suggestion: offer slots the admin opens per area and day, so collectors can batch nearby pickups.
5. **Door pickup minimum: 50 kg.** Users without a scale give an *estimate*:
   - The request form asks for familiar units: number of bags by size (sachet bag, rice sack, Ghana-must-go), or a bottle count. It also asks for a photo of the pile.
   - The app converts the estimate to kg with admin-editable factors (weigh a few full bags yourselves to set them).
   - If the estimate is under 50 kg, offer: hub drop-off, or join the next area pickup day.
   - On site, the real weight decides. If it's well under 50 kg, the collector still takes it and pays normally, and the pickup is flagged. Repeated under-minimum requests get a warning.
   - 50 kg of PET is a lot (thousands of bottles), so most households will use the hub or area days. Schools, offices, shops and estates are the 50 kg+ customers.
6. **Confirmation: both in-app and SMS OTP.** If the user forgets:
   - Best case, they confirm on the spot: the collector shows the weight and the user taps confirm or reads out the SMS code.
   - If not, they get an in-app/push reminder at once, an SMS after 2 hours, another after 12 hours and a last one after 24 hours.
   - After 48 hours with no answer, the pickup **auto-confirms** at the collector's weight and is credited.
   - After that, a complaint goes to support. Any fix is a new ledger adjustment entry, never an edit.

## 12. Account types: Individual and Organization

The **User** role has two account types, chosen at sign-up and stored as `account_type` on the users table (no new table).

| | Individual | Organization |
|---|---|---|
| Who | Families, students, scavengers, waste pickers | Companies, schools, NGOs, churches, estates |
| Sign-up fields | Full name, phone | Organization name, type, address, contact person name and phone; registration (CAC) number optional |
| Greeting | "Welcome, Chinaza" | "Welcome, Green Hills School" |
| Usual way in | Hub walk-in or area pickup day (rarely reaches 50 kg) | Door pickup, 50 kg+, often recurring |
| ESG PDF | Hidden (personal impact page instead) | Monthly/annual ESG PDF and certificate |
| Payout | Own bank account | Organization's bank account (account name should match the org) |

Same dashboard and same pickup flow for both. The account type only switches a few labels, fields and the ESG section, so the product stays lean.

Waste pickers and scavengers: Individual accounts, but they bring volume often. Optionally an admin-set "verified picker" badge for faster hub weighing.

## 13. Knowing the amount before sending a collector

Goal: never drive out for less than ~10 kg. Layers, from cheapest to strongest:

1. **EcoCyclers standard sack.** Give each user branded sacks of one size. Weigh a few full sacks of PET yourselves to learn the typical kg per full sack. Requests are made in "full sacks", so estimates become reliable. (The sack is also marketing.)
2. **Estimate + photo on every request.** Sacks or bags by size, or bottle count, plus a photo of the pile. The app shows the estimate in kg.
3. **Progress bar instead of a refusal.** "You have about 12 kg. Door pickup starts at 50 kg. Keep saving, or drop off at the hub." Users store until they qualify.
4. **Admin check before dispatch.** A request stays REQUESTED until the admin looks at the photo and estimate and assigns it. Doubtful ones get a call or WhatsApp message first.
5. **Area pooling.** Small requests in the same area wait in a pool. When the pool's estimated total makes a run worth it, the admin schedules one route day for all of them.
6. **Estimate accuracy score.** The app compares each user's estimate with the real weight. Users who keep over-estimating lose door pickup and are sent to the hub. Optional: a small transport deduction when the real weight is far under the minimum.

## 14. Future integrations (not in the MVP)

- **WhatsApp bot:** schedule pickups, get reminders and confirm weights over WhatsApp (Meta WhatsApp Business Platform). Mention it in the pitch as a planned feature; nothing is built for it now.

## 15. Decisions from Kenzy (round 3)

1. One login per organization.
2. Auto-confirm after **48 hours** (reminders at once, 2 h, 12 h, 24 h).
3. Supabase for database, login and realtime; every write goes through FastAPI.
4. Keep **both shadcn/ui and daisyUI**. Tip: give daisyUI a class prefix and use shadcn for interactive pieces (forms, dialogs, toast) so the two don't style the same element.
5. Withdrawals: **bank accounts only** for the MVP (Paystack transfers).
6. Hub walk-ins are weighed by **a collector stationed at the hub**, using the same weighing screen.
7. Buyer of sorted plastic: **an international organisation** (to clarify: export buyer of material, or a programme that pays per tonne collected).
8. Cans sell at **₦500/kg**, the same as the buy price. After 7% loss and transport, every can kg loses money. Options: lower the can buy price (e.g. ₦400/kg) or leave cans out of the MVP seed data.
9. Keep **impact tracking**; the carbon footprint calculator is dropped from the MVP.

## 16. Final settled points

- **Cans:** buy price lowered to **₦400/kg**, sell ₦500/kg. Per 1,000 kg trip: 931 kg × ₦500 = ₦465,500 − (₦400,000 + ₦20,000) = **₦45,500 gross**. Positive but thin; PET stays the core.
- **Buyers:** EcoCyclers **exports** sorted, baled plastic to **international companies**, who buy it. This is the "Who pays" story: the margin between the ₦/kg paid to users and the export price.
  - Export means bales must meet buyer specs (sorted by type/colour, clean, baled), which is why the bales inventory matters.
