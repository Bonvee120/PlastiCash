"""Ops portal: write the blog, the climate events list and the landing hero slides. ADMIN only through the
router-level guard (required test 16 covers every route). Images must be photos uploaded through PlastiCash
(Cloudinary), like every other photo."""
import re
import unicodedata
from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.auth import AdminProfile, require_admin
from app.content_schemas import (
    EventIn, EventOut, EventPatch, PostIn, PostOut, PostPatch, PostSummary, SlideIn, SlideOut, SlidePatch,
)
from app.db import get_session
from app.errors import ApiError
from app.models import Event, HeroSlide, Post
from app.routers.content import author_names
from app.services import cloudinary

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])

SessionDep = Annotated[AsyncSession, Depends(get_session)]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _photo(url: str | None, field: str) -> str | None:
    return cloudinary.check_photo_url(url, field) if url else None


async def _get(session: AsyncSession, model, item_id: UUID, label: str):
    item = await session.get(model, item_id)
    if item is None:
        raise ApiError(404, "NOT_FOUND", f"{label} not found.")
    return item


# ----- Blog -----


def slugify(title: str) -> str:
    """'Plastic & drains in Enugu!' -> 'plastic-drains-in-enugu'."""
    ascii_title = unicodedata.normalize("NFKD", title).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_title.lower()).strip("-")[:80].strip("-")
    return slug or "post"


async def _unique_slug(session: AsyncSession, title: str, exclude: UUID | None = None) -> str:
    base = slugify(title)
    taken = set((await session.exec(select(Post.slug).where(Post.slug.like(f"{base}%"), Post.id != exclude))).all())
    if base not in taken:
        return base
    n = 2
    while f"{base}-{n}" in taken:
        n += 1
    return f"{base}-{n}"


def _byline(name: str | None) -> str | None:
    """The writer's name as typed; blank means "use the admin account's name"."""
    return " ".join((name or "").split()) or None


async def _post_out(session: AsyncSession, post: Post) -> PostOut:
    await session.refresh(post)
    names = await author_names(session, [post])
    return PostOut.build(post, names.get(post.author_id))


@router.get("/posts", response_model=list[PostSummary])
async def all_posts(session: SessionDep) -> list[PostSummary]:
    """Drafts and published, most recently edited first."""
    rows = list((await session.exec(select(Post).order_by(Post.updated_at.desc()).limit(200))).all())
    names = await author_names(session, rows)
    return [PostSummary.build(p, names.get(p.author_id)) for p in rows]


@router.get("/posts/{post_id}", response_model=PostOut)
async def one_post(post_id: UUID, session: SessionDep) -> PostOut:
    return await _post_out(session, await _get(session, Post, post_id, "Post"))


@router.post("/posts", status_code=201, response_model=PostOut)
async def create_post(body: PostIn, admin: AdminProfile, session: SessionDep) -> PostOut:
    post = Post(
        slug=await _unique_slug(session, body.title),
        title=body.title.strip(),
        excerpt=body.excerpt.strip(),
        body_md=body.body_md,
        cover_url=_photo(body.cover_url, "cover_url"),
        author_id=admin.id,
        byline=_byline(body.byline),
        published_at=_now() if body.publish else None,
    )
    session.add(post)
    await session.commit()
    return await _post_out(session, post)


@router.patch("/posts/{post_id}", response_model=PostOut)
async def update_post(post_id: UUID, body: PostPatch, session: SessionDep) -> PostOut:
    """Edit, publish or unpublish. The address (slug) stays the same once published, so shared links keep working."""
    post = await _get(session, Post, post_id, "Post")
    changes = body.model_dump(exclude_unset=True)
    if "title" in changes and changes["title"]:
        post.title = changes["title"].strip()
        if post.published_at is None:
            post.slug = await _unique_slug(session, post.title, exclude=post.id)
    if changes.get("excerpt"):
        post.excerpt = changes["excerpt"].strip()
    if changes.get("body_md"):
        post.body_md = changes["body_md"]
    if "cover_url" in changes:
        post.cover_url = _photo(changes["cover_url"], "cover_url")
    if "byline" in changes:
        post.byline = _byline(changes["byline"])
    if changes.get("publish") is True and post.published_at is None:
        post.published_at = _now()
    elif changes.get("publish") is False:
        post.published_at = None
    post.updated_at = _now()
    session.add(post)
    await session.commit()
    return await _post_out(session, post)


