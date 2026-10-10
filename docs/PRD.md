# Product Requirements Document (PRD)
## PlastiCash by EcoCyclers

| | |
|---|---|
| Product | PlastiCash (web app) |
| Owner | EcoCyclers |
| Launch city | Enugu, Nigeria |
| Version | 1.0 (MVP, capstone) |
| Related | `product-description.md`, `app-logic.md`, `TRD.md`, `APP_FLOW.md`, `BACKEND_SCHEMA.md`, `specs/` |

---

## 1. Overview

PlastiCash lets individuals and organizations in Enugu sell their plastic waste to EcoCyclers by weight. Users request a door pickup or walk in to the hub. An EcoCyclers collector weighs the plastic, and the user confirms the weight. The user's wallet is credited in points (1 point = ₦1), which they withdraw to their bank account. EcoCyclers sorts and bales the plastic and exports it to international companies.

## 2. Problem

1. **No incentive.** Recyclable plastic has value, but nobody claims it, so it's thrown away.
2. **No convenience.** Willing people have no reliable way to get plastic to a recycler.
3. **No visibility.** Nobody sees what they recycled, earned or saved, so recycling never becomes a habit.

Result: plastic clogs drains, floods streets, and is burned or buried.

## 3. Goals and success metrics

| Goal | Metric | MVP target |
|---|---|---|
| People get paid fairly and reliably | Pickups paid correctly (no double pay, no missing pay) | 100% |
| Trips are worth it | Average kg per door pickup | ≥ 50 kg |
| Weights are trusted | Pickups disputed | < 5% |
| Users come back | Users with a 2nd pickup within 60 days | ≥ 40% |
| Stock is tracked | Bales in the app match bales in the store | 100% |
| Payouts work | Withdrawals paid within 1 working day of approval | ≥ 95% |

## 4. Users

| Type | Who | Main need |
|---|---|---|
| **User: Individual** | Families, students, scavengers, waste pickers | Get paid for plastic easily |
| **User: Organization** | Companies, schools, NGOs, churches, estates | Regular pickups, proof of impact (ESG report) |
| **Collector** | EcoCyclers staff, in the field or at the hub | Clear daily jobs, fast weighing |
| **Admin** | EcoCyclers office | Control prices, pickups, payouts, disputes, stock |

## 5. Scope

### In scope (MVP)
- Sign-up/login with Individual or Organization account type; one login per organization
- Door pickup requests (≥ 50 kg estimated) and hub walk-ins
- Estimate by sacks/bags/bottles with photo; progress bar to 50 kg; area pooling for smaller requests
- Admin assigns pickups to collectors
- Live collector location while on the way
- QR scan, photo and weight per material on site, with contamination deductions
- Confirmation in app or by SMS code; disputes with user photo; auto-confirm after 48 h
- Wallet as a ledger, points = naira, withdrawals to bank via Paystack (after admin approval)
- Versioned prices per material
- Impact tracking (kg, points, CO₂)
- ESG PDF report for organizations
- Inventory: raw stock and bales (in store, processed, sold)
- Bottles-per-kg guide
- Landing page
- Admin portal (private URL, role-protected)

### Out of scope (later)
WhatsApp bot · mobile money payouts · multiple logins per organization · admin-defined time slots · route optimisation · plastic credits / EPR data sales · Igbo and Pidgin translations · native mobile apps.

## 6. User stories and acceptance criteria

### Individual and Organization users
| ID | Story | Acceptance criteria |
|---|---|---|
| U1 | As a new user, I sign up as an Individual or Organization | Account type chosen at sign-up; organization must give org name, type, address, contact person; phone is unique |
| U2 | I'm greeted by name | Dashboard shows "Welcome, {first name}" or "Welcome, {org name}"; falls back to "Welcome" |
| U3 | I see today's prices and how many bottles make a kilo | Prices come from the current price version; guide shows items per kg and ₦ per kg |
| U4 | I request a door pickup | I choose materials, estimate in sacks/bags/bottles, add a photo, pin location, address, area, preferred date and morning/afternoon; I see estimated kg and points |
| U5 | I'm told kindly when I don't have enough | If estimate < 50 kg, I see a progress bar, the hub address and an option to join the next area pickup day |
| U6 | I track my collector | While on the way, I see the collector's first name and live position; never their phone number |
| U7 | I show my QR code | My pickup shows a QR code while assigned or on the way |
| U8 | I see exactly how my payment was worked out | Weight per material, deductions with reason, price per kg, amount, collector's photo |
| U9 | I confirm the weight | Confirm in app, or read the SMS code to the collector; wallet is credited once |
| U10 | I dispute a wrong weight | While awaiting confirmation I upload my photo, my weight and a reason; nothing is paid until the admin decides |
| U11 | I'm reminded if I forget | Reminders at 2, 12 and 24 h; auto-confirm at 48 h |
| U12 | I add my bank account | I pick a bank and enter my account number; I see the resolved account name before saving |
| U13 | I withdraw | Minimum ₦1,000; can't exceed balance; status shows Pending → Processing → Paid, or Failed/Rejected with money returned |
| U14 | I see my impact | Total kg by material, points earned, CO₂ saved |
| U15 | (Organization) I download an ESG report | PDF for a month or year with kg by material, CO₂ saved, pickups count |

