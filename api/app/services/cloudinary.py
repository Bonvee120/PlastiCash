"""Signed direct uploads to Cloudinary (TRD §2): the browser uploads the photo itself with a short-lived signature
from here, and only the resulting URL is saved. The API secret never leaves the server."""
import hashlib
import time
from urllib.parse import urlparse

from app.config import get_settings
from app.errors import ApiError

FOLDERS = {
    "request": "plasticash/requests",
    "weigh": "plasticash/weighing",
    "dispute": "plasticash/disputes",
    # admin content
    "blog": "plasticash/blog",
    "event": "plasticash/events",
    "hero": "plasticash/hero",
}
ADMIN_PURPOSES = {"blog", "event", "hero"}
# Signed, so the browser can't widen it: no SVG (it can carry scripts), PDF or other files.
ALLOWED_FORMATS = "jpg,jpeg,png,webp,heic"


def signature(purpose: str) -> dict:
    settings = get_settings()
    if not (settings.cloudinary_cloud_name and settings.cloudinary_api_key and settings.cloudinary_api_secret):
        raise ApiError(503, "UPLOADS_NOT_CONFIGURED", "Photo uploads are not set up on the server yet.")
    params = {"allowed_formats": ALLOWED_FORMATS, "folder": FOLDERS[purpose], "timestamp": str(int(time.time()))}
    to_sign = "&".join(f"{key}={params[key]}" for key in sorted(params)) + settings.cloudinary_api_secret
    return {
        "cloud_name": settings.cloudinary_cloud_name,
        "api_key": settings.cloudinary_api_key,
        "upload_url": f"https://api.cloudinary.com/v1_1/{settings.cloudinary_cloud_name}/image/upload",
        **params,
        "signature": hashlib.sha1(to_sign.encode()).hexdigest(),
    }


def check_photo_url(url: str, field: str = "photo_url") -> str:
    """Only photos stored in our Cloudinary account are accepted."""
    parsed = urlparse(url)
    cloud = get_settings().cloudinary_cloud_name
    ok = parsed.scheme == "https" and parsed.netloc == "res.cloudinary.com"
    if cloud:
        ok = ok and parsed.path.startswith(f"/{cloud}/")
    if not ok:
        raise ApiError(422, "VALIDATION_ERROR", "Upload the photo again.", {"errors": [{"field": field,
                       "message": "Use a photo uploaded through PlastiCash."}]})
    return url
