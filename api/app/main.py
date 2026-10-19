from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.errors import install_error_handlers
from app.routers import admin, admin_content, admin_ops, collector, content, jobs, me, pickups, prices, push, wallet, webhooks

app = FastAPI(title="PlastiCash API")
install_error_handlers(app)

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
