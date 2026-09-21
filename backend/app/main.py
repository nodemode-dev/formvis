from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core import config
from app.routers import generative, io, ops, projects, system
from app.services import sessions


@asynccontextmanager
async def lifespan(_: FastAPI):
    sessions.prune()
    yield


app = FastAPI(title=config.APP_NAME, version=config.VERSION, lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=config.cors_origins(), allow_methods=["*"], allow_headers=["*"])
app.include_router(system.router, prefix="/api")
app.include_router(io.router, prefix="/api/io")
app.include_router(projects.router, prefix="/api/projects")
app.include_router(ops.router, prefix="/api/ops")
app.include_router(generative.router, prefix="/api/generative")

_dist = config.dist_dir()
if _dist is not None:
    app.mount("/", StaticFiles(directory=str(_dist), html=True), name="frontend")
