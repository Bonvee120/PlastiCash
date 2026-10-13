"""Ops portal API, part 2: stats, new price versions, users and collectors, balance adjustments, stock and bales.
ADMIN only through the router-level guard, like routers/admin.py (required test 16)."""
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.admin_schemas import (
    AdjustmentIn, BaleIn, BaleOut, CollectorDisputes, CollectorIn, MaterialStock, PendingWithdrawals, PriceIn, SellIn,
    StatsOut, StockOut, UserAccuracy, UserPatch, UserRow,
)
from app.areas import AREAS
from app.auth import AdminProfile, require_admin
from app.db import get_session
from app.errors import ApiError
from app.models import (
    AccountType, Bale, BaleStatus, LedgerEntry, Material, PickupStatus, Price, Profile, Role,
)
from app.phone import normalize_ng_phone
from app.schemas import LedgerEntryOut, PriceOut, display_name, points
from app.services import ledger, stats, stock, supabase_admin

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])

SessionDep = Annotated[AsyncSession, Depends(get_session)]


# ----- Stats -----


@router.get("/counts")
async def sidebar_counts(session: SessionDep) -> dict[str, int]:
    """Badges for the ops sidebar on every page: one query instead of the whole dashboard."""
    return await stats.counts(session)


@router.get("/stats", response_model=StatsOut)
async def dashboard(session: SessionDep) -> StatsOut:
    """Three queries in total: the single numbers, estimate accuracy (with names), disputes per collector."""
    since = stats.month_start()
    head = await stats.headline(session, since)
    rows = sorted(
        (UserAccuracy(user_id=p.id, name=display_name(p) or p.full_name, pickups=n, estimated_kg=est, actual_kg=act,
                      accuracy=stats.ratio(est, act))
         for p, n, est, act in await stats.accuracy_with_profiles(session)),
        key=lambda r: r.accuracy,
    )
    count, amount = head["pending"]
    return StatsOut(
        month_start=since,
        kg_this_month=head["kg_this_month"],
        points_paid_kobo=head["points_paid_kobo"],
        points_paid=points(head["points_paid_kobo"]),
        pending_withdrawals=PendingWithdrawals(count=count, amount_kobo=amount),
        open_disputes=head["open_disputes"],
        waiting_requests=head["waiting_requests"],
        raw_stock_kg=head["raw_stock_kg"],
        estimate_accuracy=rows[:10],
        disputes_per_collector=[
            CollectorDisputes(collector_id=c, name=name, weighed=w, disputes=d)
            for c, name, w, d in await stats.disputes_per_collector(session)
        ],
    )


# ----- Prices -----


@router.post("/prices", status_code=201, response_model=PriceOut)
async def add_price(body: PriceIn, admin: AdminProfile, session: SessionDep) -> PriceOut:
    """A new version for one material, effective now. Pickups already weighed keep their price snapshot."""
    price = Price(**body.model_dump(), set_by=admin.id)
    session.add(price)
    await session.commit()
    await session.refresh(price)
    return PriceOut.from_price(price)


# ----- Users and collectors -----


async def _balances(session: AsyncSession, user_ids: list[UUID]) -> dict[UUID, int]:
    if not user_ids:
        return {}
    rows = await session.exec(
        select(LedgerEntry.user_id, func.sum(LedgerEntry.amount_kobo))
        .where(LedgerEntry.user_id.in_(user_ids))
        .group_by(LedgerEntry.user_id)
    )
    return {u: int(total) for u, total in rows.all()}


def _row(p: Profile, balance: int) -> UserRow:
    return UserRow(
        id=p.id, role=p.role, account_type=p.account_type,
        name=(display_name(p) if p.role == Role.USER else "") or p.full_name, full_name=p.full_name,
        email=p.email, phone=p.phone, area=p.area, is_active=p.is_active, verified_picker=p.verified_picker,
        balance_kobo=balance, created_at=p.created_at,
    )


@router.get("/users", response_model=list[UserRow])
async def users(session: SessionDep, role: Role | None = None, q: str | None = None) -> list[UserRow]:
    """Newest first, up to 200; `q` matches name, organization, email or phone."""
    query = select(Profile).order_by(Profile.created_at.desc()).limit(200)
    if role is not None:
        query = query.where(Profile.role == role)
    if q and q.strip():
        like = f"%{q.strip()}%"
        digits = "".join(ch for ch in q if ch.isdigit())
        conditions = [Profile.full_name.ilike(like), Profile.org_name.ilike(like), Profile.email.ilike(like)]
        if len(digits) >= 4:
            conditions.append(Profile.phone.like(f"%{digits.lstrip('0')}%"))
        query = query.where(or_(*conditions))
    rows = (await session.exec(query)).all()
    balances = await _balances(session, [p.id for p in rows])
    return [_row(p, balances.get(p.id, 0)) for p in rows]


@router.patch("/users/{user_id}", response_model=UserRow)
async def update_user(user_id: UUID, body: UserPatch, admin: AdminProfile, session: SessionDep) -> UserRow:
    """Deactivate or reactivate, verified picker badge, change role. An admin can't lock themselves out."""
    profile = (await session.exec(select(Profile).where(Profile.id == user_id).with_for_update())).first()
    if profile is None:
        raise ApiError(404, "NOT_FOUND", "User not found.")
    changes = body.model_dump(exclude_unset=True, exclude_none=True)
    if profile.id == admin.id and (changes.get("is_active") is False or changes.get("role", Role.ADMIN) != Role.ADMIN):
        raise ApiError(409, "CANT_CHANGE_SELF", "You can't deactivate yourself or change your own role.")
    if "verified_picker" in changes and (changes.get("role") or profile.role) != Role.USER:
        raise ApiError(422, "VALIDATION_ERROR", "Only customers can be verified pickers.")
    for key, value in changes.items():
        setattr(profile, key, value)
    if profile.role == Role.USER and profile.account_type is None:
        profile.account_type = AccountType.INDIVIDUAL  # profiles check: a USER needs an account type
    if profile.role != Role.USER:
        profile.verified_picker = False
    session.add(profile)
    await session.commit()
    return _row(profile, (await _balances(session, [profile.id])).get(profile.id, 0))


