from functools import lru_cache
from pathlib import Path

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

    cloudinary_cloud_name: str = ""
    cloudinary_api_key: str = ""
    cloudinary_api_secret: str = ""

    termii_api_key: str = ""
    termii_sender_id: str = ""
    termii_base_url: str = ""

    otp_secret: str = ""
    cron_secret: str = ""

    frontend_origin: str = "http://localhost:3000"
    min_withdrawal_kobo: int = 100_000
    door_min_kg: int = 50
    auto_confirm_hours: int = 48
    sms_enabled: bool = False

    seed_password: str = ""  # scripts/seed.py only: password for the demo Supabase Auth accounts


@lru_cache
def get_settings() -> Settings:
    return Settings()