@router.delete("/posts/{post_id}", status_code=204)
async def delete_post(post_id: UUID, session: SessionDep) -> None:
    await session.delete(await _get(session, Post, post_id, "Post"))
    await session.commit()


# ----- Events -----


@router.get("/events", response_model=list[EventOut])
async def all_events(session: SessionDep) -> list[EventOut]:
    """Every event, drafts included, latest start first."""
    rows = await session.exec(select(Event).order_by(Event.starts_at.desc()).limit(300))
    return [EventOut.build(e) for e in rows.all()]


@router.post("/events", status_code=201, response_model=EventOut)
async def create_event(body: EventIn, admin: AdminProfile, session: SessionDep) -> EventOut:
    data = body.model_dump()
    data["cover_url"] = _photo(body.cover_url, "cover_url")
    event = Event(**data, created_by=admin.id)
    session.add(event)
    await session.commit()
    await session.refresh(event)
    return EventOut.build(event)


@router.patch("/events/{event_id}", response_model=EventOut)
async def update_event(event_id: UUID, body: EventPatch, session: SessionDep) -> EventOut:
    event = await _get(session, Event, event_id, "Event")
    changes = body.model_dump(exclude_unset=True)
    if "cover_url" in changes:
        changes["cover_url"] = _photo(changes["cover_url"], "cover_url")
    for key, value in changes.items():
        if value is None and key not in ("ends_at", "cover_url", "link_url"):
            continue  # required fields can't be cleared
        setattr(event, key, value)
    if event.ends_at and event.ends_at < event.starts_at:
        raise ApiError(422, "VALIDATION_ERROR", "The end can't be before the start.")
    event.updated_at = _now()
    session.add(event)
    await session.commit()
    await session.refresh(event)
    return EventOut.build(event)


@router.delete("/events/{event_id}", status_code=204)
async def delete_event(event_id: UUID, session: SessionDep) -> None:
    await session.delete(await _get(session, Event, event_id, "Event"))
    await session.commit()


# ----- Hero slides -----


@router.get("/hero-slides", response_model=list[SlideOut])
async def all_slides(session: SessionDep) -> list[SlideOut]:
    rows = await session.exec(select(HeroSlide).order_by(HeroSlide.position, HeroSlide.created_at))
    return [SlideOut.build(s) for s in rows.all()]


@router.post("/hero-slides", status_code=201, response_model=SlideOut)
async def create_slide(body: SlideIn, session: SessionDep) -> SlideOut:
    data = body.model_dump()
    data["image_url"] = _photo(body.image_url, "image_url")
    slide = HeroSlide(**data)
    session.add(slide)
    await session.commit()
    await session.refresh(slide)
    return SlideOut.build(slide)


@router.patch("/hero-slides/{slide_id}", response_model=SlideOut)
async def update_slide(slide_id: UUID, body: SlidePatch, session: SessionDep) -> SlideOut:
    slide = await _get(session, HeroSlide, slide_id, "Slide")
    changes = body.model_dump(exclude_unset=True)
    if changes.get("image_url"):
        slide.image_url = _photo(changes["image_url"], "image_url")
    for key in ("headline", "position", "active"):
        if changes.get(key) is not None:
            setattr(slide, key, changes[key])
    if "subline" in changes:
        slide.subline = changes["subline"]
    session.add(slide)
    await session.commit()
    await session.refresh(slide)
    return SlideOut.build(slide)


@router.delete("/hero-slides/{slide_id}", status_code=204)
async def delete_slide(slide_id: UUID, session: SessionDep) -> None:
    await session.delete(await _get(session, HeroSlide, slide_id, "Slide"))
    await session.commit()
