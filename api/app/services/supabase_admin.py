"""Supabase Auth admin calls with the service role key (server side only, never sent to a browser).
Used to create collector logins from the ops portal."""
import logging
from uuid import UUID

import httpx

from app.config import get_settings
from app.errors import ApiError

log = logging.getLogger(__name__)


def _client() -> httpx.AsyncClient:
    settings = get_settings()
    if not (settings.supabase_url and settings.supabase_service_role_key):
        raise ApiError(503, "AUTH_ADMIN_NOT_CONFIGURED", "Creating logins is not set up on the server yet.")
    key = settings.supabase_service_role_key
    return httpx.AsyncClient(
        base_url=f"{settings.supabase_url.rstrip('/')}/auth/v1",
        headers={"apikey": key, "Authorization": f"Bearer {key}"},
        timeout=15,
    )


async def create_user(email: str, password: str) -> UUID:
    """A confirmed email + password login. 409 if the email already has a login."""
    try:
        async with _client() as client:
            response = await client.post(
                "/admin/users", json={"email": email, "password": password, "email_confirm": True}
            )
    except httpx.HTTPError as error:
        log.warning("Supabase create user failed: %s", type(error).__name__)
        raise ApiError(502, "AUTH_UNAVAILABLE", "Couldn't reach the login service. Try again.") from error
    if response.status_code in (409, 422) and "already" in response.text.lower():
        raise ApiError(409, "EMAIL_TAKEN", "This email already has a PlastiCash login.")
    if response.status_code == 422:
        raise ApiError(422, "VALIDATION_ERROR", "The login service refused this email or password.")
    if not response.is_success:
        log.warning("Supabase create user returned %s", response.status_code)
        raise ApiError(502, "AUTH_UNAVAILABLE", "The login service didn't create the account. Try again.")
    return UUID(response.json()["id"])


async def delete_user(user_id: UUID) -> None:
    """Undo a login whose profile couldn't be saved. Failures are logged, not raised."""
    try:
        async with _client() as client:
            response = await client.delete(f"/admin/users/{user_id}")
        if not response.is_success:
            log.warning("Supabase delete user returned %s", response.status_code)
    except httpx.HTTPError as error:
        log.warning("Supabase delete user failed: %s", type(error).__name__)
