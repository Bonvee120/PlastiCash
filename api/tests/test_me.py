"""POST /me/profile, GET /me, PATCH /me. Includes required test 20 (greeting)."""
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.models import AccountType, Profile, Role
from tests.factories import make_user
from tests.tokens import bearer

pytestmark = pytest.mark.usefixtures("fake_supabase_auth")

INDIVIDUAL = {
    "account_type": "INDIVIDUAL",
    "full_name": "  Chinaza   Okafor ",
    "phone": "0803 123 4567",
    "address": "12 Zik Avenue",
    "area": "Uwani",
}
ORGANIZATION = {
    "account_type": "ORGANIZATION",
    "full_name": "Mrs Adaeze Udeh",
    "phone": "+234 809 765 4321",
    "address": "Green Hills School, Ogui Road",
    "area": "GRA",
    "org_name": "Green Hills School",
    "org_type": "school",
}


def sign_up(client: TestClient, body: dict, user_id=None, email: str = "new@example.com"):
    return client.post("/api/v1/me/profile", json=body, headers=bearer(user_id or uuid4(), email=email))


# ----- POST /me/profile -----


def test_individual_sign_up(client: TestClient) -> None:
    user_id = uuid4()
    response = sign_up(client, INDIVIDUAL, user_id, email="chinaza@example.com")
    assert response.status_code == 201
    me = response.json()
    assert me["id"] == str(user_id)
    assert me["role"] == "USER"
    assert me["email"] == "chinaza@example.com"
    assert me["full_name"] == "Chinaza Okafor"
    assert me["phone"] == "+2348031234567"
    assert me["display_name"] == "Chinaza"
    assert me["org_name"] is None and me["bank"] is None


def test_organization_sign_up(client: TestClient) -> None:
    response = sign_up(client, ORGANIZATION)
    assert response.status_code == 201
    me = response.json()
    assert me["account_type"] == "ORGANIZATION"
    assert me["display_name"] == "Green Hills School"
    assert me["phone"] == "+2348097654321"


def test_individual_org_fields_are_dropped(client: TestClient) -> None:
    response = sign_up(client, {**INDIVIDUAL, "org_name": "Not An Org", "org_type": "company"})
    assert response.status_code == 201
    assert response.json()["org_name"] is None


@pytest.mark.parametrize(
    "change",
    [
        {"org_name": None},
        {"org_type": None},
        {"org_type": "bank"},
    ],
    ids=["no org name", "no org type", "unknown org type"],
)
def test_organization_needs_name_and_type(client: TestClient, change: dict) -> None:
    response = sign_up(client, {**ORGANIZATION, **change})
    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_ERROR"


@pytest.mark.parametrize(
    "change",
    [
        {"phone": "12345"},
        {"phone": "0603 123 4567"},
        {"area": "Lagos Island"},
        {"full_name": "   "},
        {"address": ""},
        {"role": "ADMIN"},
        {"verified_picker": True},
    ],
    ids=["short phone", "not a mobile", "unknown area", "blank name", "blank address", "role", "verified flag"],
)
def test_sign_up_validation(client: TestClient, change: dict) -> None:
    response = sign_up(client, {**INDIVIDUAL, **change})
    assert response.status_code == 422


def test_sign_up_twice_is_409(client: TestClient) -> None:
    user_id = uuid4()
    assert sign_up(client, INDIVIDUAL, user_id).status_code == 201
    response = sign_up(client, {**INDIVIDUAL, "phone": "08039999999"}, user_id)
    assert response.status_code == 409
    assert response.json()["code"] == "PROFILE_EXISTS"


def test_phone_must_be_unique(client: TestClient) -> None:
    assert sign_up(client, INDIVIDUAL).status_code == 201
    response = sign_up(client, {**INDIVIDUAL, "phone": "+2348031234567"})
    assert response.status_code == 409
    assert response.json()["code"] == "PHONE_TAKEN"


def test_sign_up_needs_a_token(client: TestClient) -> None:
    assert client.post("/api/v1/me/profile", json=INDIVIDUAL).status_code == 401


# ----- GET /me -----


def test_get_me_without_profile_is_404(client: TestClient) -> None:
    response = client.get("/api/v1/me", headers=bearer(uuid4()))
    assert response.status_code == 404
    assert response.json()["code"] == "PROFILE_NOT_FOUND"


