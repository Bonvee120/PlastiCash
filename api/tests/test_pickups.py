"""Step 5, end to end through the API. Required tests 7, 8, 12, 13, 14, 15, 18 (docs/specs/04)."""
import hashlib
import re
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models import Material, Pickup, Role
from app.services import ledger
from app.services.pickups import lagos_today
from tests.factories import make_price, make_user
from tests.tokens import bearer

pytestmark = pytest.mark.usefixtures("fake_supabase_auth", "app_settings")

PHOTO = "https://res.cloudinary.com/testcloud/image/upload/v1/plasticash/requests/pile.jpg"
API = "/api/v1"


@pytest_asyncio.fixture
async def world(session: AsyncSession):
    """Prices (PET ₦185, 10 kg/sack, 40 bottles/kg; CAN ₦400, 65 cans/kg; SACHET ₦50) and four people."""
    await make_price(session, Material.PET, 185, items_per_kg=40)
    await make_price(session, Material.CAN, 400, kg_per_full_sack="6", items_per_kg=65)
    await make_price(session, Material.SACHET, 50, kg_per_full_sack="8")
    return {
        "user": await make_user(session, "Chinaza"),
        "other": await make_user(session, "Ngozi"),
        "collector": await make_user(session, "Ifeanyi", role=Role.COLLECTOR),
        "collector2": await make_user(session, "Amaka", role=Role.COLLECTOR),
        "admin": await make_user(session, "Admin", role=Role.ADMIN),
    }


def request_body(**changes) -> dict:
    body = {
        "items": [{"material": "PET", "sacks": "6"}],
        "request_photo_url": PHOTO,
        "lat": "6.4584",
        "lng": "7.5464",
        "address": "12 Zik Avenue",
        "area": "Uwani",
        "preferred_date": lagos_today().isoformat(),
        "preferred_window": "MORNING",
    }
    return {**body, **changes}


async def call(client: AsyncClient, method: str, path: str, who=None, **kwargs):
    headers = bearer(who.id) if who is not None else {}
    return await client.request(method, f"{API}{path}", headers=headers, **kwargs)


async def requested(client, w) -> dict:
    response = await call(client, "POST", "/pickups", w["user"], json=request_body())
    assert response.status_code == 201, response.text
    return response.json()


async def en_route(client, w) -> dict:
    pickup = await requested(client, w)
    await call(client, "POST", f"/admin/pickups/{pickup['id']}/assign", w["admin"],
               json={"collector_id": str(w["collector"].id), "scheduled_date": lagos_today().isoformat()})
    await call(client, "POST", f"/collector/pickups/{pickup['id']}/start", w["collector"])
    return (await call(client, "GET", f"/pickups/{pickup['id']}", w["user"])).json()


async def scanned(client, w) -> dict:
    pickup = await en_route(client, w)
    response = await call(client, "POST", f"/collector/pickups/{pickup['id']}/scan", w["collector"],
                          json={"qr_token": pickup["qr_token"]})
    assert response.status_code == 200
    return pickup


WEIGH = {"photo_url": PHOTO, "items": [{"material": "PET", "gross_kg": "40.00", "deduction_kg": "1.00",
                                         "deduction_reason": "Wet bottles"},
                                        {"material": "CAN", "gross_kg": "5.50"}]}


async def weighed(client, w, sms) -> tuple[dict, str]:
    pickup = await scanned(client, w)
    response = await call(client, "POST", f"/collector/pickups/{pickup['id']}/weigh", w["collector"], json=WEIGH)
    assert response.status_code == 200, response.text
    code = re.search(r"code is (\d{6})", sms[-1][1]).group(1)
    return response.json()["pickup"], code


# ----- 5.1 prices and estimate -----


async def test_current_prices_are_public(client: AsyncClient, world, session: AsyncSession) -> None:
    await make_price(session, Material.PET, 190)  # a newer PET version
    prices = {p["material"]: p for p in (await call(client, "GET", "/prices/current")).json()}
    assert prices["PET"]["price_kobo_per_kg"] == 19_000 and prices["PET"]["points_per_kg"] == "190"
    assert set(prices) == {"PET", "CAN", "SACHET"}


