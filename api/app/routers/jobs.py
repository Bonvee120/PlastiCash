"""Scheduled jobs, called by a cron (cron-job.org or GitHub Actions) with the `X-Cron-Secret` header, no user login.
With no CRON_SECRET configured every call is refused, so an unset secret can't open the job to anyone."""
import hmac
from typing import Annotated

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel
from sqlmodel.ext.asyncio.session import AsyncSession

from app.config import get_settings
from app.db import get_session
from app.errors import ApiError
from app.services import reminders

router = APIRouter(prefix="/jobs", tags=["jobs"])


class JobOut(BaseModel):
    checked: int
    reminders: int
    auto_confirmed: int
    failed: list[str]


def require_cron_secret(x_cron_secret: Annotated[str | None, Header()] = None) -> None:
    secret = get_settings().cron_secret
    if not secret or not x_cron_secret or not hmac.compare_digest(secret.encode(), x_cron_secret.encode()):
        raise ApiError(401, "UNAUTHORIZED", "Missing or wrong cron secret.")


@router.post("/reminders", response_model=JobOut, dependencies=[Depends(require_cron_secret)])
async def run_reminders(session: Annotated[AsyncSession, Depends(get_session)]) -> JobOut:
    result = await reminders.run(session)
    return JobOut(checked=result.checked, reminders=result.reminders, auto_confirmed=result.auto_confirmed,
                  failed=result.failed)
