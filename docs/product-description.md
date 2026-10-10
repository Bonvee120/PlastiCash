# PlastiCash by EcoCyclers

## Product Description

PlastiCash, owned by EcoCyclers, is a web platform that turns plastic waste into income for individuals and organizations in Enugu State, Nigeria. Users gather plastic at home, school or work, then either request a door pickup or walk in to the EcoCyclers hub. An EcoCyclers collector weighs the plastic on the spot, and the user confirms the weight. The user's wallet is then credited in points (1 point = ₦1), which they can withdraw to their bank account through Paystack. The platform also tracks the environmental impact of every kilogram.

EcoCyclers sorts and bales the plastic it collects and exports it to international companies. The difference between what EcoCyclers pays users and the export price funds the business.

## The Problem

Plastic recycling in Enugu fails for three reasons:

1. **No incentive.** Recyclable plastic is worth money, but nobody collects that value, so people throw it away.
2. **No convenience.** Even people who want to recycle have no reliable way to get plastic to a recycler.
3. **No visibility.** Nobody can see how much they recycled, what they earned or what it did for the environment, so recycling never becomes a habit.

The result is plastic that clogs drains, floods streets, and gets burned or buried, while Nigeria throws away recyclable material.

## The Solution

One web app connects the whole chain from waste to reward:

- **Users** register, request a pickup or walk in to the hub, confirm the weight, get paid, withdraw to the bank and watch their impact grow.
- **Collectors** (EcoCyclers staff) get their assigned pickups, travel to the user while showing their location live, scan the pickup QR code, photograph the load and record the weight.
- **Admins** assign pickups, set prices, settle weight disputes, review withdrawals and manage the stock of bales for export.

## Who Uses It

### Roles

| Role | Who | What they do |
|---|---|---|
| **User** | Individuals and organizations | Request pickups, confirm or dispute weights, use the wallet, withdraw, view impact |
| **Collector** | EcoCyclers staff (in the field or at the hub) | See only their assigned pickups, share location while on the way, scan the QR code, photograph the load, enter weights |
| **Admin** | EcoCyclers office, via a private portal not linked from the public site | Assign pickups, set prices, resolve disputes, review withdrawals, manage stock and bales |

### Account types (for Users)

| | Individual | Organization |
|---|---|---|
| **Who** | Families, students, scavengers, waste pickers | Companies, schools, NGOs, churches, estates |
| **Sign-up** | Full name, phone | Organization name, type, address, contact person; CAC number optional |
| **Greeting** | "Welcome, Chinaza" | "Welcome, Green Hills School" |
| **Usual channel** | Hub walk-in or area pickup day | Door pickup (50 kg and above) |
| **Reports** | Personal impact page | Personal impact page plus an ESG PDF report |
| **Login** | One per person | One per organization |

Both account types use the same dashboard and pickup flow. The account type only changes a few labels and fields, and whether the ESG report is shown.

## How It Works

1. **Collect.** Gather plastic in an EcoCyclers sack at home, school or work.
2. **Request.** Choose the materials, estimate the amount in full sacks, bags or bottles, add a photo, drop a map pin and pick a time slot. Requests under 50 kg are pointed to the hub or the next pickup day for the area.
3. **Assign.** An admin checks the photo and estimate, then assigns a collector.
4. **Pickup.** The collector travels to the user, and the user follows their location live on a map.
5. **Weigh.** The collector scans the pickup QR code, photographs the load, and records the weight of each material, minus anything deducted for contamination.
6. **Confirm.** The user confirms the weight in the app or with an SMS code, or disputes it with their own photo.
7. **Get paid.** Points are credited at that day's price per kg, exactly once.
8. **Withdraw.** The user cashes out to a bank account and sees their impact grow.

Walk-ins at the hub use the same flow from step 5, with a collector stationed at the hub doing the weighing.

## What We Buy (opening prices, set by admin)

| Material | Buy price per kg |
|---|---|
| PET bottles | ₦100 – ₦270 (depending on quality and quantity) |
| Other plastics | ₦280 |
| Cans | ₦400 |
| Tin | ₦200 |
| Sachets / nylon | ₦50 |

Prices are versioned. Each pickup is paid at the price in force when it was weighed, and later price changes never alter past pickups. A guide shows users roughly how many bottles make 1 kg and what that kilo earns today.

## Key Features

- **Pickup requests** with estimate, photo, map pin and time slot; supports several materials in one pickup
- **Pre-dispatch checks** on photo and estimate, with requests pooled by area so trips are worth it
- **Live collector tracking** shared only while the collector is travelling to the user; collectors' phone numbers are never shown
- **QR pickup confirmation**: the collector scans, photographs and records the weight on site
- **Weight confirmation** in the app or by SMS code (Termii)
- **Disputes**: the user uploads their own photo and the weight they claim; the admin compares both photos and sets the final weight
- **Auto-confirm**: reminders go out straight away, then at 2, 12 and 24 hours; after 48 hours with no answer, the pickup confirms at the collector's weight
- **Wallet and withdrawals**: points earned from real weights, withdrawn to a bank account through Paystack transfers
- **Impact tracking**: total plastic recycled, cash earned and CO₂ saved for each user
- **ESG report export** for organizations: a PDF of recycling performance (WeasyPrint)
- **Inventory and bales**: stock in kg for each material, bales in store, processed and sold, plus the real contamination and processing loss
- **Notifications**: real-time updates when a pickup is assigned, collected, confirmed or completed
- **Personal greeting**: "Welcome, Chinaza" on the dashboard

## The Hard Part: Money That Is Always Right

- The wallet is a **ledger**, and the balance is always calculated from its entries.
- **A pickup is paid exactly once.** A second credit for the same pickup is rejected by the database.
- **Users can't withdraw more than their balance**, even if they request two withdrawals at the same moment.
- **The Paystack webhook is verified** by its signature and never pays twice.
- **A failed transfer is refunded to the wallet exactly once.**
- Corrections are new ledger entries. Past entries are never edited.

## Business Model: Who Pays

EcoCyclers buys plastic from users at the posted price per kg. It then sorts it by type and colour, removes contamination, bales it and **exports it to international companies**. The margin between the buy price and the export price is the revenue. PET bottles are the core material because they have the strongest demand. Door pickups start at 50 kg and smaller amounts go through the hub, which keeps transport costs under control.

## Technology

- **Frontend:** Next.js and TypeScript, Tailwind CSS, shadcn/ui and daisyUI, Framer Motion, toasts on form submission, skeletons while loading
- **Backend:** Python FastAPI with Alembic migrations, in Docker
- **Data and auth:** Supabase (Postgres, authentication, realtime); every write goes through FastAPI, which checks each user's role and what they own
- **Integrations:** Paystack (test-mode transfers and webhook), Leaflet maps, Cloudinary (photos), Termii (SMS codes), WeasyPrint (ESG PDF)
- **Security:** users only see their own data, and collectors' contact details and exact locations are never exposed to other users

## Future Integrations

- **WhatsApp bot** to schedule pickups, receive reminders and confirm weights over WhatsApp

## In One Line

EcoCyclers makes recycling pay: PlastiCash connects individuals and organizations to EcoCyclers collectors, pays for plastic by weight, and turns that waste into measurable environmental impact and export-ready material.
