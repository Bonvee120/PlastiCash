"""SMS through Termii, behind SMS_ENABLED (docs/specs/05). A failed SMS is logged and never blocks the flow:
the user can still confirm in the app, and the collector can resend. Message text and phone numbers are not logged
in full (codes are in the text); only the last 4 digits of the number."""
import logging

import httpx

from app.config import get_settings

log = logging.getLogger(__name__)


def _masked(phone: str) -> str:
    return f"…{phone[-4:]}"


async def send_sms(phone: str, message: str) -> bool:
    settings = get_settings()
    if not settings.sms_enabled:
        log.info("SMS would send to %s (SMS_ENABLED is false)", _masked(phone))
        return False
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                f"{settings.termii_base_url.rstrip('/')}/api/sms/send",
                json={
                    "to": phone.lstrip("+"),
                    "from": settings.termii_sender_id,
                    "sms": message,
                    "type": "plain",
                    "channel": "generic",
                    "api_key": settings.termii_api_key,
                },
            )
        response.raise_for_status()
        return True
    except httpx.HTTPError as error:
        log.warning("SMS to %s failed: %s", _masked(phone), type(error).__name__)
        return False
