from fastapi import APIRouter, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.errors import install_error_handlers
from app.routers import admin, admin_content, admin_ops, collector, content, jobs, me, pickups, prices, push, wallet, webhooks

docs = get_settings().api_docs
app = FastAPI(
    title="PlastiCash API",
    docs_url="/docs" if docs else None,
    redoc_url="/redoc" if docs else None,
    openapi_url="/openapi.json" if docs else None,
)
install_error_handlers(app)

# The API serves JSON (and the ESG PDF) only: nothing on it should run scripts, be framed or be sniffed as HTML.
SECURITY_HEADERS = {
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
}


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    for name, value in SECURITY_HEADERS.items():
        response.headers.setdefault(name, value)
    return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=[get_settings().frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api = APIRouter(prefix="/api/v1")


@api.get("/health")
async def health() -> dict:
    return {"ok": True}


api.include_router(me.router)
api.include_router(prices.router)
api.include_router(pickups.router)
api.include_router(collector.router)
api.include_router(wallet.router)
api.include_router(admin.router)
api.include_router(admin_ops.router)
api.include_router(webhooks.router)
api.include_router(jobs.router)
api.include_router(push.router)
api.include_router(content.router)
api.include_router(admin_content.router)
app.include_router(api)
