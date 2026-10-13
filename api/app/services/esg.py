"""ESG report for organizations (docs/specs/02-api.md `/reports/esg`, TRD §5.10): org name, period, kg by material,
CO2 saved, pickup count and a certificate line, from COMPLETED pickups confirmed in the period. Rendered from HTML with
WeasyPrint, which needs Pango and HarfBuzz from the system (installed in the Docker image); it is imported only when a
PDF is made, so the rest of the API runs without it."""
import html
import logging
from calendar import monthrange
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.errors import ApiError
from app.models import Material, Pickup, PickupItem, PickupStatus, Price, Profile

log = logging.getLogger(__name__)

LAGOS = timezone(timedelta(hours=1))
MATERIAL_NAMES = {
    Material.PET: "PET bottles",
    Material.PLASTIC: "Hard plastic",
    Material.SACHET: "Sachets and nylon",
    Material.CAN: "Cans",
    Material.TIN: "Tins",
}
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
          "November", "December"]


def period(year: int, month: int | None, today: date) -> tuple[datetime, datetime, str]:
    """[start, end) in Lagos time and a label like "October 2026" or "2026". Future periods are refused."""
    if month is not None and not 1 <= month <= 12:
        raise ApiError(422, "VALIDATION_ERROR", "Month must be 1 to 12.")
    if year < 2024 or (year, month or 1) > (today.year, today.month if month else 1):
        raise ApiError(422, "VALIDATION_ERROR", "Choose a period that has started.")
    if month is None:
        start, end, label = date(year, 1, 1), date(year + 1, 1, 1), str(year)
    else:
        start = date(year, month, 1)
        end = start + timedelta(days=monthrange(year, month)[1])
        label = f"{MONTHS[month - 1]} {year}"
    as_dt = lambda d: datetime(d.year, d.month, d.day, tzinfo=LAGOS)  # noqa: E731
    return as_dt(start), as_dt(end), label


async def report_data(session: AsyncSession, org: Profile, year: int, month: int | None, today: date) -> dict:
    start, end, label = period(year, month, today)
    in_period = (
        Pickup.user_id == org.id,
        Pickup.status == PickupStatus.COMPLETED,
        Pickup.confirmed_at >= start,
        Pickup.confirmed_at < end,
    )
    rows = (
        await session.exec(
            select(PickupItem.material, func.sum(PickupItem.net_kg), func.sum(PickupItem.net_kg * Price.co2_kg_saved_per_kg))
            .join(Pickup, Pickup.id == PickupItem.pickup_id)
            .join(Price, Price.id == PickupItem.price_id)
            .where(*in_period)
            .group_by(PickupItem.material)
            .order_by(func.sum(PickupItem.net_kg).desc())
        )
    ).all()
    pickups = (await session.exec(select(func.count()).select_from(Pickup).where(*in_period))).one()
    materials = [
        {"material": m, "kg": Decimal(kg).quantize(Decimal("0.01")), "co2_kg": Decimal(co2).quantize(Decimal("0.1"))}
        for m, kg, co2 in rows
    ]
    return {
        "org_name": org.org_name or org.full_name,
        "contact": org.full_name,
        "period": label,
        "slug": f"{year}-{month:02d}" if month else str(year),
        "pickups": int(pickups),
        "total_kg": sum((m["kg"] for m in materials), Decimal("0.00")),
        "co2_kg": sum((m["co2_kg"] for m in materials), Decimal("0.0")),
        "materials": materials,
        "report_id": f"ESG-{str(org.id)[:8].upper()}-{year}{f'{month:02d}' if month else ''}",
        "generated": datetime.now(LAGOS),
    }


def _num(value: Decimal, places: int = 2) -> str:
    return f"{value:,.{places}f}"


