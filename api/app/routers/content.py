"""Public content: blog, climate events and the landing hero carousel. Only published rows; no login needed.
Admins write it through routers/admin_content.py."""
from datetime import datetime, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.content_schemas import EventOut, PostOut, PostSummary, SlideOut
from app.db import get_session
from app.errors import ApiError
from app.models import Event, HeroSlide, Post, Profile
from app.schemas import display_name

router = APIRouter(tags=["content"])

SessionDep = Annotated[AsyncSession, Depends(get_session)]


def _live_posts(now: datetime):
    return (Post.published_at.is_not(None), Post.published_at <= now)


async def author_names(session: AsyncSession, posts: list[Post]) -> dict:
    ids = {p.author_id for p in posts if p.author_id}
    if not ids:
        return {}
    rows = await session.exec(select(Profile).where(Profile.id.in_(ids)))
    return {p.id: (display_name(p) or p.full_name) for p in rows.all()}


@router.get("/blog", response_model=list[PostSummary])
async def blog(
    session: SessionDep,
    limit: Annotated[int, Query(ge=1, le=50)] = 12,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[PostSummary]:
    """Published posts, newest first."""
    rows = list((await session.exec(
        select(Post).where(*_live_posts(datetime.now(timezone.utc)))
        .order_by(Post.published_at.desc()).limit(limit).offset(offset)
    )).all())
    names = await author_names(session, rows)
    return [PostSummary.build(p, names.get(p.author_id)) for p in rows]


@router.get("/blog/{slug}", response_model=PostOut)
async def blog_post(slug: str, session: SessionDep) -> PostOut:
    post = (await session.exec(
        select(Post).where(Post.slug == slug, *_live_posts(datetime.now(timezone.utc)))
    )).first()
    if post is None:
        raise ApiError(404, "NOT_FOUND", "Post not found.")
    names = await author_names(session, [post])
    return PostOut.build(post, names.get(post.author_id))


@router.get("/events", response_model=list[EventOut])
async def events(
    session: SessionDep,
    when: Literal["upcoming", "past"] = "upcoming",
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> list[EventOut]:
    """Published events. Upcoming: not finished yet, soonest first. Past: most recent first."""
    now = datetime.now(timezone.utc)
    finish = func.coalesce(Event.ends_at, Event.starts_at)
    query = select(Event).where(Event.published)
    query = (query.where(finish >= now).order_by(Event.starts_at) if when == "upcoming"
             else query.where(finish < now).order_by(Event.starts_at.desc()))
    return [EventOut.build(e) for e in (await session.exec(query.limit(limit))).all()]


@router.get("/hero-slides", response_model=list[SlideOut])
async def hero_slides(session: SessionDep) -> list[SlideOut]:
    """Active slides for the landing hero carousel, in order."""
    rows = await session.exec(
        select(HeroSlide).where(HeroSlide.active).order_by(HeroSlide.position, HeroSlide.created_at).limit(10)
    )
    return [SlideOut.build(s) for s in rows.all()]
