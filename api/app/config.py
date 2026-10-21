from functools import lru_cache
from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

API_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    """Settings from environment variables, then `api/.env`. See `api/.env.example`."""

    model_config = SettingsConfigDict(env_file=API_DIR / ".env", extra="ignore")

    database_url: str = ""
    test_database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5433/plasticash_test"
    # Connections per API process; keep pool + overflow under the Supabase session pooler limit (15 on this plan).
    db_pool_size: int = 5
    db_max_overflow: int = 5

    supabase_url: str = ""
    supabase_jwt_secret: str = ""
    supabase_service_role_key: str = ""

    paystack_secret_key: str = ""
    # Local testing only: an approved withdrawal is PAID at once without calling Paystack (a Starter business
    # can't send transfers, even in test mode). Never set on Render; refused with a live key.
    paystack_fake_transfers: bool = False

    cloudinary_cloud_name: str = ""
    cloudinary_api_key: str = ""
    cloudinary_api_secret: str = ""

    termii_api_key: str = ""
    termii_sender_id: str = ""
    termii_base_url: str = ""

    otp_secret: str = ""
    cron_secret: str = ""
    # Web Push (VAPID) for admin notifications; push is off while the private key is empty.
    vapid_public_key: str = ""
    vapid_private_key: str = ""
    vapid_subject: str = "mailto:ops@plasticash.app"
    # Redis for rate limits and caches; empty = off (the API works without it). Local: redis://127.0.0.1:6379/0
    redis_url: str = ""
    # Behind Render's proxy the caller's IP comes from X-Forwarded-For.
    trust_proxy: bool = False

    frontend_origin: str = "http://localhost:3000"
    min_withdrawal_kobo: int = 500_000
    door_min_kg: int = 50
    auto_confirm_hours: int = 48
    sms_enabled: bool = False

    seed_password: str = ""  # scripts/seed.py only: password for the demo Supabase Auth accounts

    @model_validator(mode="after")
    def _no_fake_transfers_with_live_key(self) -> "Settings":
        if self.paystack_fake_transfers and self.paystack_secret_key.startswith("sk_live_"):
            raise ValueError("PAYSTACK_FAKE_TRANSFERS can't be on with a live Paystack key (sk_live_).")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
