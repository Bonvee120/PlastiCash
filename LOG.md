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

**Broke**
- `curl localhost:8000` returned 404 from Docker/WSL, which also listen on port 8000 over IPv6 (`::1`). Using `127.0.0.1` reaches the spike; ngrok already forwards to `127.0.0.1`, so the real webhook was not affected.

**Next**
- 1.2: API skeleton (FastAPI, `config.py`, `db.py`, `GET /api/v1/health`, Dockerfile, `api` service in compose, pytest against `db-test`).
- 0.1: field conversations and price board photo; `RESEARCH.md` design decisions and sign-off, before Step 2. Decide the SACHET CO₂ factor (Mixed Plastics proxy or 0).
- Remove the ngrok test webhook URL from the Paystack dashboard once the tunnel is closed.
