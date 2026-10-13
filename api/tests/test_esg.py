"""9.2 GET /reports/esg: organizations only (required test 17), numbers from completed pickups in the period."""
import sys
from datetime import date, datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlmodel.ext.asyncio.session import AsyncSession

from app.errors import ApiError
from app.models import AccountType, Material, PickupStatus, Profile, Role
from app.services import esg, ledger
from tests.factories import make_price, make_user, make_weighed_pickup
from tests.tokens import bearer

pytestmark = pytest.mark.usefixtures("fake_supabase_auth")

URL = "/api/v1/reports/esg"


def weasyprint_works() -> bool:
    try:
        import weasyprint  # noqa: F401
    except (ImportError, OSError):
        return False
    return True


async def make_org(session: AsyncSession, name: str = "Green Hills School") -> Profile:
    org = await make_user(session, "Adaeze")
    org.account_type, org.org_name, org.org_type = AccountType.ORGANIZATION, name, "school"
    session.add(org)
    await session.flush()
    return org


async def completed(session: AsyncSession, owner: Profile, items, confirmed_at: datetime):
    collector = await make_user(session, "Collector", role=Role.COLLECTOR)
    pickup = await make_weighed_pickup(session, owner, collector, items)
    pickup.status, pickup.confirmed_at = PickupStatus.COMPLETED, confirmed_at
    session.add(pickup)
    await ledger.credit_pickup(session, pickup)
    await session.flush()
    return pickup


async def test_17_esg_report_is_403_for_individuals(client: AsyncClient, session: AsyncSession) -> None:
    individual = await make_user(session, "Chinaza")
    collector = await make_user(session, "Ifeanyi", role=Role.COLLECTOR)
    for who in (individual, collector):
        response = await client.get(f"{URL}?year=2026", headers=bearer(who.id))
        assert response.status_code == 403


async def test_report_counts_completed_pickups_in_the_period(session: AsyncSession) -> None:
    await make_price(session, Material.PET, 185, co2="1.146")
    await make_price(session, Material.CAN, 400, co2="9.13")
    org = await make_org(session)
    lagos = timezone(timedelta(hours=1))
    # 1 Oct 00:30 Lagos is still 30 Sep in UTC: it belongs to October.
    await completed(session, org, [(Material.PET, "20.00"), (Material.CAN, "5.00")], datetime(2026, 10, 1, 0, 30, tzinfo=lagos))
    await completed(session, org, [(Material.PET, "10.00")], datetime(2026, 9, 30, 23, 30, tzinfo=lagos))  # September
    collector = await make_user(session, "C2", role=Role.COLLECTOR)
    await make_weighed_pickup(session, org, collector, [(Material.PET, "99.00")])  # not confirmed: not counted

    october = await esg.report_data(session, org, 2026, 10, date(2026, 10, 13))
    assert (october["period"], october["pickups"], str(october["total_kg"])) == ("October 2026", 1, "25.00")
    assert [(m["material"], str(m["kg"])) for m in october["materials"]] == [(Material.PET, "20.00"), (Material.CAN, "5.00")]
    assert str(october["co2_kg"]) == "68.5"  # 20 × 1.146 = 22.92 -> 22.9; 5 × 9.13 = 45.65 -> 45.6 (as /impact)
    year = await esg.report_data(session, org, 2026, None, date(2026, 10, 13))
    assert (year["period"], year["pickups"], str(year["total_kg"]), year["slug"]) == ("2026", 2, "35.00", "2026")


@pytest.mark.parametrize("year,month", [(2026, 11), (2027, None), (2023, 5), (2026, 13)])
def test_future_or_invalid_periods_are_refused(year: int, month: int | None) -> None:
    with pytest.raises(ApiError) as error:
        esg.period(year, month, date(2026, 10, 13))
    assert error.value.status_code == 422


def test_html_escapes_the_organization_name() -> None:
    data = {
        "org_name": "<script>alert(1)</script> & Co", "contact": "x", "period": "October 2026", "slug": "2026-10",
        "pickups": 0, "total_kg": 0, "co2_kg": 0, "materials": [], "report_id": "ESG-1", "generated": datetime.now(),
    }
    page = esg.render_html(data)
    assert "<script>" not in page and "&lt;script&gt;alert(1)&lt;/script&gt; &amp; Co" in page
    assert "No completed pickups in this period." in page
    assert "EcoCyclers confirms" not in page  # no certificate for an empty period


async def test_pdf_unavailable_without_weasyprint(client: AsyncClient, session: AsyncSession, monkeypatch) -> None:
    org = await make_org(session)
    monkeypatch.setitem(sys.modules, "weasyprint", None)  # import fails like a server without Pango
    response = await client.get(f"{URL}?year=2026&month=10", headers=bearer(org.id))
    assert response.status_code == 503 and response.json()["code"] == "PDF_UNAVAILABLE"


@pytest.mark.skipif(not weasyprint_works(), reason="WeasyPrint system libraries not installed (they are in the Docker image)")
async def test_pdf_downloads_for_an_organization(client: AsyncClient, session: AsyncSession) -> None:
    await make_price(session, Material.PET, 185, co2="1.146")
    org = await make_org(session)
    await completed(session, org, [(Material.PET, "20.00")], datetime.now(timezone.utc))
    today = datetime.now(timezone(timedelta(hours=1)))
    response = await client.get(f"{URL}?year={today.year}&month={today.month}", headers=bearer(org.id))
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.headers["content-disposition"] == f'attachment; filename="plasticash-esg-{today.year}-{today.month:02d}.pdf"'
    assert response.content.startswith(b"%PDF")
