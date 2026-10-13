"""Paystack client (test mode): banks, account resolve, transfer recipient, transfer.

Every call returns Paystack's `data` or raises PaystackError. `PaystackError.not_sent` matters for money:
- True: Paystack refused the request, or it never left this server (connection failed). Safe to refund.
- False: we can't be sure (e.g. a timeout after sending); the transfer may exist. Leave it PROCESSING and let the
  webhook decide. Retrying with the same `reference` is safe: Paystack rejects a duplicate reference.
The secret key is sent only to Paystack and never logged.
"""
import time
from typing import Any

import httpx

from app.config import get_settings
from app.redis_client import cache_get, cache_set

BASE_URL = "https://api.paystack.co"
TIMEOUT = httpx.Timeout(20.0, connect=5.0)
_BANKS_TTL_SECONDS = 24 * 3600
_banks_cache: tuple[float, list[dict]] | None = None


class PaystackError(Exception):
    def __init__(self, message: str, *, not_sent: bool, status_code: int | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.not_sent = not_sent
        self.status_code = status_code


async def _call(method: str, path: str, **kwargs: Any) -> Any:
    headers = {"Authorization": f"Bearer {get_settings().paystack_secret_key}"}
    try:
        async with httpx.AsyncClient(base_url=BASE_URL, headers=headers, timeout=TIMEOUT) as client:
            response = await client.request(method, path, **kwargs)
    except httpx.ConnectError as error:
        raise PaystackError("Couldn't reach Paystack.", not_sent=True) from error
    except httpx.HTTPError as error:
        raise PaystackError("Paystack didn't answer in time.", not_sent=False) from error

    try:
        body = response.json()
    except ValueError:
        body = {}
    if response.status_code >= 500:
        raise PaystackError("Paystack had a problem.", not_sent=False, status_code=response.status_code)
    if response.status_code >= 400 or not body.get("status"):
        # Paystack looked at the request and refused it: nothing was created.
        raise PaystackError(body.get("message") or "Paystack refused the request.", not_sent=True,
                            status_code=response.status_code)
    return body.get("data")


async def list_banks() -> list[dict]:
    """Nigerian banks [{name, code}], cached for a day: in this process, and in Redis so a restart (or the free
    plan waking up) doesn't call Paystack again."""
    global _banks_cache
    if _banks_cache and time.monotonic() - _banks_cache[0] < _BANKS_TTL_SECONDS:
        return _banks_cache[1]
    banks = await cache_get("paystack:banks")
    if banks is None:
        data = await _call("GET", "/bank", params={"country": "nigeria", "currency": "NGN", "perPage": 100})
        banks = [{"name": bank["name"], "code": bank["code"]} for bank in data if bank.get("active", True)]
        await cache_set("paystack:banks", banks, _BANKS_TTL_SECONDS)
    _banks_cache = (time.monotonic(), banks)
    return banks


async def resolve_account(account_number: str, bank_code: str) -> str:
    """The account holder's name for a NUBAN account number."""
    data = await _call("GET", "/bank/resolve", params={"account_number": account_number, "bank_code": bank_code})
    return data["account_name"]


async def create_recipient(name: str, account_number: str, bank_code: str) -> str:
    """A transfer recipient for the account; returns recipient_code (RCP_...)."""
    data = await _call(
        "POST",
        "/transferrecipient",
        json={"type": "nuban", "name": name, "account_number": account_number, "bank_code": bank_code,
              "currency": "NGN"},
    )
    return data["recipient_code"]


async def initiate_transfer(amount_kobo: int, recipient_code: str, reference: str, reason: str) -> dict:
    """Start a payout from the Paystack balance. Returns {transfer_code, status}. The final result comes by webhook."""
    data = await _call(
        "POST",
        "/transfer",
        json={"source": "balance", "amount": amount_kobo, "recipient": recipient_code, "reference": reference,
              "reason": reason},
    )
    return {"transfer_code": data.get("transfer_code"), "status": data.get("status")}
