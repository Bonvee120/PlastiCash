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
