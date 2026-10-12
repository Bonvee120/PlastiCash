"""Required test 16: a USER calling /admin/* gets 403.

The admin routes are read from the app's OpenAPI schema, so every admin endpoint added later is covered automatically.
"""
import re
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlmodel.ext.asyncio.session import AsyncSession

from app.main import app
from app.models import Material, Price, Role
from tests.factories import make_user
from tests.tokens import bearer

pytestmark = pytest.mark.usefixtures("fake_supabase_auth")

# From the OpenAPI schema: FastAPI 0.143 keeps included routers wrapped, so app.routes doesn't list them flat.
ADMIN_ROUTES = sorted(
    (method.upper(), path)
    for path, operations in app.openapi()["paths"].items()
    if path.startswith("/api/v1/admin")
    for method in operations
)


def concrete(path: str) -> str:
    """Fill path parameters such as {id} with a random UUID."""
    return re.sub(r"\{[^}]+\}", str(uuid4()), path)


def test_there_are_admin_routes_to_check() -> None:
    assert ADMIN_ROUTES, "no /admin routes found; test 16 would pass vacuously"


@pytest.mark.parametrize("role", [Role.USER, Role.COLLECTOR])
@pytest.mark.parametrize("method, path", ADMIN_ROUTES)
async def test_16_non_admin_gets_403_on_every_admin_route(
    client: AsyncClient, session: AsyncSession, role: Role, method: str, path: str
) -> None:
    user = await make_user(session, role.value.title(), role=role)
    response = await client.request(method, concrete(path), headers=bearer(user.id), json={})
    assert response.status_code == 403
    assert response.json()["code"] == "FORBIDDEN"


@pytest.mark.parametrize("method, path", ADMIN_ROUTES)
async def test_admin_routes_need_a_login(client: AsyncClient, method: str, path: str) -> None:
    response = await client.request(method, concrete(path), json={})
    assert response.status_code == 401


async def test_admin_reads_price_history(client: AsyncClient, session: AsyncSession) -> None:
    admin = await make_user(session, "Admin", role=Role.ADMIN)
    session.add(Price(material=Material.PET, price_kobo_per_kg=18_500, kg_per_full_sack=10, set_by=admin.id))
    await session.flush()

    response = await client.get("/api/v1/admin/prices", params={"material": "PET"}, headers=bearer(admin.id))
    assert response.status_code == 200
    rows = response.json()
    assert len(rows) == 1
    assert rows[0]["price_kobo_per_kg"] == 18_500
    assert rows[0]["points_per_kg"] == "185"
