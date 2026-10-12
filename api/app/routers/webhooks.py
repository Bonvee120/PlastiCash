"""Paystack webhook (docs/specs/04-money-rules-and-tests.md, CLAUDE.md rule 5).

1. HMAC-SHA512 of the raw body with PAYSTACK_SECRET_KEY must equal x-paystack-signature (constant-time compare);
   otherwise 401 and nothing changes. No secret configured: refuse everything (an empty key would let anyone sign).
2. Only transfer.success, transfer.failed and transfer.reversed change anything; other events get 200 and are ignored.
3. The withdrawal (id = Paystack `reference`) is locked; a final one (PAID / FAILED / REJECTED) is left as it is, so a
   duplicate or replayed delivery changes nothing.
4. After a valid signature the answer is always 200, so Paystack stops retrying.
"""
import hashlib
import hmac
import json
import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlmodel.ext.asyncio.session import AsyncSession

from app.config import get_settings
from app.db import get_session
from app.errors import ApiError
from app.services import withdrawals

router = APIRouter(prefix="/webhooks", tags=["webhooks"])
log = logging.getLogger(__name__)

SessionDep = Annotated[AsyncSession, Depends(get_session)]
FAILURE_EVENTS = {"transfer.failed": "Paystack could not complete the transfer.",
                  "transfer.reversed": "Paystack reversed the transfer."}


def signature_ok(raw_body: bytes, signature: str | None) -> bool:
    secret = get_settings().paystack_secret_key
    if not secret or not signature:
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha512).hexdigest()
    return hmac.compare_digest(expected, signature)


@router.post("/paystack")
async def paystack_webhook(request: Request, session: SessionDep) -> dict:
    raw = await request.body()
    if not signature_ok(raw, request.headers.get("x-paystack-signature")):
        raise ApiError(401, "BAD_SIGNATURE", "Invalid signature.")

    try:
        payload = json.loads(raw)
        event = payload.get("event")
        data = payload.get("data") or {}
        withdrawal_id = UUID(str(data.get("reference")))
    except (ValueError, AttributeError, TypeError):
        log.warning("paystack webhook: unreadable payload or reference; ignored")
        return {"ok": True}

    if event == "transfer.success":
        changed = await withdrawals.mark_paid(session, withdrawal_id)
    elif event in FAILURE_EVENTS:
        reason = data.get("reason") or FAILURE_EVENTS[event]
        changed = await withdrawals.fail(session, withdrawal_id, str(reason)[:300])
    else:
        return {"ok": True}

    await session.commit()
    log.info("paystack webhook: %s for withdrawal %s, changed=%s", event, withdrawal_id, changed)
    return {"ok": True}
