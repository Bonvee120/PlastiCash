from httpx import AsyncClient
from sqlalchemy import text
from sqlmodel.ext.asyncio.session import AsyncSession


async def test_health(client: AsyncClient) -> None:
    response = await client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"ok": True}


async def test_database_is_postgres(session: AsyncSession) -> None:
    version = (await session.exec(text("show server_version"))).scalar_one()
    assert version.startswith("16")
