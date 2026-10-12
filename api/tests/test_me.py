"""POST /me/profile, GET /me, PATCH /me. Includes required test 20 (greeting)."""
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlmodel.ext.asyncio.session import AsyncSession

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


async def sign_up(client: AsyncClient, body: dict, user_id=None, email: str = "new@example.com"):
    return await client.post("/api/v1/me/profile", json=body, headers=bearer(user_id or uuid4(), email=email))


# ----- POST /me/profile -----


async def test_individual_sign_up(client: AsyncClient) -> None:
    user_id = uuid4()
    response = await sign_up(client, INDIVIDUAL, user_id, email="chinaza@example.com")
    assert response.status_code == 201
    me = response.json()
    assert me["id"] == str(user_id)
    assert me["role"] == "USER"
    assert me["email"] == "chinaza@example.com"
    assert me["full_name"] == "Chinaza Okafor"
    assert me["phone"] == "+2348031234567"
    assert me["display_name"] == "Chinaza"
    assert me["org_name"] is None and me["bank"] is None


async def test_organization_sign_up(client: AsyncClient) -> None:
    response = await sign_up(client, ORGANIZATION)
    assert response.status_code == 201
    me = response.json()
    assert me["account_type"] == "ORGANIZATION"
    assert me["display_name"] == "Green Hills School"
    assert me["phone"] == "+2348097654321"


async def test_individual_org_fields_are_dropped(client: AsyncClient) -> None:
    response = await sign_up(client, {**INDIVIDUAL, "org_name": "Not An Org", "org_type": "company"})
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
async def test_organization_needs_name_and_type(client: AsyncClient, change: dict) -> None:
    response = await sign_up(client, {**ORGANIZATION, **change})
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
async def test_sign_up_validation(client: AsyncClient, change: dict) -> None:
    response = await sign_up(client, {**INDIVIDUAL, **change})
    assert response.status_code == 422


async def test_sign_up_twice_is_409(client: AsyncClient) -> None:
    user_id = uuid4()
    assert (await sign_up(client, INDIVIDUAL, user_id)).status_code == 201
    response = await sign_up(client, {**INDIVIDUAL, "phone": "08039999999"}, user_id)
    assert response.status_code == 409
    assert response.json()["code"] == "PROFILE_EXISTS"


async def test_phone_must_be_unique(client: AsyncClient) -> None:
    assert (await sign_up(client, INDIVIDUAL)).status_code == 201
    response = await sign_up(client, {**INDIVIDUAL, "phone": "+2348031234567"})
    assert response.status_code == 409
    assert response.json()["code"] == "PHONE_TAKEN"


async def test_sign_up_needs_a_token(client: AsyncClient) -> None:
    assert (await client.post("/api/v1/me/profile", json=INDIVIDUAL)).status_code == 401


# ----- GET /me -----


async def test_get_me_without_profile_is_404(client: AsyncClient) -> None:
    response = await client.get("/api/v1/me", headers=bearer(uuid4()))
    assert response.status_code == 404
    assert response.json()["code"] == "PROFILE_NOT_FOUND"


async def test_get_me_masks_bank_and_hides_recipient_code(client: AsyncClient, session: AsyncSession) -> None:
    user = await make_user(session, "Emeka")
    user.bank_name, user.account_number, user.account_name = "Access Bank", "0234567890", "EMEKA NWOSU"
    user.paystack_recipient_code = "RCP_secret"
    session.add(user)
    await session.flush()

    response = await client.get("/api/v1/me", headers=bearer(user.id))
    assert response.status_code == 200
    assert response.json()["bank"] == {
        "bank_name": "Access Bank",
        "account_name": "EMEKA NWOSU",
        "account_number_last4": "7890",
    }
    assert "0234567890" not in response.text
    assert "RCP_secret" not in response.text


async def test_collector_can_read_own_profile(client: AsyncClient, session: AsyncSession) -> None:
    collector = await make_user(session, "Ifeanyi", role=Role.COLLECTOR)
    response = await client.get("/api/v1/me", headers=bearer(collector.id))
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
async def test_20_greeting_display_name(
    client: AsyncClient, session: AsyncSession, account_type, full_name, org_name, expected
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
    await session.flush()
    assert (await client.get("/api/v1/me", headers=bearer(profile.id))).json()["display_name"] == expected


# ----- PATCH /me -----


async def test_update_allowed_fields(client: AsyncClient, session: AsyncSession) -> None:
    user = await make_user(session, "Ngozi")
    response = await client.patch(
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
async def test_update_rejects_protected_fields(client: AsyncClient, session: AsyncSession, body: dict) -> None:
    user = await make_user(session)
    assert (await client.patch("/api/v1/me", json=body, headers=bearer(user.id))).status_code == 422
    await session.refresh(user)
    assert user.role == Role.USER


@pytest.mark.parametrize("field", ["full_name", "phone", "address", "area"])
async def test_update_cannot_blank_required_fields(client: AsyncClient, session: AsyncSession, field: str) -> None:
    user = await make_user(session)
    response = await client.patch("/api/v1/me", json={field: None}, headers=bearer(user.id))
    assert response.status_code == 422


async def test_update_phone_to_one_already_used(client: AsyncClient, session: AsyncSession) -> None:
    other, user = await make_user(session, "Other"), await make_user(session)
    response = await client.patch("/api/v1/me", json={"phone": other.phone}, headers=bearer(user.id))
    assert response.status_code == 409
    assert response.json()["code"] == "PHONE_TAKEN"


async def test_individual_cannot_set_org_fields(client: AsyncClient, session: AsyncSession) -> None:
    user = await make_user(session)
    response = await client.patch("/api/v1/me", json={"org_name": "My Shop"}, headers=bearer(user.id))
    assert response.status_code == 422


async def test_organization_can_rename_but_not_clear(client: AsyncClient) -> None:
    user_id = uuid4()
    await sign_up(client, ORGANIZATION, user_id)
    renamed = await client.patch("/api/v1/me", json={"org_name": "Green Hills College"}, headers=bearer(user_id))
    assert renamed.json()["display_name"] == "Green Hills College"
    cleared = await client.patch("/api/v1/me", json={"org_name": None}, headers=bearer(user_id))
    assert cleared.status_code == 422