def test_get_me_masks_bank_and_hides_recipient_code(client: TestClient, session: Session) -> None:
    user = make_user(session, "Emeka")
    user.bank_name, user.account_number, user.account_name = "Access Bank", "0234567890", "EMEKA NWOSU"
    user.paystack_recipient_code = "RCP_secret"
    session.add(user)
    session.flush()

    response = client.get("/api/v1/me", headers=bearer(user.id))
    assert response.status_code == 200
    assert response.json()["bank"] == {
        "bank_name": "Access Bank",
        "account_name": "EMEKA NWOSU",
        "account_number_last4": "7890",
    }
    assert "0234567890" not in response.text
    assert "RCP_secret" not in response.text


def test_collector_can_read_own_profile(client: TestClient, session: Session) -> None:
    collector = make_user(session, "Ifeanyi", role=Role.COLLECTOR)
    response = client.get("/api/v1/me", headers=bearer(collector.id))
    assert response.status_code == 200
    assert response.json()["role"] == "COLLECTOR"


@pytest.mark.parametrize(
    "account_type, full_name, org_name, expected",
    [
        (AccountType.INDIVIDUAL, "Chinaza Okafor", None, "Chinaza"),
        (AccountType.INDIVIDUAL, "Emeka", None, "Emeka"),
        (AccountType.ORGANIZATION, "Mrs Adaeze Udeh", "Green Hills School", "Green Hills School"),
    ],
)
def test_20_greeting_display_name(
    client: TestClient, session: Session, account_type, full_name, org_name, expected
) -> None:
    profile = Profile(
        id=uuid4(),
        account_type=account_type,
        full_name=full_name,
        org_name=org_name,
        org_type="school" if org_name else None,
        phone=f"+2348{uuid4().int % 10**9:09d}",
        email="g@example.com",
    )
    session.add(profile)
    session.flush()
    assert client.get("/api/v1/me", headers=bearer(profile.id)).json()["display_name"] == expected


# ----- PATCH /me -----


def test_update_allowed_fields(client: TestClient, session: Session) -> None:
    user = make_user(session, "Ngozi")
    response = client.patch(
        "/api/v1/me",
        json={"address": "4 Chime Avenue", "area": "New Haven", "phone": "0705 555 0101"},
        headers=bearer(user.id),
    )
    assert response.status_code == 200
    me = response.json()
    assert (me["address"], me["area"], me["phone"]) == ("4 Chime Avenue", "New Haven", "+2347055550101")


@pytest.mark.parametrize(
    "body",
    [
        {"role": "ADMIN"},
        {"account_type": "ORGANIZATION"},
        {"email": "other@example.com"},
        {"is_active": True},
        {"account_number": "0000000000"},
    ],
    ids=["role", "account type", "email", "is_active", "bank"],
)
def test_update_rejects_protected_fields(client: TestClient, session: Session, body: dict) -> None:
    user = make_user(session)
    assert client.patch("/api/v1/me", json=body, headers=bearer(user.id)).status_code == 422
    session.refresh(user)
    assert user.role == Role.USER


@pytest.mark.parametrize("field", ["full_name", "phone", "address", "area"])
def test_update_cannot_blank_required_fields(client: TestClient, session: Session, field: str) -> None:
    user = make_user(session)
    response = client.patch("/api/v1/me", json={field: None}, headers=bearer(user.id))
    assert response.status_code == 422


def test_update_phone_to_one_already_used(client: TestClient, session: Session) -> None:
    other, user = make_user(session, "Other"), make_user(session)
    response = client.patch("/api/v1/me", json={"phone": other.phone}, headers=bearer(user.id))
    assert response.status_code == 409
    assert response.json()["code"] == "PHONE_TAKEN"


def test_individual_cannot_set_org_fields(client: TestClient, session: Session) -> None:
    user = make_user(session)
    response = client.patch("/api/v1/me", json={"org_name": "My Shop"}, headers=bearer(user.id))
    assert response.status_code == 422


def test_organization_can_rename_but_not_clear(client: TestClient) -> None:
    user_id = uuid4()
    sign_up(client, ORGANIZATION, user_id)
    renamed = client.patch("/api/v1/me", json={"org_name": "Green Hills College"}, headers=bearer(user_id))
    assert renamed.json()["display_name"] == "Green Hills College"
    cleared = client.patch("/api/v1/me", json={"org_name": None}, headers=bearer(user_id))
    assert cleared.status_code == 422
