"""Blog posts, climate events and landing hero slides (admin-written content, public to read)."""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models import Event, HeroSlide, Post


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


LINK = r"^https?://[^\s]+$"

# ----- Blog -----


class PostIn(_Strict):
    title: str = Field(min_length=3, max_length=160)
    excerpt: str = Field(min_length=10, max_length=300)
    body_md: str = Field(min_length=1, max_length=50_000)
    cover_url: str | None = None
    byline: str | None = Field(default=None, max_length=80)
    publish: bool = False


class PostPatch(_Strict):
    title: str | None = Field(default=None, min_length=3, max_length=160)
    excerpt: str | None = Field(default=None, min_length=10, max_length=300)
    body_md: str | None = Field(default=None, min_length=1, max_length=50_000)
    cover_url: str | None = None
    byline: str | None = Field(default=None, max_length=80)
    publish: bool | None = None


class PostSummary(BaseModel):
    id: UUID
    slug: str
    title: str
    excerpt: str
    cover_url: str | None
    author_name: str | None
    byline: str | None
    published_at: datetime | None
    updated_at: datetime

    @classmethod
    def build(cls, p: Post, account_name: str | None) -> "PostSummary":
        """author_name is what readers see: the byline when set, else the writing admin's account name."""
        return cls(id=p.id, slug=p.slug, title=p.title, excerpt=p.excerpt, cover_url=p.cover_url,
                   author_name=p.byline or account_name, byline=p.byline, published_at=p.published_at,
                   updated_at=p.updated_at)


class PostOut(PostSummary):
    body_md: str

    @classmethod
    def build(cls, p: Post, author_name: str | None) -> "PostOut":
        return cls(**PostSummary.build(p, author_name).model_dump(), body_md=p.body_md)


# ----- Events -----


class EventIn(_Strict):
    title: str = Field(min_length=3, max_length=160)
    starts_at: datetime
    ends_at: datetime | None = None
    location: str = Field(min_length=2, max_length=200)
    is_online: bool = False
    summary: str = Field(min_length=10, max_length=2_000)
    cover_url: str | None = None
    link_url: str | None = Field(default=None, max_length=500, pattern=LINK)
    published: bool = False

    @model_validator(mode="after")
    def _times(self):
        if self.starts_at.tzinfo is None or (self.ends_at and self.ends_at.tzinfo is None):
            raise ValueError("Give times with a time zone")
        if self.ends_at and self.ends_at < self.starts_at:
            raise ValueError("The end can't be before the start")
        return self


class EventPatch(_Strict):
    title: str | None = Field(default=None, min_length=3, max_length=160)
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    location: str | None = Field(default=None, min_length=2, max_length=200)
    is_online: bool | None = None
    summary: str | None = Field(default=None, min_length=10, max_length=2_000)
    cover_url: str | None = None
    link_url: str | None = Field(default=None, max_length=500, pattern=LINK)
    published: bool | None = None


class EventOut(BaseModel):
    id: UUID
    title: str
    starts_at: datetime
    ends_at: datetime | None
    location: str
    is_online: bool
    summary: str
    cover_url: str | None
    link_url: str | None
    published: bool

    @classmethod
    def build(cls, e: Event) -> "EventOut":
        return cls(id=e.id, title=e.title, starts_at=e.starts_at, ends_at=e.ends_at, location=e.location,
                   is_online=e.is_online, summary=e.summary, cover_url=e.cover_url, link_url=e.link_url,
                   published=e.published)


# ----- Hero slides -----


class SlideIn(_Strict):
    image_url: str
    headline: str = Field(min_length=3, max_length=80)
    subline: str | None = Field(default=None, max_length=160)
    position: int = Field(default=0, ge=0, le=1000)
    active: bool = True


class SlidePatch(_Strict):
    image_url: str | None = None
    headline: str | None = Field(default=None, min_length=3, max_length=80)
    subline: str | None = Field(default=None, max_length=160)
    position: int | None = Field(default=None, ge=0, le=1000)
    active: bool | None = None


class SlideOut(BaseModel):
    id: UUID
    image_url: str
    headline: str
    subline: str | None
    position: int
    active: bool

    @classmethod
    def build(cls, s: HeroSlide) -> "SlideOut":
        return cls(id=s.id, image_url=s.image_url, headline=s.headline, subline=s.subline, position=s.position,
                   active=s.active)