@pytest.mark.parametrize(
    "items, total_kg, points, meets",
    [
        ([{"material": "PET", "sacks": "3"}], "30.00", "5550", False),
        ([{"material": "PET", "sacks": "4"}, {"material": "CAN", "sacks": "2"}], "52.00", "12200", True),
        ([{"material": "PET", "sacks": "5"}], "50.00", "9250", True),
        ([{"material": "CAN", "item_count": 130}], "2.00", "800", False),
        ([{"material": "PET", "item_count": 2000}], "50.00", "9250", True),
    ],
    ids=["3 sacks PET", "PET + cans over 50", "exactly 50 kg", "130 cans", "2,000 bottles"],
)
async def test_18_estimate(client: AsyncClient, world, items, total_kg, points, meets) -> None:
    estimate = (await call(client, "POST", "/estimate", json={"items": items})).json()
    assert (estimate["total_kg"], estimate["points"], estimate["meets_door_minimum"]) == (total_kg, points, meets)
    assert Decimal(estimate["kg_to_minimum"]) == max(Decimal(50) - Decimal(total_kg), Decimal(0))


async def test_estimate_by_count_needs_items_per_kg(client: AsyncClient, world) -> None:
    response = await call(client, "POST", "/estimate", json={"items": [{"material": "SACHET", "item_count": 500}]})
    assert response.status_code == 422


# ----- 5.2 requests -----


async def test_upload_signature(client: AsyncClient, world, app_settings) -> None:
    signed = (await call(client, "POST", "/uploads/signature", world["user"], json={"purpose": "request"})).json()
    to_sign = (f"allowed_formats={signed['allowed_formats']}&folder={signed['folder']}&timestamp={signed['timestamp']}"
               f"{app_settings.cloudinary_api_secret}")
    assert signed["signature"] == hashlib.sha1(to_sign.encode()).hexdigest()
    assert signed["folder"] == "plasticash/requests" and "api_secret" not in signed
    assert "svg" not in signed["allowed_formats"] and "pdf" not in signed["allowed_formats"]
    assert app_settings.cloudinary_api_secret not in str(signed)


async def test_door_request(client: AsyncClient, world) -> None:
    pickup = await requested(client, world)
    assert (pickup["status"], pickup["pooled"], pickup["estimated_kg"]) == ("REQUESTED", False, "60.00")
    assert "PET: 6 sacks" in pickup["estimate_note"]
    assert pickup["qr_token"] is None  # only once a collector is assigned


async def test_below_50_kg_is_refused_unless_pooled(client: AsyncClient, world) -> None:
    small = request_body(items=[{"material": "PET", "sacks": "2"}])
    refused = await call(client, "POST", "/pickups", world["user"], json=small)
    assert refused.status_code == 400
    assert refused.json()["code"] == "BELOW_MINIMUM"
    assert refused.json()["details"]["suggestion"] == "HUB_OR_AREA_DAY"
    pooled = await call(client, "POST", "/pickups", world["user"], json={**small, "pool": True})
    assert pooled.status_code == 201
    assert (pooled.json()["status"], pooled.json()["pooled"]) == ("REQUESTED", True)


@pytest.mark.parametrize(
    "change",
    [
        {"request_photo_url": "https://evil.example.com/x.jpg"},
        {"request_photo_url": "https://res.cloudinary.com/othercloud/image/upload/x.jpg"},
        {"preferred_date": (lagos_today() - timedelta(days=1)).isoformat()},
        {"area": "Lekki"},
        {"preferred_window": "NIGHT"},
        {"items": []},
    ],
    ids=["foreign photo", "other cloudinary account", "past date", "unknown area", "bad window", "no items"],
)
async def test_request_validation(client: AsyncClient, world, change) -> None:
    assert (await call(client, "POST", "/pickups", world["user"], json=request_body(**change))).status_code == 422


