# PlastiCash by EcoCyclers

People and organizations in Enugu sell plastic waste to EcoCyclers by weight. A collector weighs it in front of them and photographs the scale, the seller confirms the weight, and their wallet is credited in points (1 point = ₦1), which they withdraw to a Nigerian bank account through Paystack. EcoCyclers sorts, bales and exports the plastic.

- Web (Next.js, Vercel): `web/`
- API (FastAPI, async, Render): `api/`
- Database, login, realtime: Supabase (Postgres)
- Specs: `docs/` (start with `CLAUDE.md`, then `docs/specs/01..06`)
- Research and sources: `RESEARCH.md`. Build diary: `LOG.md`.

## The problem

Plastic that nobody pays for ends up in drains, open dumps and fires.

- Nigeria produces about **1.5 million tonnes of plastic waste a year**, and **less than 30%** is collected for recycling. The national target is 50% recycled by 2030, and the policy asks for collection hubs, incentives to separate at source and a place for informal collectors in the formal system. ([National Policy on Plastic Waste Management](https://faolex.fao.org/docs/pdf/nig214338.pdf), pp. 16, 23, 24, 47)
- In a survey of 770 households in Lagos and the FCT, **58.2% did not separate plastic** from other waste; in Lagos, 28.1% of households dumped it in the open and 8.4% burned it. ([Oke & Olayide 2026](https://www.macrothink.org/journal/index.php/emsd/article/view/23735))
- Waste pickers earn little and take the risks: in 1,274 Lagos pickers surveyed, about half earned ₦30,001–₦50,000 a month, with harassment, injuries and burns common. ([Fagbo et al. 2025](https://doi.org/10.1007/s10900-025-01463-9))
- Prices are unclear: the same material sells for very different prices to different buyers (PET ₦100–₦270 across buyers) and there is no public price list. (`RESEARCH.md`, section 1)

The existing services we found (Wecyclers, Scrapays) work in Lagos, pay in goods or through USSD wallets, and don't describe a step where the seller confirms the weight before being paid (`RESEARCH.md`, section 2). PlastiCash is for Enugu, pays money to a bank, and makes the weight something both sides agree on.

Field research is still open: two real conversations and a photo of a buy-back price board are required before the research is signed off (`RESEARCH.md`, section 5).

## The hard part: money that is right every time

Points are money. The difficult part is making sure a pickup is paid exactly once, a withdrawal never takes more than the balance, and Paystack's webhooks never pay or refund twice, even when requests race or arrive twice.

- **The balance is a ledger.** There is no balance column. Every credit, withdrawal hold, reversal and adjustment is an insert into `ledger_entries`; the balance is the sum. Rows are never updated or deleted (a database trigger refuses it); corrections are new `ADJUSTMENT` rows with a note.
- **A pickup is credited once.** A partial unique index allows one `PICKUP_CREDIT` per pickup. Confirming in the app, by SMS code, by the 48-hour auto-confirm and by an admin dispute decision all go through one state machine (`api/app/services/pickup_state.py`), which locks the pickup row (`SELECT … FOR UPDATE`) and credits inside the same transaction. A second confirmation sees the new status and gets 409.
- **Withdrawals lock the profile row** before reading the balance, so two simultaneous withdrawals can't both pass the check. The hold is written in the same transaction.
- **Paystack.** The withdrawal moves to PROCESSING and is committed before the transfer is requested, so a retry can't send it twice. A timeout leaves it PROCESSING (it may have gone through); only a clear refusal fails it and returns the money. The webhook checks the HMAC-SHA512 signature with a constant-time compare, refuses everything if no secret is configured, and is idempotent: a second `transfer.success` changes nothing and a second `transfer.failed` doesn't refund twice (unique index on the reversal).
- **Money is integer kobo**, weights are 2-decimal kg, and `amount = round_half_up(net_kg × price_kobo_per_kg)`. Each weighed item stores the price in force, so a later price change never changes a past pickup.
- **Proved with real concurrency.** The locking tests run on real Postgres with separate connections at the same time, and each was checked by removing the lock and watching the test fail (`LOG.md`).

All 20 required tests from `docs/specs/04-money-rules-and-tests.md` are in `api/tests` (search for `test_<n>_`), among 270+ tests in total.

## Why this design

| Decision | Why | Source |
|---|---|---|
| Collector weighs and photographs; the seller confirms or disputes before any credit; an admin decides disputes with both photos | Trust in the scale is unproven, most households don't separate plastic so loads carry water and dirt, and no competitor we found has a confirm step | Oke & Olayide 2026; `RESEARCH.md` §2, §4 |
| Confirm with a 6-digit SMS code as well as in the app; SMS reminders; auto-confirm after 48 hours | Nigerian recycling services reach people without smartphones through SMS and USSD | GSMA on Soso Care; Wecyclers and Scrapays (`RESEARCH.md` §1–2) |
| Prices are versions; every weighed item keeps a snapshot; prices are public on the landing page and the guide | Buy prices vary a lot between buyers and over time, with no public list | `RESEARCH.md` §1 price comparison; LAWMA recyclers directory |
| Door pickup from 50 kg; area pickup days and the hub (no minimum) for less; estimates in standard sacks with a photo | A trip has to be worth it; estimates make the 50 kg check possible before anyone drives | `docs/app-logic.md` §11, §13 (to test in the field) |
| CO₂ avoided = net kg × the material's factor at the time of weighing | Credible, citable factors for ESG reports | US EPA WARM v16 (`RESEARCH.md` §3; sachets use the mixed-plastics factor as an estimate) |
| Bank withdrawals only, through Paystack transfers, after admin approval | Cash to a bank, not goods; approval limits fraud while the service is new | `docs/app-logic.md` §15 |

## Who pays

EcoCyclers buys plastic at the posted price, sorts it by type and colour, removes dirt, bales it and **exports it to recycling companies abroad**. The margin between what it pays sellers and the export price runs the business. PET is the core material because demand for it is strongest. The 50 kg door minimum, area pickup days and the hub keep transport costs per kilo down. (`docs/product-description.md`, Business model)

Producers are starting to pay too. NESREA's Extended Producer Responsibility guideline (2026) and the National Environmental (Plastic Waste Control) Regulations 2026 make producers and importers responsible for recovering their plastic after use, through Producer Responsibility Organisations with collection targets. Verified, per-pickup weights from PlastiCash are the kind of record they need. ([ThisDay, Sep 2026](https://www.thisdaylive.com/2026/09/04/nigeria-tightens-war-on-plastic-waste-makes-producers-responsible-for-end-of-life-products/); [Landbell summary](https://landbell-group.com/newsroom/tackling-plastic-packaging-in-nigeria/))

Organizations (schools, offices, estates) get a monthly ESG report (PDF) of what they recycled and the CO₂ avoided.

## Run it locally

Needs Node 20+, Python 3.12, Docker Desktop. Full guide: `docs/specs/05-setup-and-env.md`.

```bash
docker compose up -d db-test                 # Postgres 16 on port 5433, for tests
cd api && python -m venv .venv && .venv/Scripts/pip install -r requirements.txt   # (bin/pip on macOS/Linux)
cp .env.example .env                         # fill in Supabase, Paystack, Cloudinary, Termii, secrets
alembic upgrade head && python -m scripts.seed
uvicorn app.main:app --reload --port 8001
pytest                                       # real Postgres; Paystack and Termii are mocked

cd ../web && npm install
cp .env.example .env.local                   # NEXT_PUBLIC_API_URL=http://localhost:8001/api/v1, Supabase URL and anon key
npm run dev
```

The ESG PDF needs WeasyPrint's system libraries (Pango, HarfBuzz); they are in the Docker image (`docker build -t plasticash-api api`). Without them the API answers 503 for the PDF and everything else works.

Seeded logins (password = `SEED_PASSWORD` from `api/.env`): `chinaza@example.com` (customer), `greenhills@example.com` (organization), `ifeanyi@example.com` (collector), `admin@example.com` (ops portal at `/ops-portal`).

## Deploy

See `docs/DEPLOY.md`: API on Render (Docker, Frankfurt), web on Vercel, Paystack webhook, and the reminders cron (`.github/workflows/reminders.yml`).
