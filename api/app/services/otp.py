"""Weight-confirmation codes (docs/specs/04 "OTP", TRD §5.5).

6 digits from `secrets`, stored only as HMAC-SHA256(OTP_SECRET, "<pickup id>:<code>"), valid 30 minutes,
5 wrong attempts lock it (the user can still confirm in the app), 3 resends per pickup. Codes are never logged
and never returned by the API; they only go out by SMS.
"""
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

from app.config import get_settings
from app.errors import ApiError
from app.models import Pickup

VALID_FOR = timedelta(minutes=30)
MAX_ATTEMPTS = 5
MAX_RESENDS = 3


def _hash(pickup: Pickup, code: str) -> str:
    secret = get_settings().otp_secret
    if not secret:
        raise ApiError(503, "OTP_NOT_CONFIGURED", "Confirmation codes are not set up on the server.")
    return hmac.new(secret.encode(), f"{pickup.id}:{code}".encode(), hashlib.sha256).hexdigest()


def issue(pickup: Pickup) -> str:
    """Store a new code's hash on the pickup (resetting attempts) and return the code for the SMS only."""
    code = f"{secrets.randbelow(1_000_000):06d}"
    pickup.otp_hash = _hash(pickup, code)
    pickup.otp_expires_at = datetime.now(timezone.utc) + VALID_FOR
    pickup.otp_attempts = 0
    return code


def check(pickup: Pickup, code: str) -> None:
    """Raise unless `code` is right. A wrong code counts an attempt (the caller must save the pickup)."""
    if not pickup.otp_hash:
        raise ApiError(409, "OTP_NOT_ISSUED", "There's no code for this pickup.")
    if pickup.otp_attempts >= MAX_ATTEMPTS:
        raise ApiError(423, "OTP_LOCKED", "Too many wrong codes. Ask the customer to confirm in the app, or resend.")
    if pickup.otp_expires_at is None or pickup.otp_expires_at < datetime.now(timezone.utc):
        raise ApiError(410, "OTP_EXPIRED", "This code has expired. Send a new one.")
    if not hmac.compare_digest(pickup.otp_hash, _hash(pickup, code.strip())):
        pickup.otp_attempts += 1
        left = MAX_ATTEMPTS - pickup.otp_attempts
        raise ApiError(422, "OTP_WRONG", f"That code is wrong. {left} tries left." if left else
                       "That code is wrong. The code is now locked.", {"attempts_left": left})


def clear(pickup: Pickup) -> None:
    pickup.otp_hash = None
    pickup.otp_expires_at = None
