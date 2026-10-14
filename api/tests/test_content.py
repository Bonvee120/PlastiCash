"""Blog, climate events and hero slides: admins write, the public reads only what is published."""
from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models import Role
from app.routers.admin_content import slugify
from tests.factories import make_user
from tests.tokens import bearer

pytestmark = pytest.mark.usefixtures("fake_supabase_auth", "app_settings")

PHOTO = "https://res.cloudinary.com/testcloud/image/upload/v1/plasticash/blog/cover.jpg"
POST = {"title": "Why Enugu's drains flood", "excerpt": "Plastic blocks drains; here is what changes when it is paid for.",
        "body_md": "## The problem\n\nBottles in **every** drain.\n\n<script>alert(1)</script>", "cover_url": PHOTO}


def soon(days: float) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()


async def test_drafts_stay_private_until_published(client: AsyncClient, session: AsyncSession) -> None:
    admin = await make_user(session, "Admin", role=Role.ADMIN)
    draft = (await client.post("/api/v1/admin/posts", json=POST, headers=bearer(admin.id))).json()
    assert (draft["slug"], draft["published_at"]) == ("why-enugu-s-drains-flood", None)
    assert (await client.get("/api/v1/blog")).json() == []
    assert (await client.get(f"/api/v1/blog/{draft['slug']}")).status_code == 404

    published = (await client.patch(f"/api/v1/admin/posts/{draft['id']}", json={"publish": True},
                                    headers=bearer(admin.id))).json()
    assert published["published_at"]
    listed = (await client.get("/api/v1/blog")).json()
    assert [(p["title"], p["author_name"]) for p in listed] == [("Why Enugu's drains flood", "Admin")]
    assert "body_md" not in listed[0]
    full = (await client.get(f"/api/v1/blog/{draft['slug']}")).json()
    assert "<script>" in full["body_md"]  # stored as written; the web renders Markdown without raw HTML

    # The address stays the same after publishing, even if the title changes.
    renamed = (await client.patch(f"/api/v1/admin/posts/{draft['id']}", json={"title": "Drains and plastic"},
                                  headers=bearer(admin.id))).json()
    assert renamed["slug"] == draft["slug"]
    await client.patch(f"/api/v1/admin/posts/{draft['id']}", json={"publish": False}, headers=bearer(admin.id))
    assert (await client.get("/api/v1/blog")).json() == []


async def test_byline_credits_the_real_writer(client: AsyncClient, session: AsyncSession) -> None:
    admin = await make_user(session, "Admin", role=Role.ADMIN)
    post = (await client.post("/api/v1/admin/posts", json={**POST, "byline": "  Ngozi   Eze ", "publish": True},
                              headers=bearer(admin.id))).json()
    assert (post["byline"], post["author_name"]) == ("Ngozi Eze", "Ngozi Eze")
    assert (await client.get(f"/api/v1/blog/{post['slug']}")).json()["author_name"] == "Ngozi Eze"

    # Clearing the byline falls back to the admin account's name.
    cleared = (await client.patch(f"/api/v1/admin/posts/{post['id']}", json={"byline": " "},
                                  headers=bearer(admin.id))).json()
    assert (cleared["byline"], cleared["author_name"]) == (None, "Admin")


async def test_slugs_are_unique_and_clean(client: AsyncClient, session: AsyncSession) -> None:
    admin = await make_user(session, "Admin", role=Role.ADMIN)
    first = (await client.post("/api/v1/admin/posts", json=POST, headers=bearer(admin.id))).json()
    second = (await client.post("/api/v1/admin/posts", json=POST, headers=bearer(admin.id))).json()
    assert (first["slug"], second["slug"]) == ("why-enugu-s-drains-flood", "why-enugu-s-drains-flood-2")
    assert slugify("Plastic & drains — Enugu 2026!") == "plastic-drains-enugu-2026"
    assert slugify("!!!") == "post"


