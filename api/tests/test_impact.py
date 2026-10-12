"""GET /impact: computed from COMPLETED pickups only, CO2 from each item's price version (required test 20)."""
import pytest
from httpx import AsyncClient
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models import Material, PickupStatus, Role
from app.services.pickup_state import transition
from tests.factories import make_price, make_user, make_weighed_pickup
from tests.tokens import bearer

pytestmark = pytest.mark.usefixtures("fake_supabase_auth")


async def test_20_impact_matches_completed_pickups(client: AsyncClient, session: AsyncSession) -> None:
    await make_price(session, Material.PET, 185, co2="1.146")
    await make_price(session, Material.CAN, 400, co2="10.064")
    user = await make_user(session, "Chinaza")
    collector = await make_user(session, "Ifeanyi", role=Role.COLLECTOR)

    done = await make_weighed_pickup(session, user, collector, [(Material.PET, "20.00"), (Material.CAN, "5.00")])
    await transition(session, done.id, PickupStatus.COMPLETED, user)
    await make_weighed_pickup(session, user, collector, [(Material.PET, "99.00")])  # not confirmed yet: doesn't count

    impact = (await client.get("/api/v1/impact", headers=bearer(user.id))).json()
    assert (impact["total_kg"], impact["pickups"]) == ("25.00", 1)
    assert impact["earned_kobo"] == 20 * 18_500 + 5 * 40_000 and impact["earned_points"] == "5700"
    # 20 x 1.146 + 5 x 10.064 = 22.92 + 50.32 = 73.2 kg CO2e
    assert impact["co2_kg"] == "73.2"
    assert [m["material"] for m in impact["by_material"]] == ["PET", "CAN"]


async def test_impact_of_a_new_user_is_zero(client: AsyncClient, session: AsyncSession) -> None:
    user = await make_user(session)
    impact = (await client.get("/api/v1/impact", headers=bearer(user.id))).json()
    assert (impact["total_kg"], impact["co2_kg"], impact["pickups"], impact["by_material"]) == ("0", "0", 0, [])