### Collector
| ID | Story | Acceptance criteria |
|---|---|---|
| C1 | I see my jobs for today | Only pickups assigned to me |
| C2 | I start a trip | My location is shared every ~20 s only while the trip is active |
| C3 | I prove I'm at the right place | I scan the user's QR; weighing is blocked until the scan succeeds |
| C4 | I record the weight | Per material: gross kg, deduction kg + reason, one photo; the app shows the total payout |
| C5 | I get the customer's confirmation | I enter the 6-digit SMS code the customer reads out; 5 wrong tries locks it |
| C6 | I handle hub walk-ins | I find the user by phone and weigh their plastic in the same way |

### Admin
| ID | Story | Acceptance criteria |
|---|---|---|
| A1 | I see and assign requests | Board filtered by status, area, date, with estimated kg totals per area; I assign a collector and date |
| A2 | I set prices | Adding a price creates a new version; old pickups keep their price |
| A3 | I settle disputes | I see both photos and weights, set the final kg per material and a note; the user is paid once |
| A4 | I approve or reject withdrawals | Approve sends the Paystack transfer; reject returns the money to the wallet |
| A5 | I correct a balance | Adjustment entry with a required note; history is never edited |
| A6 | I manage users and collectors | Create collectors, deactivate accounts, mark verified pickers |
| A7 | I manage stock | See raw kg per material; create bales (not more than raw stock); mark bales processed and sold with buyer and price; see real loss % |
| A8 | I see how the business is doing | Kg this month, points paid, pending withdrawals, open disputes, estimate accuracy, disputes per collector |

## 7. Business rules

| Rule | Value |
|---|---|
| Points | 1 point = ₦1, fixed |
| Opening buy prices (₦/kg) | PET 100–270 (seed 185), Other plastics 280, Cans 400, Tin 200, Sachets/nylon 50 |
| Door pickup minimum | 50 kg estimated |
| Under-minimum on arrival | Still collected and paid; pickup flagged |
| Auto-confirm | 48 hours after weighing |
| Reminders | 2 h, 12 h, 24 h |
| OTP | 6 digits, 30 min, 5 attempts, 3 resends |
| Minimum withdrawal | ₦1,000 |
| Withdrawals | Bank account only; admin approves |
| Price changes | Never affect pickups already weighed |
| Corrections | New ledger entry with note; never edit history |
| Organizations | One login each |

## 8. Non-functional requirements

- **Mobile first:** usable on a 360 px screen and a low-end Android phone.
- **Light on data:** compressed images, skeleton loading, user dashboard under ~500 KB.
- **Correct money:** see `specs/04-money-rules-and-tests.md`.
- **Privacy:** users only see their own data; collector phone numbers and locations are never exposed beyond the active pickup.
- **Accessibility:** WCAG AA contrast, 48 px tap targets, labels on every input.
- **Availability:** demo-grade hosting (Vercel + Render + Supabase free/low tiers).

## 9. Assumptions and dependencies

- EcoCyclers sells baled plastic to international buyers at a price above the buy price.
- Users have a smartphone with a browser and a Nigerian bank account.
- Paystack (test mode for MVP), Termii, Cloudinary and Supabase are available.

## 10. Risks

| Risk | Mitigation |
|---|---|
| Too little volume per trip | 50 kg rule, hub, area pooling, standard sacks |
| Weight fraud (user or staff) | QR scan, photo, customer confirmation, disputes, disputes-per-collector stat |
| Double payouts | Ledger with unique constraints, idempotent webhook |
| SMS delivery delays | In-app confirm as the main path; SMS is backup |
| Export price drops | Versioned prices adjustable at any time |

## 11. Open items

- CO₂ factors per material (from US EPA WARM) — to fill in `prices`.
- kg per full EcoCyclers sack per material — weigh samples.
- Hub address and the final list of Enugu areas.
