from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core import config
from app.routers import comfyui, generative, io, large, llm, mcp, ops, plugins, projects, system, nodemode
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
app.include_router(nodemode.router)   # Send to NodeMode, standalone (1.50.8); its prefix is its own
app.include_router(comfyui.router)   # Send to ComfyUI (1.50.9); its prefix is its own
app.include_router(llm.router)   # prompt improvement (1.51.5); its prefix is its own
app.include_router(mcp.router)   # the MCP server at /mcp and the window's bridge (1.52.1)
app.include_router(plugins.router)   # plugins (1.52.6); its prefix is its own
app.include_router(large.router)   # pictures larger than formvis edits in one piece (1.52.7)

_dist = config.dist_dir()
if _dist is not None:
    app.mount("/", StaticFiles(directory=str(_dist), html=True), name="frontend")