async def test_list_detail_and_cancel(client: AsyncClient, world) -> None:
    pickup = await requested(client, world)
    mine = (await call(client, "GET", "/pickups", world["user"])).json()
    assert [p["id"] for p in mine] == [pickup["id"]]
    cancelled = await call(client, "POST", f"/pickups/{pickup['id']}/cancel", world["user"], json={"reason": "Sold it"})
    assert (cancelled.json()["status"], cancelled.json()["cancelled_reason"]) == ("CANCELLED", "Sold it")
    again = await call(client, "POST", f"/pickups/{pickup['id']}/cancel", world["user"], json={})
    assert again.status_code == 409


async def test_14_users_cannot_see_or_touch_other_peoples_pickups(client: AsyncClient, world, sms) -> None:
    pickup, _ = await weighed(client, world, sms)
    other = world["other"]
    for method, path, body in [
        ("GET", f"/pickups/{pickup['id']}", None),
        ("POST", f"/pickups/{pickup['id']}/confirm", None),
        ("POST", f"/pickups/{pickup['id']}/dispute", {"photo_url": PHOTO, "claimed_kg": "50", "reason": "Too low"}),
        ("POST", f"/pickups/{pickup['id']}/cancel", {}),
    ]:
        response = await call(client, method, path, other, json=body)
        assert response.status_code == 404, (path, response.text)
    assert (await call(client, "GET", "/pickups", other)).json() == []


# ----- 5.3 assign and travel -----


async def test_assign_start_and_share_location(client: AsyncClient, world) -> None:
    pickup = await requested(client, world)
    assigned = await call(client, "POST", f"/admin/pickups/{pickup['id']}/assign", world["admin"],
                          json={"collector_id": str(world["collector"].id), "scheduled_date": lagos_today().isoformat()})
    assert assigned.json()["status"] == "ASSIGNED"
    day = (await call(client, "GET", "/collector/pickups", world["collector"])).json()
    assert [p["id"] for p in day] == [pickup["id"]]
    assert day[0]["customer_name"] == "Chinaza" and "qr_token" not in day[0]

    seen = (await call(client, "GET", f"/pickups/{pickup['id']}", world["user"])).json()
    assert seen["collector_first_name"] == "Ifeanyi" and seen["qr_token"] and seen["collector_position"] is None

    started = await call(client, "POST", f"/collector/pickups/{pickup['id']}/start", world["collector"])
    assert started.json()["status"] == "EN_ROUTE"
    located = await call(client, "POST", f"/collector/pickups/{pickup['id']}/location", world["collector"],
                         json={"lat": "6.4521", "lng": "7.5105"})
    assert located.status_code == 204
    seen = (await call(client, "GET", f"/pickups/{pickup['id']}", world["user"])).json()
    assert seen["collector_position"]["lat"] == "6.452100"
    assert "phone" not in str(seen).lower()


async def test_assign_needs_a_collector(client: AsyncClient, world) -> None:
    pickup = await requested(client, world)
    response = await call(client, "POST", f"/admin/pickups/{pickup['id']}/assign", world["admin"],
                          json={"collector_id": str(world["other"].id), "scheduled_date": lagos_today().isoformat()})
    assert response.status_code == 422


async def test_location_only_while_en_route(client: AsyncClient, world) -> None:
    pickup = await requested(client, world)
    await call(client, "POST", f"/admin/pickups/{pickup['id']}/assign", world["admin"],
               json={"collector_id": str(world["collector"].id), "scheduled_date": lagos_today().isoformat()})
    response = await call(client, "POST", f"/collector/pickups/{pickup['id']}/location", world["collector"],
                          json={"lat": "6.45", "lng": "7.51"})
    assert response.status_code == 409


async def test_15_collectors_cannot_act_on_pickups_not_assigned_to_them(client: AsyncClient, world, sms) -> None:
    pickup = await en_route(client, world)
    stranger = world["collector2"]
    for path, body in [
        ("/start", None),
        ("/location", {"lat": "6.45", "lng": "7.51"}),
        ("/scan", {"qr_token": pickup["qr_token"]}),
        ("/weigh", WEIGH),
        ("/otp", {"code": "123456"}),
        ("/resend-otp", None),
        ("", None),
    ]:
        method = "GET" if path == "" else "POST"
        response = await call(client, method, f"/collector/pickups/{pickup['id']}{path}", stranger, json=body)
        assert response.status_code == 404, (path, response.text)
    assert (await call(client, "GET", "/collector/pickups", stranger)).json() == []
    assert sms == []


