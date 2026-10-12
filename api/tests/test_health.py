from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlmodel import Session


def test_health(client: TestClient) -> None:
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"ok": True}


def test_database_is_postgres(session: Session) -> None:
    version = session.exec(text("show server_version")).scalar_one()
    assert version.startswith("16")