def render_html(data: dict) -> str:
    """Every value from the database is escaped: an organization name is user input."""
    e = lambda v: html.escape(str(v))  # noqa: E731
    rows = "".join(
        f"<tr><td>{e(MATERIAL_NAMES[m['material']])}</td><td class='n'>{_num(m['kg'])} kg</td>"
        f"<td class='n'>{_num(m['co2_kg'], 1)} kg</td></tr>"
        for m in data["materials"]
    ) or "<tr><td colspan='3' class='empty'>No completed pickups in this period.</td></tr>"
    cert = (
        f"<div class='cert'>EcoCyclers confirms that <b>{e(data['org_name'])}</b> handed over "
        f"<b>{_num(data['total_kg'])} kg</b> of plastic for recycling in {e(data['period'])}, weighed by an "
        "EcoCyclers collector and confirmed on PlastiCash.</div>"
        if data["total_kg"] > 0 else ""
    )
    return f"""<!doctype html>
<html><head><meta charset="utf-8"><title>PlastiCash ESG report {e(data['period'])}</title>
<style>
  @page {{ size: A4; margin: 22mm 18mm; @bottom-center {{ content: "Report {e(data['report_id'])} · page " counter(page);
    font-family: "DejaVu Sans", sans-serif; font-size: 8pt; color: #64748B; }} }}
  body {{ font-family: "DejaVu Sans", sans-serif; color: #0F172A; font-size: 10.5pt; }}
  .brand {{ color: #15803D; font-weight: bold; font-size: 14pt; }}
  .brand small {{ color: #64748B; font-weight: normal; font-size: 9pt; }}
  h1 {{ font-size: 22pt; margin: 18mm 0 2mm; color: #052E16; }}
  .sub {{ color: #475569; margin: 0 0 10mm; }}
  .cards {{ display: flex; gap: 6mm; margin-bottom: 10mm; }}
  .card {{ flex: 1; border: 1px solid #BBF7D0; background: #F0FDF4; border-radius: 4mm; padding: 5mm; }}
  .card b {{ display: block; font-size: 18pt; color: #14532D; }}
  .card span {{ color: #475569; font-size: 9pt; }}
  table {{ width: 100%; border-collapse: collapse; }}
  th {{ text-align: left; font-size: 8.5pt; color: #64748B; text-transform: uppercase; border-bottom: 1px solid #CBD5E1;
       padding: 2mm 0; }}
  td {{ padding: 2.5mm 0; border-bottom: 1px solid #E2E8F0; }}
  .n {{ text-align: right; }}
  th.n {{ text-align: right; }}
  .empty {{ color: #64748B; }}
  .cert {{ margin-top: 12mm; padding: 6mm; border: 1.5px solid #15803D; border-radius: 4mm; }}
  .note {{ margin-top: 8mm; color: #64748B; font-size: 8.5pt; }}
</style></head>
<body>
  <div class="brand">PlastiCash <small>by EcoCyclers · Enugu</small></div>
  <h1>Recycling report</h1>
  <p class="sub">{e(data['org_name'])} · {e(data['period'])}</p>
  <div class="cards">
    <div class="card"><b>{_num(data['total_kg'])} kg</b><span>plastic recycled</span></div>
    <div class="card"><b>{_num(data['co2_kg'], 1)} kg</b><span>CO₂ emissions avoided</span></div>
    <div class="card"><b>{data['pickups']}</b><span>completed pickup{'' if data['pickups'] == 1 else 's'}</span></div>
  </div>
  <table>
    <thead><tr><th>Material</th><th class="n">Weight</th><th class="n">CO₂ avoided</th></tr></thead>
    <tbody>{rows}</tbody>
  </table>
  {cert}
  <p class="note">
    Weights are net kg after deductions, from completed pickups confirmed in the period (Africa/Lagos time).
    CO₂ avoided = net kg × the emission factor per material at the time of weighing (US EPA WARM).
    Report {e(data['report_id'])}, generated {data['generated']:%d %B %Y, %H:%M}.
  </p>
</body></html>"""


def render_pdf(data: dict) -> bytes:
    try:
        from weasyprint import HTML  # system libraries are loaded here
    except (ImportError, OSError) as error:
        log.error("WeasyPrint is not available: %s", type(error).__name__)
        raise ApiError(503, "PDF_UNAVAILABLE", "PDF reports are not available on this server yet.") from error
    return HTML(string=render_html(data)).write_pdf()

