# 04 — Money rules, state machine and tests

This is the capstone's "one hard part": **money that is always right**.

## Pickup state machine

All changes go through `services/pickup_state.py::transition(pickup, to_status, actor, **data)`, inside a DB transaction with the pickup row locked (`SELECT … FOR UPDATE`). Anything not in this table raises `IllegalTransition` → HTTP 409.

| From | To | Who | Side effects |
|---|---|---|---|
| REQUESTED | ASSIGNED | admin | set collector_id, scheduled date |
| REQUESTED / ASSIGNED | CANCELLED | owner user or admin | reason |
| ASSIGNED | EN_ROUTE | assigned collector | location sharing allowed |
| EN_ROUTE | AWAITING_CONFIRMATION | assigned collector (`/weigh`, requires QR scanned) | items + price snapshot, totals, under_minimum, OTP sent, location cleared |
| (new HUB pickup) | AWAITING_CONFIRMATION | hub collector (`/walk-ins`) | same as weigh |
| AWAITING_CONFIRMATION | COMPLETED | user (app), collector (OTP), job (48 h) | `credit_pickup()` |
| AWAITING_CONFIRMATION | DISPUTED | owner user | dispute fields |
| DISPUTED | COMPLETED | admin (`/resolve`) | recompute items, `credit_pickup()` |

COMPLETED and CANCELLED are final.

## Ledger rules

- Balance = `SUM(amount_kobo)` of the user's ledger entries. No balance column.
- Ledger rows are insert-only. No `UPDATE` or `DELETE` in code. Corrections are `ADJUSTMENT` rows by an admin with a note.
- `credit_pickup(pickup)`: insert `PICKUP_CREDIT` for `total_amount_kobo` with `pickup_id`. The partial unique index makes a second credit fail; catch `IntegrityError` and treat it as "already credited" (no double pay, no crash).

## Withdrawals

**Request** (`POST /withdrawals`), one transaction:
1. `SELECT * FROM profiles WHERE id = :user FOR UPDATE` (serializes concurrent requests by the same user).
2. Check bank details exist, `amount ≥ 100000` kobo, `amount ≤ balance`.
3. Insert withdrawal `PENDING` (snapshot bank details) and `WITHDRAWAL_HOLD` of `-amount`.
4. Commit.

**Approve** (admin): lock withdrawal row; must be PENDING → set PROCESSING; commit; then call Paystack `POST /transfer` `{source:"balance", amount, recipient, reference: withdrawal.id, reason:"PlastiCash payout"}`. Save `transfer_code`. If the API call itself errors before Paystack accepts it, mark FAILED + REVERSAL.

**Reject** (admin): PENDING → REJECTED + `WITHDRAWAL_REVERSAL` of `+amount`.

**Webhook** (`POST /webhooks/paystack`):
1. Read the **raw body**; compute HMAC-SHA512 with `PAYSTACK_SECRET_KEY`; compare to `x-paystack-signature` with `hmac.compare_digest`. Mismatch → 401, nothing changes.
2. Only handle `transfer.success`, `transfer.failed`, `transfer.reversed`; others → 200 and ignore.
3. Find withdrawal by `data.reference`; lock it.
4. If already PAID / FAILED / REJECTED → 200, do nothing (idempotent).
5. success → PAID, `paid_at`. failed/reversed → FAILED, `failure_reason`, insert `WITHDRAWAL_REVERSAL` (unique index guarantees once).
6. Return 200.

## OTP

6 digits, `secrets.randbelow`, stored as a hash (e.g. HMAC-SHA256 with a server secret), 30 min expiry, max 5 attempts, max 3 resends. Never logged.

## Auto-confirm job

Every 15 min (`POST /jobs/reminders` with `X-Cron-Secret`): for each AWAITING_CONFIRMATION pickup, by hours since `weighed_at`:
- ≥ 2 h and reminders_sent = 0 → SMS reminder 1
- ≥ 12 h and reminders_sent = 1 → reminder 2
- ≥ 24 h and reminders_sent = 2 → reminder 3 ("will auto-confirm in 24 hours")
- ≥ 48 h → COMPLETED, `confirmed_via = AUTO`, credit
Each pickup is handled in its own transaction with the row locked, so running the job twice at once can't double-credit.

## Required tests (pytest, real Postgres)

**Hard part (the three the capstone asks for, plus more):**
1. Confirming the same pickup twice (app + OTP, or two requests) credits exactly once.
2. Two simultaneous withdrawals that together exceed the balance: exactly one succeeds (run with two threads/connections).
3. The same `transfer.success` webhook delivered twice: PAID once, no extra rows.
4. `transfer.failed` delivered twice: exactly one REVERSAL, balance restored once.
5. Webhook with a bad signature → 401 and no change.
6. Changing a price after weighing doesn't change that pickup's amount.

**State machine and rules:**
7. Illegal transitions return 409 (e.g. confirm a CANCELLED pickup, weigh without QR scan).
8. Dispute → resolve credits once at the resolved weight with the original price snapshot.
9. Auto-confirm at 48 h credits once; running the job twice doesn't double-credit.
10. Withdrawal below ₦1,000 or above balance is rejected.
11. Reject withdrawal restores the balance.
12. Deduction greater than gross is rejected.
13. Wrong OTP 5 times locks it.

**Access:**
14. A user can't read or confirm another user's pickup.
15. A collector can't act on a pickup not assigned to them.
16. A USER calling `/admin/*` gets 403.
17. ESG report is 403 for INDIVIDUAL accounts.

**Other:**
18. Estimate: sacks × kg_per_full_sack gives the right kg and the 50 kg check.
19. Bale heavier than raw stock is rejected.
20. Greeting: display_name is first name for individuals, org name for organizations.

Paystack and Termii calls are mocked in tests (e.g. `respx` for httpx). Locking tests must use real Postgres (docker compose `db-test`), not SQLite.