async def test_content_images_must_come_from_our_cloudinary(client: AsyncClient, session: AsyncSession) -> None:
    admin = await make_user(session, "Admin", role=Role.ADMIN)
    bad = await client.post("/api/v1/admin/posts", json={**POST, "cover_url": "https://evil.example/x.jpg"},
                            headers=bearer(admin.id))
    assert bad.status_code == 422
    slide = await client.post("/api/v1/admin/hero-slides", json={"image_url": "https://evil.example/x.jpg",
                              "headline": "Your plastic is money"}, headers=bearer(admin.id))
    assert slide.status_code == 422


async def test_only_admins_upload_content_images(client: AsyncClient, session: AsyncSession) -> None:
    user = await make_user(session, "Chinaza")
    admin = await make_user(session, "Admin", role=Role.ADMIN)
    assert (await client.post("/api/v1/uploads/signature", json={"purpose": "blog"}, headers=bearer(user.id))).status_code == 403
    ok = await client.post("/api/v1/uploads/signature", json={"purpose": "hero"}, headers=bearer(admin.id))
    assert ok.status_code == 200 and ok.json()["folder"] == "plasticash/hero"
    assert (await client.post("/api/v1/uploads/signature", json={"purpose": "request"}, headers=bearer(user.id))).status_code == 200


async def test_events_upcoming_and_past(client: AsyncClient, session: AsyncSession) -> None:
    admin = await make_user(session, "Admin", role=Role.ADMIN)
    base = {"location": "Enugu", "summary": "A clean-up day with schools and estates.", "published": True}
    for title, start, end in (("Later", soon(10), None), ("Sooner", soon(2), None), ("Running now", soon(-1), soon(1)),
                              ("Last month", soon(-30), soon(-29))):
        response = await client.post("/api/v1/admin/events", json={**base, "title": title, "starts_at": start, "ends_at": end},
                                     headers=bearer(admin.id))
        assert response.status_code == 201
    await client.post("/api/v1/admin/events", json={**base, "title": "Draft", "starts_at": soon(3), "published": False},
                      headers=bearer(admin.id))
    upcoming = [e["title"] for e in (await client.get("/api/v1/events")).json()]
    assert upcoming == ["Running now", "Sooner", "Later"]
    assert [e["title"] for e in (await client.get("/api/v1/events?when=past")).json()] == ["Last month"]

    backwards = await client.post("/api/v1/admin/events", json={**base, "title": "Backwards", "starts_at": soon(5),
                                  "ends_at": soon(4)}, headers=bearer(admin.id))
    assert backwards.status_code == 422
    link = await client.post("/api/v1/admin/events", json={**base, "title": "Bad link", "starts_at": soon(5),
                             "link_url": "javascript:alert(1)"}, headers=bearer(admin.id))
    assert link.status_code == 422


async def test_hero_slides_order_and_active(client: AsyncClient, session: AsyncSession) -> None:
    admin = await make_user(session, "Admin", role=Role.ADMIN)
    photo = "https://res.cloudinary.com/testcloud/image/upload/v1/plasticash/hero/a.jpg"
    ids = []
    for headline, position in (("Second", 2), ("First", 1), ("Hidden", 0)):
        r = await client.post("/api/v1/admin/hero-slides", json={"image_url": photo, "headline": headline,
                              "position": position}, headers=bearer(admin.id))
        ids.append(r.json()["id"])
    await client.patch(f"/api/v1/admin/hero-slides/{ids[2]}", json={"active": False}, headers=bearer(admin.id))
    assert [s["headline"] for s in (await client.get("/api/v1/hero-slides")).json()] == ["First", "Second"]
    assert (await client.delete(f"/api/v1/admin/hero-slides/{ids[0]}", headers=bearer(admin.id))).status_code == 204
    assert [s["headline"] for s in (await client.get("/api/v1/hero-slides")).json()] == ["First"]


async def test_users_cannot_write_content(client: AsyncClient, session: AsyncSession) -> None:
    user = await make_user(session, "Chinaza")
    assert (await client.post("/api/v1/admin/posts", json=POST, headers=bearer(user.id))).status_code == 403
    assert (await client.get("/api/v1/admin/events", headers=bearer(user.id))).status_code == 403