# ----- 5.4 scan and weigh -----


async def test_scan_needs_the_right_code(client: AsyncClient, world) -> None:
    pickup = await en_route(client, world)
    wrong = await call(client, "POST", f"/collector/pickups/{pickup['id']}/scan", world["collector"],
                       json={"qr_token": "0" * 32})
    assert wrong.json()["code"] == "QR_MISMATCH"
    right = await call(client, "POST", f"/collector/pickups/{pickup['id']}/scan", world["collector"],
                       json={"qr_token": pickup["qr_token"]})
    assert right.json()["qr_scanned"] is True


async def test_7_illegal_moves_are_409(client: AsyncClient, world, sms) -> None:
    pickup = await en_route(client, world)
    weigh_unscanned = await call(client, "POST", f"/collector/pickups/{pickup['id']}/weigh", world["collector"], json=WEIGH)
    assert (weigh_unscanned.status_code, weigh_unscanned.json()["code"]) == (409, "ILLEGAL_TRANSITION")
    assert "QR" in weigh_unscanned.json()["message"]

    other = await requested(client, world)
    await call(client, "POST", f"/pickups/{other['id']}/cancel", world["user"], json={})
    confirm_cancelled = await call(client, "POST", f"/pickups/{other['id']}/confirm", world["user"])
    assert (confirm_cancelled.status_code, confirm_cancelled.json()["code"]) == (409, "ILLEGAL_TRANSITION")
    start_cancelled = await call(client, "POST", f"/admin/pickups/{other['id']}/assign", world["admin"],
                                 json={"collector_id": str(world["collector"].id), "scheduled_date": lagos_today().isoformat()})
    assert start_cancelled.status_code == 409


async def test_12_deduction_greater_than_gross_is_rejected(client: AsyncClient, world, sms) -> None:
    pickup = await scanned(client, world)
    body = {"photo_url": PHOTO, "items": [{"material": "PET", "gross_kg": "10", "deduction_kg": "12",
                                            "deduction_reason": "wet"}]}
    response = await call(client, "POST", f"/collector/pickups/{pickup['id']}/weigh", world["collector"], json=body)
    assert (response.status_code, response.json()["code"]) == (422, "DEDUCTION_TOO_LARGE")
    still = (await call(client, "GET", f"/pickups/{pickup['id']}", world["user"])).json()
    assert still["status"] == "EN_ROUTE" and still["items"] == []
    assert sms == []


async def test_weigh(client: AsyncClient, world, sms, session: AsyncSession) -> None:
    pickup, code = await weighed(client, world, sms)
    assert pickup["status"] == "AWAITING_CONFIRMATION"
    pet, can = sorted(pickup["items"], key=lambda i: i["material"])[::-1]  # PET, CAN
    assert (pet["net_kg"], pet["amount_kobo"], pet["price_kobo_per_kg"]) == ("39.00", 721_500, 18_500)
    assert (can["net_kg"], can["amount_kobo"]) == ("5.50", 220_000)
    assert pickup["total_net_kg"] == "44.50" and pickup["points"] == "9415" and pickup["under_minimum"] is True
    phone, text = sms[-1]
    assert phone == world["user"].phone and "44.50 kg" in text and "9,415 pts" in text

    seen = (await call(client, "GET", f"/pickups/{pickup['id']}", world["user"])).json()
    assert seen["collector_position"] is None and seen["qr_token"] is None and seen["auto_confirm_at"]
    stored = await session.get(Pickup, pickup["id"])
    assert stored.collector_lat is None and stored.otp_hash and code not in stored.otp_hash


# ----- 5.5 OTP -----


async def test_right_code_confirms_and_pays(client: AsyncClient, world, sms, session: AsyncSession) -> None:
    pickup, code = await weighed(client, world, sms)
    done = await call(client, "POST", f"/collector/pickups/{pickup['id']}/otp", world["collector"], json={"code": code})
    assert done.json()["status"] == "COMPLETED" and done.json()["confirmed_via"] == "OTP"
    assert await ledger.balance_kobo(session, world["user"].id) == 941_500
    again = await call(client, "POST", f"/pickups/{pickup['id']}/confirm", world["user"])
    assert again.status_code == 409
    assert await ledger.balance_kobo(session, world["user"].id) == 941_500


