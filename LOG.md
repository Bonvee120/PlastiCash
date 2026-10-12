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

**Broke**
- `curl localhost:8000` returned 404 during the spike test. Cause: an old prototype compose project (`platicash`, from `Desktop\PlatiCash`) still runs on ports 8000, 3000 and 5432. Using `127.0.0.1` reached the spike; ngrok already forwards to `127.0.0.1`, so the real webhook was not affected. Stop that project before `docker compose up api`, or the ports clash.

**Next**
- 1.3: web skeleton (Next.js App Router + TypeScript, Tailwind, shadcn/ui, daisyUI with prefix `d-`, tokens and fonts from `DESIGN_BRIEF.md`); pin the Tailwind 3 vs 4 choice in `tech-stack.md`.
- 0.1: field conversations and price board photo; `RESEARCH.md` design decisions and sign-off, before Step 2. Decide the SACHET CO₂ factor (Mixed Plastics proxy or 0).
- Remove the ngrok test webhook URL from the Paystack dashboard once the tunnel is closed.
