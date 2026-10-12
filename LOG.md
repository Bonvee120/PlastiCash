# Build log
## PlastiCash by EcoCyclers

One entry per day: what was done, what broke, what's next.

## 2026-10-10

**Done**
- Reorganized the repo to the `CLAUDE.md` layout: `docs/` and `docs/specs/`; `settings.json` moved to `.claude/`; `download` renamed to `.gitignore`.
- Added the constitution: `docs/specs/mission.md`, `tech-stack.md`, `roadmap.md`.
- Build order: access tests 14–15 moved from step 3 to step 5 (they need the pickup and collector endpoints).
- Step 0 started: `RESEARCH.md` skeleton; Paystack webhook spike in `spikes/paystack_webhook.py` (39 lines, Python standard library only). Tested locally with a fake key: a correctly signed request gets 200, a bad signature gets 401.

**Broke**
- Nothing.

**Next**
- 0.1 and 0.2: field conversations, price board photo, competitors, sources; fill in `RESEARCH.md`.
- 0.3: run the spike against a real Paystack test webhook through ngrok.

## 2026-10-12

**Done**
- 0.3 spike works against real Paystack. Test transaction `T301509561689991` paid with the Paystack test card; Paystack (`Paystack/2.0`, domain `test`) sent `charge.success` through ngrok and the spike answered 200.
- Replayed the exact captured body and `x-paystack-signature` to the spike: 200 `VERIFIED`. The same body with one word changed and the original signature: 401 `REJECTED`.
- 0.2 (part): `RESEARCH.md` competitors (Wecyclers, Scrapays) and sources (National Policy on Plastic Waste Management, NESREA EPR guideline and 2026 regulations, US EPA WARM v16) filled in, with CO₂ factors per material for `prices.co2_kg_saved_per_kg`.
- Decision: started Step 1 before Step 0 sign-off. The skeleton has no product features, so the "no feature code" rule holds. Field research (0.1) and sign-off must be done before Step 2.
- 1.1 done: `docker-compose.yml` with `db-test` (Postgres 16 on port 5433, with a health check); `api/.env.example` and `web/.env.example` (secrets empty, non-secret defaults from `05-setup-and-env.md`). `docker compose up -d db-test` starts Postgres 16.15 and reports healthy.
- 1.2 done: FastAPI app with `GET /api/v1/health` → `{"ok": true}` and CORS for `FRONTEND_ORIGIN`; `config.py` (pydantic-settings, reads `api/.env`); `db.py` (engine and per-request session); pinned `requirements.txt`; pytest fixtures on `TEST_DATABASE_URL`, each test in a rolled-back transaction. `pytest`: 2 passed against Postgres 16 (`db-test`). `Dockerfile` (`python:3.12-slim` + WeasyPrint system libraries) and an `api` service in compose; the image builds and answers `/api/v1/health`.
- Local venv uses Python 3.12 via `uv venv --python 3.12 api/.venv`; the machine default is 3.14.
- 1.3 done: `web/` from `create-next-app` 16.4 (App Router, TypeScript, Tailwind 4, ESLint); shadcn (`base-nova`) with Button; daisyUI 5 with prefix `d-`. Brand colours from `DESIGN_BRIEF.md` set once as shadcn CSS variables and as the `plasticash` daisyUI theme; Plus Jakarta Sans (headings) and Inter (body) via `next/font`; `tabular` utility for balances. Placeholder home page. `npm run lint` and `npm run build` pass; `npm run dev` shows the page with brand colours, fonts and both button styles, no console errors. Versions recorded in `tech-stack.md` §8.
- Step 1 done.
- `RESEARCH.md`: merged the desk research from `../RESEARCH.md` after checking its sources. Added secondary evidence (Fagbo et al. 2025, Oke & Olayide 2026, an online price comparison with Westman Recycle), interview questions and record template, 3 design decisions tied to findings, the SACHET CO₂ decision (Mixed Plastics proxy 1.025, labelled as an estimate), and a provisional desk-research sign-off. Left out two claims I could not check: the GreenBin prices and a Soso Care app/USSD percentage split.
- Decision: started Step 2 on the provisional desk-research sign-off. The 2 real conversations, price board photo and named sign-off are still required for Step 0 to count as done.
- 2.1 done: `api/app/models.py` with the 9 enums and 7 tables, including the checks and indexes (partial unique indexes on `ledger_entries` among them), so Alembic autogenerate stays in sync. Checked by creating the `BACKEND_SCHEMA.md` SQL and the models side by side on `db-test`: 118 columns, 47 constraints, 24 indexes and 9 enums, all identical.