async def test_13_five_wrong_codes_lock_it(client: AsyncClient, world, sms, session: AsyncSession) -> None:
    pickup, code = await weighed(client, world, sms)
    wrong = "000000" if code != "000000" else "111111"
    for attempt in range(1, 6):
        response = await call(client, "POST", f"/collector/pickups/{pickup['id']}/otp", world["collector"],
                              json={"code": wrong})
        assert (response.status_code, response.json()["details"]["attempts_left"]) == (422, 5 - attempt)
    locked = await call(client, "POST", f"/collector/pickups/{pickup['id']}/otp", world["collector"], json={"code": code})
    assert (locked.status_code, locked.json()["code"]) == (423, "OTP_LOCKED")
    assert (await call(client, "GET", f"/collector/pickups/{pickup['id']}", world["collector"])).json()["otp_locked"]
    # The customer can still confirm in the app
    app_confirm = await call(client, "POST", f"/pickups/{pickup['id']}/confirm", world["user"])
    assert app_confirm.json()["status"] == "COMPLETED"


async def test_resend_gives_a_new_code_three_times(client: AsyncClient, world, sms) -> None:
    pickup, first = await weighed(client, world, sms)
    codes = [first]
    for _ in range(3):
        response = await call(client, "POST", f"/collector/pickups/{pickup['id']}/resend-otp", world["collector"])
        assert response.status_code == 200
        codes.append(re.search(r"code is (\d{6})", sms[-1][1]).group(1))
    fourth = await call(client, "POST", f"/collector/pickups/{pickup['id']}/resend-otp", world["collector"])
    assert (fourth.status_code, fourth.json()["code"]) == (429, "TOO_MANY_RESENDS")
    if codes[0] != codes[-1]:
        old = await call(client, "POST", f"/collector/pickups/{pickup['id']}/otp", world["collector"], json={"code": codes[0]})
        assert old.status_code == 422
    latest = await call(client, "POST", f"/collector/pickups/{pickup['id']}/otp", world["collector"], json={"code": codes[-1]})
    assert latest.json()["status"] == "COMPLETED"


async def test_expired_code(client: AsyncClient, world, sms, session: AsyncSession) -> None:
    pickup, code = await weighed(client, world, sms)
    stored = await session.get(Pickup, pickup["id"])
    stored.otp_expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    session.add(stored)
    await session.flush()
    response = await call(client, "POST", f"/collector/pickups/{pickup['id']}/otp", world["collector"], json={"code": code})
    assert (response.status_code, response.json()["code"]) == (410, "OTP_EXPIRED")


# ----- 5.6 confirm, dispute, resolve -----


async def test_user_confirms_in_the_app(client: AsyncClient, world, sms, session: AsyncSession) -> None:
    pickup, _ = await weighed(client, world, sms)
    done = await call(client, "POST", f"/pickups/{pickup['id']}/confirm", world["user"])
    assert (done.json()["status"], done.json()["confirmed_via"]) == ("COMPLETED", "APP")
    assert await ledger.balance_kobo(session, world["user"].id) == 941_500