@router.post("/collectors", status_code=201, response_model=UserRow)
async def create_collector(body: CollectorIn, session: SessionDep) -> UserRow:
    """Creates the Supabase login (service role key, server side) and the COLLECTOR profile with the same id.
    If the profile can't be saved, the login is deleted again so nothing is left half made."""
    phone = normalize_ng_phone(body.phone)
    errors = []
    if phone is None:
        errors.append({"field": "phone", "message": "Enter a Nigerian mobile number, e.g. 0803 123 4567"})
    if body.area is not None and body.area not in AREAS:
        errors.append({"field": "area", "message": "Choose an area from the list."})
    if errors:
        raise ApiError(422, "VALIDATION_ERROR", "Check the highlighted fields.", {"errors": errors})
    if (await session.exec(select(Profile.id).where(Profile.phone == phone))).first():
        raise ApiError(409, "PHONE_TAKEN", "Someone already uses this phone number.",
                       {"errors": [{"field": "phone", "message": "Already used by another account."}]})

    email = body.email.lower()
    user_id = await supabase_admin.create_user(email, body.password)
    profile = Profile(id=user_id, role=Role.COLLECTOR, full_name=body.full_name, phone=phone, email=email,
                      area=body.area)
    session.add(profile)
    try:
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        await supabase_admin.delete_user(user_id)
        raise ApiError(409, "PHONE_TAKEN", "Someone already uses this phone number.") from error
    await session.refresh(profile)
    return _row(profile, 0)


@router.post("/ledger/adjustments", status_code=201, response_model=LedgerEntryOut)
async def adjust_balance(body: AdjustmentIn, admin: AdminProfile, session: SessionDep) -> LedgerEntryOut:
    """A correction with a required note (PRD A5). Locks the profile like a withdrawal, so a deduction can't take a
    balance below zero while a withdrawal is being made."""
    profile = (await session.exec(select(Profile).where(Profile.id == body.user_id).with_for_update())).first()
    if profile is None or profile.role != Role.USER:
        raise ApiError(404, "NOT_FOUND", "Customer not found.")
    if body.amount_kobo < 0 and await ledger.balance_kobo(session, profile.id) + body.amount_kobo < 0:
        raise ApiError(422, "INSUFFICIENT_BALANCE", "This would take the balance below zero.")
    entry = await ledger.add_adjustment(session, profile.id, body.amount_kobo, body.note, admin.id)
    await session.commit()
    return LedgerEntryOut.from_entry(entry)


# ----- Stock and bales -----


@router.get("/stock", response_model=StockOut)
async def stock_overview(session: SessionDep) -> StockOut:
    raw_in, baled = await stock.raw_in(session), await stock.baled(session)
    materials = [
        MaterialStock(
            material=m,
            raw_in_kg=raw_in.get(m, stock.ZERO),
            baled_kg=baled.get(m, stock.ZERO),
            raw_stock_kg=raw_in.get(m, stock.ZERO) - baled.get(m, stock.ZERO),
            loss_pct=stock.loss_pct(raw_in.get(m, stock.ZERO), baled.get(m, stock.ZERO)),
        )
        for m in Material
    ]
    total_in, total_baled = sum(raw_in.values(), stock.ZERO), sum(baled.values(), stock.ZERO)
    bales = (await session.exec(select(Bale).order_by(Bale.created_at.desc()).limit(200))).all()
    by_status = dict(
        (await session.exec(select(Bale.status, func.count()).group_by(Bale.status))).all()
    )
    revenue = (
        await session.exec(select(func.coalesce(func.sum(Bale.sale_price_kobo), 0)).where(Bale.status == BaleStatus.SOLD))
    ).one()
    return StockOut(
        materials=materials,
        raw_in_kg=total_in,
        baled_kg=total_baled,
        raw_stock_kg=total_in - total_baled,
        loss_pct=stock.loss_pct(total_in, total_baled),
        bales_by_status={s: int(by_status.get(s, 0)) for s in BaleStatus},
        revenue_kobo=int(revenue),
        revenue=points(int(revenue)),
        bales=[BaleOut.from_bale(b) for b in bales],
    )


@router.post("/bales", status_code=201, response_model=BaleOut)
async def create_bale(body: BaleIn, admin: AdminProfile, session: SessionDep) -> BaleOut:
    bale = await stock.create_bale(session, admin, body.material, body.weight_kg)
    await session.commit()
    return BaleOut.from_bale(bale)


@router.post("/bales/{bale_id}/process", response_model=BaleOut)
async def process_bale(bale_id: UUID, session: SessionDep) -> BaleOut:
    bale = await stock.move(session, bale_id, BaleStatus.PROCESSED)
    await session.commit()
    return BaleOut.from_bale(bale)


@router.post("/bales/{bale_id}/sell", response_model=BaleOut)
async def sell_bale(bale_id: UUID, body: SellIn, session: SessionDep) -> BaleOut:
    bale = await stock.move(session, bale_id, BaleStatus.SOLD, body.buyer, body.sale_price_kobo)
    await session.commit()
    return BaleOut.from_bale(bale)