**Broke**
- `curl localhost:8000` returned 404 during the spike test. Cause: an old prototype compose project (`platicash`, from `Desktop\PlatiCash`) still runs on ports 8000, 3000 and 5432. Using `127.0.0.1` reached the spike; ngrok already forwards to `127.0.0.1`, so the real webhook was not affected. Stop that project before `docker compose up api`, or the ports clash. The web dev server ran on port 3001 for the same reason.
- Next 16 dev blocks HMR and fonts (403) when the page is opened on `127.0.0.1`; open `http://localhost:<port>` instead.

- 2.2 done: Alembic set up in `api/`. `env.py` takes the URL from settings (`DATABASE_URL`; `-x db=test` for `TEST_DATABASE_URL`) and only looks at `public`, so Supabase's schemas are never touched. First migration `20261012_eb2f5fe2832e_initial_schema.py`: `pgcrypto`, the 7 tables with enums, checks and partial unique indexes (autogenerated from the models), and the 3 helper views via `op.execute`. `alembic -x db=test upgrade head` runs; `alembic check` finds nothing missing; downgrade to base leaves no tables, types or views. The migrated schema matches the `BACKEND_SCHEMA.md` SQL exactly (views, 133 columns, 47 constraints, 24 indexes, 9 enums).
- Found and fixed: `create_table` silently skips foreign keys marked `use_alter`, so `ledger_withdrawal_fk` was missing after the first upgrade. `alembic check` caught it; the migration now adds it with `op.create_foreign_key`.

- 2.3 (test DB side) done: migration `20261012_ea3a0e36fbad_rls_realtime_and_view_grants.py` enables RLS on all 7 tables, adds the `pickups` SELECT policy (own or assigned), adds `pickups` to `supabase_realtime`, and revokes the views from `anon` and `authenticated`. `tests/conftest.py` stubs what Supabase provides (`anon` and `authenticated` roles with Supabase's default grants, `auth.uid()` from the JWT `sub`, the publication) and runs `alembic upgrade head` once per test session. New `tests/test_rls.py`: a user sees only their own pickups, an assigned collector sees the pickup, `anon` sees none, the other 6 tables return no rows, the 3 views are denied, and only `pickups` is published. `pytest`: 15 passed. With RLS turned off, the user sees both pickups, so the test can fail. `downgrade -1` and `upgrade head` both work; `alembic check` is clean.

- 2.4 done: `tests/test_ledger_constraints.py`. A second `PICKUP_CREDIT` for the same pickup fails on `ledger_one_credit_per_pickup`; two different pickups can each be credited; the index is partial, so an `ADJUSTMENT` that refers to an already credited pickup is still allowed. With the index dropped, a pickup takes two credits, so the test can fail. Shared row helpers moved to `tests/factories.py`. `pytest`: 18 passed.

**Next**
- 2.5: `scripts/seed.py`.
- 2.3 (Supabase side): create `api/.env` with `DATABASE_URL` (session pooler or direct connection) and run `alembic upgrade head` on Supabase.
- 0.1: 2 real conversations with evidence and a price board photo; then the final, named sign-off of `RESEARCH.md`.
- Remove the ngrok test webhook URL from the Paystack dashboard once the tunnel is closed.