async def test_8_dispute_then_resolve_credits_once_at_resolved_weight(
    client: AsyncClient, world, sms, session: AsyncSession
) -> None:
    pickup, _ = await weighed(client, world, sms)
    disputed = await call(client, "POST", f"/pickups/{pickup['id']}/dispute", world["user"],
                          json={"photo_url": PHOTO, "claimed_kg": "48.00", "reason": "I weighed more at home"})
    assert disputed.json()["status"] == "DISPUTED"
    assert await ledger.balance_kobo(session, world["user"].id) == 0

    queue = (await call(client, "GET", "/admin/disputes", world["admin"])).json()
    assert [p["id"] for p in queue] == [pickup["id"]]
    assert queue[0]["dispute_photo_url"] == PHOTO and queue[0]["weigh_photo_url"] == PHOTO

    await make_price(session, Material.PET, 300)  # price rises before the review: must not apply
    resolved = await call(client, "POST", f"/admin/pickups/{pickup['id']}/resolve", world["admin"],
                          json={"items": [{"material": "PET", "net_kg": "42.00"}, {"material": "CAN", "net_kg": "5.50"}],
                                "note": "Second weighing at the hub"})
    assert resolved.status_code == 200, resolved.text
    body = resolved.json()
    assert (body["status"], body["confirmed_via"], body["resolved_kg"]) == ("COMPLETED", "ADMIN", "47.50")
    # 42.00 kg x ₦185 (the original snapshot, not ₦300) + 5.50 kg x ₦400
    assert body["total_amount_kobo"] == 42 * 18_500 + 220_000
    assert await ledger.balance_kobo(session, world["user"].id) == 997_000

    again = await call(client, "POST", f"/admin/pickups/{pickup['id']}/resolve", world["admin"],
                       json={"items": [{"material": "PET", "net_kg": "50"}, {"material": "CAN", "net_kg": "5"}],
                             "note": "again"})
    assert again.status_code == 409
    assert await ledger.balance_kobo(session, world["user"].id) == 997_000


async def test_resolve_needs_every_weighed_material(client: AsyncClient, world, sms) -> None:
    pickup, _ = await weighed(client, world, sms)
    await call(client, "POST", f"/pickups/{pickup['id']}/dispute", world["user"],
               json={"photo_url": PHOTO, "claimed_kg": "48", "reason": "Too low"})
    response = await call(client, "POST", f"/admin/pickups/{pickup['id']}/resolve", world["admin"],
                          json={"items": [{"material": "PET", "net_kg": "42"}], "note": "Only PET"})
    assert response.status_code == 422


async def test_admin_board_totals_by_area(client: AsyncClient, world) -> None:
    await requested(client, world)
    await call(client, "POST", "/pickups", world["user"],
               json=request_body(items=[{"material": "PET", "sacks": "2"}], pool=True))
    board = (await call(client, "GET", "/admin/pickups", world["admin"], params={"status": "REQUESTED"})).json()
    uwani = next(a for a in board["area_totals"] if a["area"] == "Uwani")
    assert (uwani["requests"], uwani["pooled"], uwani["estimated_kg"]) == (2, 1, "80.00")


# ----- 5.7 hub walk-in -----


async def test_hub_walk_in(client: AsyncClient, world, sms, session: AsyncSession) -> None:
    found = await call(client, "GET", "/collector/users/search", world["collector"], params={"phone": world["user"].phone})
    assert found.json() == {"id": str(world["user"].id), "name": "Chinaza"}

    response = await call(client, "POST", "/collector/walk-ins", world["collector"],
                          json={"user_id": str(world["user"].id), **WEIGH})
    assert response.status_code == 201, response.text
    pickup = response.json()["pickup"]
    assert (pickup["channel"], pickup["status"], pickup["total_net_kg"]) == ("HUB", "AWAITING_CONFIRMATION", "44.50")
    assert pickup["under_minimum"] is False  # the 50 kg rule is for door pickups only
    code = re.search(r"code is (\d{6})", sms[-1][1]).group(1)
    done = await call(client, "POST", f"/collector/pickups/{pickup['id']}/otp", world["collector"], json={"code": code})
    assert done.json()["status"] == "COMPLETED"
    assert await ledger.balance_kobo(session, world["user"].id) == 941_500


async def test_walk_in_search_and_unknown_customer(client: AsyncClient, world) -> None:
    missing = await call(client, "GET", "/collector/users/search", world["collector"], params={"phone": "0809 000 0000"})
    assert missing.status_code == 404
    not_a_user = await call(client, "POST", "/collector/walk-ins", world["collector"],
                            json={"user_id": str(world["collector2"].id), **WEIGH})
    assert not_a_user.status_code == 404
    users_cannot = await call(client, "GET", "/collector/users/search", world["user"], params={"phone": world["other"].phone})
    assert users_cannot.status_code == 403
