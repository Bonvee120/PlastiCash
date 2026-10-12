# 05 — Setup, accounts, env vars, deploy

## Accounts to create (Kenzy does this before Claude Code starts)

| Service | What to get | Notes |
|---|---|---|
| GitHub | New repo `plasticash` | Push the docs folder first |
| Supabase | New project (region close to Nigeria, e.g. EU) | Copy Project URL, anon/publishable key, service role key, database connection string. Auth → Email provider on. |
| Paystack | Account in **test mode** | Copy test secret key. Set the test webhook URL once the API is deployed. Check the transfers settings: API transfers may need the "OTP for transfers" setting turned off to go through automatically. |
| Cloudinary | Free account | Cloud name, API key, API secret |
| Termii | Account | API key; request a sender ID (e.g. "EcoCyclers"), which needs approval and can take time, so apply early |
| Vercel | Account linked to GitHub | For `web/` |
| Render | Account linked to GitHub | For `api/` (Docker web service) |
| cron-job.org or GitHub Actions | Free scheduled call | Calls `/jobs/reminders` every 15 min |

Free tiers to know about: Supabase pauses inactive free projects, and Render's free service sleeps when idle (the first request is slow). Wake both up before the demo.

## Env vars

`api/.env` (never committed; add `api/.env.example` with empty values):

```
DATABASE_URL=postgresql+asyncpg://...        # Supabase connection string (session pooler port 5432, or direct)
TEST_DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5433/plasticash_test
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_JWT_SECRET=                          # only if the project uses legacy HS256 JWTs; else JWKS is used
SUPABASE_SERVICE_ROLE_KEY=                    # server only: creating collector accounts
PAYSTACK_SECRET_KEY=sk_test_...
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
TERMII_API_KEY=
TERMII_SENDER_ID=
TERMII_BASE_URL=                              # from your Termii dashboard
OTP_SECRET=                                   # random 32+ chars
CRON_SECRET=                                  # random 32+ chars
FRONTEND_ORIGIN=http://localhost:3000         # CORS; the Vercel URL in production
MIN_WITHDRAWAL_KOBO=100000
DOOR_MIN_KG=50
AUTO_CONFIRM_HOURS=48
SMS_ENABLED=false                             # true only when Termii is ready; when false, log "SMS would send" without the code
```

`web/.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=
NEXT_PUBLIC_HUB_ADDRESS=
NEXT_PUBLIC_WHATSAPP_NUMBER=234...
```

The service role key, Paystack secret and Cloudinary secret must **never** appear in `web/`.

## Local development

1. Install: Node 20+, Python 3.12, Docker Desktop, Git.
2. `docker compose up -d db-test` (Postgres 16 on port 5433 for tests).
3. API: `cd api && python -m venv .venv && pip install -r requirements.txt && alembic upgrade head && python -m scripts.seed && uvicorn app.main:app --reload`
4. Web: `cd web && npm install && npm run dev`
5. Paystack webhooks locally: expose the API with a tunnel (e.g. ngrok) and set that URL as the test webhook in the Paystack dashboard.

## Docker

`api/Dockerfile`: `python:3.12-slim`, install WeasyPrint's system libraries (Pango, HarfBuzz, fonts) with apt, then pip install, run `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.

`docker-compose.yml`: `api` (built from `api/`) and `db-test` (postgres:16).

## Deploy

- **API → Render**: Docker web service from `api/`, env vars set in the dashboard, health check `/api/v1/health`. Run `alembic upgrade head` as the pre-deploy command.
- **Web → Vercel**: root `web/`, env vars set, `NEXT_PUBLIC_API_URL` = Render URL.
- **Paystack**: test webhook URL = `https://<render-url>/api/v1/webhooks/paystack`.
- **Cron**: POST `https://<render-url>/api/v1/jobs/reminders` every 15 min with header `X-Cron-Secret`.
- Set `FRONTEND_ORIGIN` on the API to the Vercel URL.
