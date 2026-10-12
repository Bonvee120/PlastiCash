# CLAUDE.md — PlastiCash by EcoCyclers

Read this first. It tells you what we're building, how the repo is laid out and the rules that must never break.

## What this is

PlastiCash is a web app where individuals and organizations in Enugu, Nigeria sell plastic waste to EcoCyclers by weight.
A user requests a pickup (or walks in to the hub). An EcoCyclers collector weighs the plastic. The user confirms the weight, and their wallet is credited in points (1 point = ₦1), which they can withdraw to a bank account via Paystack. EcoCyclers bales the plastic and exports it.

Full product description: `docs/product-description.md`. Decisions and reasoning: `docs/app-logic.md`.
Requirements: `docs/PRD.md` (product), `docs/TRD.md` (technical), `docs/APP_FLOW.md` (flows), `docs/BACKEND_SCHEMA.md` (runnable SQL), `docs/DESIGN_BRIEF.md` (look and feel).

## Spec files (in `docs/specs/`)

| File | What it covers |
|---|---|
| `01-data-model.md` | The 7 tables, columns, constraints, indexes, RLS |
| `02-api.md` | Every FastAPI endpoint, who can call it, what it does |
| `03-screens-and-routes.md` | Every Next.js page, per role |
| `04-money-rules-and-tests.md` | Ledger, withdrawals, Paystack webhook, state machine, required tests |
| `05-setup-and-env.md` | Accounts, keys, env vars, local dev, deploy |
| `06-build-order.md` | The order to build in, with a "done when" for each step |

When a spec and the code disagree, the spec wins. If a spec is unclear or two specs conflict, stop and ask; don't guess.

## Stack

- **web/**: Next.js (App Router) + TypeScript, Tailwind CSS, shadcn/ui, daisyUI (with class prefix `d-`), Framer Motion, Leaflet (react-leaflet), Sonner toasts, shadcn Skeleton. Deployed on Vercel.
- **api/**: Python 3.12, FastAPI, SQLModel, Alembic, pytest. **Async throughout:** `async def` endpoints and dependencies, SQLModel `AsyncSession` on the `asyncpg` driver (`postgresql+asyncpg://` URLs), an async Alembic env, and async tests (`pytest-asyncio`, `httpx.AsyncClient`). Runs in Docker. Deployed on Render.
- **Supabase**: Postgres database, Auth (email + password), Realtime. Supabase Storage is not used; photos go to Cloudinary.
- **Integrations**: Paystack (test mode: transfer recipients, transfers, webhook), Cloudinary (signed uploads), Termii (SMS codes and reminders, sandbox), WeasyPrint (ESG PDF).

## Repo layout

```
/
├─ CLAUDE.md
├─ docker-compose.yml        # api + postgres for tests
├─ docs/
│  ├─ product-description.md
│  ├─ app-logic.md
│  └─ specs/01..06
├─ api/
│  ├─ Dockerfile
│  ├─ alembic/ , alembic.ini
│  ├─ app/
│  │  ├─ main.py
│  │  ├─ config.py           # settings from env
│  │  ├─ db.py               # engine, session
│  │  ├─ auth.py             # verify Supabase JWT, load profile, role guards
│  │  ├─ models.py           # SQLModel tables
│  │  ├─ schemas.py          # request/response models
│  │  ├─ routers/            # me.py, pickups.py, collector.py, admin.py, wallet.py, webhooks.py, jobs.py
│  │  └─ services/           # ledger.py, pickup_state.py, paystack.py, termii.py, cloudinary.py, pdf.py, impact.py
│  ├─ scripts/seed.py
│  └─ tests/
└─ web/
   ├─ app/                   # routes, see 03-screens-and-routes.md
   ├─ components/
   └─ lib/                   # api client, supabase client, formatters
```

## Rules that must never break

1. **Money is integer kobo.** Never floats. Weights are `Decimal` kg with 2 decimal places. `amount_kobo = round_half_up(net_kg × price_kobo_per_kg)`.
2. **The balance is computed from `ledger_entries`.** There is no balance column. Never update or delete a ledger row; corrections are new `ADJUSTMENT` rows.
3. **A pickup is credited exactly once**, only when it becomes `COMPLETED`, enforced by a unique index.
4. **Withdrawals lock the user's profile row** (`SELECT … FOR UPDATE`) before checking the balance.
5. **The Paystack webhook verifies `x-paystack-signature`** and is idempotent.
6. **Pickup status changes only through `services/pickup_state.py`**, which allows only the transitions in `04-money-rules-and-tests.md`.
7. **Every write goes through FastAPI.** The browser uses Supabase only for login and Realtime subscriptions. FastAPI checks role and ownership on every route.
8. **Privacy.** Users never see a collector's phone number. A collector's location is stored only while the pickup is `EN_ROUTE` and only on that pickup. Users only see their own data.
9. **Secrets live in `.env` files**, which are gitignored. Never commit keys and never log them.

## Commands

- API dev: `cd api && uvicorn app.main:app --reload`
- Migrations: `cd api && alembic revision --autogenerate -m "..." && alembic upgrade head`
- Tests: `docker compose up -d db-test && cd api && pytest` (tests need real Postgres for the locking tests, not SQLite)
- Seed: `cd api && python -m scripts.seed`
- Web dev: `cd web && npm run dev`

## Git: hands off

- **Never run `git commit`, `git push`, `git merge`, `git rebase` or `git reset`.** Kenzy reviews and commits every change personally.
- Never add `Co-Authored-By` or any AI attribution to files, messages or docs.
- When a step is done, stop and list the changed files and a suggested commit message.

## Working style

- Build in the order of `06-build-order.md`. Finish a step, including its tests, before starting the next.
- Keep `LOG.md` updated daily (capstone requirement): what was done, what broke, what's next.
- Suggest small, clear commit messages; Kenzy makes the commits.
