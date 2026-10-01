from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core import config
from app.routers import comfyui, generative, io, large, llm, mcp, ops, plugins, projects, system, nodemode, colour
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
app.include_router(colour.router, prefix="/api/color")   # colour management (1.53.5)
from app.routers import seam as _seam  # noqa: E402  (1.55.4)
app.include_router(_seam.router, prefix="/api/seam")   # Content-Aware Scale (1.55.4, M4)
app.include_router(generative.router, prefix="/api/generative")
app.include_router(nodemode.router)   # Send to NodeMode, standalone (1.50.8); its prefix is its own
app.include_router(comfyui.router)   # Send to ComfyUI (1.50.9); its prefix is its own
app.include_router(llm.router)   # prompt improvement (1.51.5); its prefix is its own
app.include_router(mcp.router)   # the MCP server at /mcp and the window's bridge (1.52.1)
app.include_router(plugins.router)   # plugins (1.52.6); its prefix is its own
app.include_router(large.router)   # pictures larger than formvis edits in one piece (1.52.7)
# Local image generation (1.52.9), from formcut's engine: jobs, model downloads, Krea 2, FLUX.2 [klein], LoRAs, checkpoints.
from app.localgen import checkpoints as _lg_checkpoints, generate as _lg_generate, jobs as _lg_jobs, klein as _lg_klein, krea2 as _lg_krea2, loras as _lg_loras, model_manager as _lg_models  # noqa: E402
from app.localgen import ai_upscale as _lg_upscale  # noqa: E402  (1.53.1)
from app.localgen import inpaint as _lg_inpaint  # noqa: E402  (1.53.2)
from app.localgen import depth as _lg_depth  # noqa: E402  (1.54.8)
from app.localgen import colorize as _lg_colorize  # noqa: E402  (1.54.9)
from app.localgen import style as _lg_style  # noqa: E402  (1.55.1)
from app.localgen import face as _lg_face  # noqa: E402  (1.56.7)
for _router in (_lg_jobs.router, _lg_models.router, _lg_krea2.router, _lg_klein.router, _lg_loras.router, _lg_checkpoints.router, _lg_generate.router, _lg_upscale.router, _lg_inpaint.router, _lg_depth.router, _lg_colorize.router, _lg_style.router, _lg_face.router):
    app.include_router(_router)

_dist = config.dist_dir()
if _dist is not None:
    app.mount("/", StaticFiles(directory=str(_dist), html=True), name="frontend")
