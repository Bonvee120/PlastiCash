"""Supabase-style access tokens for tests, signed with our own ES256 key.
Use the `fake_supabase_auth` fixture (conftest.py) so app.auth trusts this key."""
from datetime import datetime, timedelta, timezone
from uuid import UUID

import jwt
from cryptography.hazmat.primitives.asymmetric import ec

SUPABASE_URL = "https://testproject.supabase.co"
ISSUER = f"{SUPABASE_URL}/auth/v1"
SIGNING_KEY = ec.generate_private_key(ec.SECP256R1())


def token(
    sub: UUID | str,
    *,
    key=SIGNING_KEY,
    algorithm: str = "ES256",
    minutes: int = 60,
    email: str = "someone@example.com",
    **claims,
) -> str:
    payload = {
        "sub": str(sub),
        "aud": "authenticated",
        "iss": ISSUER,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=minutes),
        "email": email,
        **claims,
    }
    return jwt.encode(payload, key, algorithm=algorithm, headers={"kid": "test-key"})


def bearer(sub: UUID | str, **kwargs) -> dict[str, str]:
    return {"Authorization": f"Bearer {token(sub, **kwargs)}"}
