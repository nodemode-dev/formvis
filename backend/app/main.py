import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core import config
from app.routers import comfyui, generative, io, large, llm, mcp, ops, plugins, projects, system, nodemode, colour
from app.services import claude_code as _claude_service, sessions, terminal as _terminal_service


@asynccontextmanager
async def lifespan(_: FastAPI):
    sessions.prune()
    _terminal_service.bind(asyncio.get_running_loop())
    yield
    _claude_service.stop(quiet=True)
    _terminal_service.close_all()


app = FastAPI(title=config.APP_NAME, version=config.VERSION, lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=config.cors_origins(), allow_methods=["*"], allow_headers=["*"])
app.include_router(system.router, prefix="/api")
app.include_router(io.router, prefix="/api/io")
app.include_router(projects.router, prefix="/api/projects")
app.include_router(ops.router, prefix="/api/ops")
app.include_router(colour.router, prefix="/api/color")   # colour management (1.53.5)
from app.routers import remove_find  # noqa: E402  (Remove's People and Distractions, 1.57.4)
app.include_router(remove_find.router)
from app.routers import merge  # noqa: E402  (Photomerge and Merge to HDR, 1.58.2)
app.include_router(merge.router)
from app.routers import video  # noqa: E402  (Video Frames to Layers and MP4 export, 1.58.9)
app.include_router(video.router)
from app.routers import undo  # noqa: E402  (the undo store, 1.60.8, DEV_PLAN 26.3)
app.include_router(undo.router)
undo.clear()   # nothing kept outlives the session that made it
from app.routers import bands  # noqa: E402  (pictures written a band at a time, 1.61.2, DEV_PLAN 26.4)
app.include_router(bands.router)
bands.clear()
from app.routers import seam as _seam  # noqa: E402  (1.55.4)
app.include_router(_seam.router, prefix="/api/seam")   # Content-Aware Scale (1.55.4, M4)
app.include_router(generative.router, prefix="/api/generative")
app.include_router(nodemode.router)   # Send to NodeMode, standalone (1.50.8); its prefix is its own
app.include_router(comfyui.router)   # Send to ComfyUI (1.50.9); its prefix is its own
app.include_router(llm.router)   # prompt improvement (1.51.5); its prefix is its own
app.include_router(mcp.router)   # the MCP server at /mcp and the window's bridge (1.52.1)
from app.routers import commands as _commands  # noqa: E402  (the command catalogue, DEV_PLAN 28.3)
app.include_router(_commands.router)
from app.routers import agents as _agents_router  # noqa: E402  (Window > Agent Connect, DEV_PLAN 28.4)
app.include_router(_agents_router.router)
app.include_router(plugins.router)   # plugins (1.52.6); its prefix is its own
app.include_router(large.router)   # pictures larger than formvis edits in one piece (1.52.7)
from app.routers import native as _native  # noqa: E402  (the native renderer's status, DEV_PLAN 28.6)
app.include_router(_native.router)
from app.routers import terminal as _terminal_router  # noqa: E402  (the window's terminals, DEV_PLAN 28.5)
app.include_router(_terminal_router.router)
from app.routers import claude_code as _claude_router  # noqa: E402  (Claude Code in the window, DEV_PLAN 28.5)
app.include_router(_claude_router.router)
# Local image generation (1.52.9), from formcut's engine: jobs, model downloads, Krea 2, FLUX.2 [klein], LoRAs, checkpoints.
from app.localgen import checkpoints as _lg_checkpoints, generate as _lg_generate, jobs as _lg_jobs, klein as _lg_klein, krea2 as _lg_krea2, loras as _lg_loras, model_manager as _lg_models  # noqa: E402
from app.localgen import ai_upscale as _lg_upscale  # noqa: E402  (1.53.1)
from app.localgen import inpaint as _lg_inpaint  # noqa: E402  (1.53.2)
from app.localgen import depth as _lg_depth  # noqa: E402  (1.54.8)
from app.localgen import colorize as _lg_colorize  # noqa: E402  (1.54.9)
from app.localgen import style as _lg_style  # noqa: E402  (1.55.1)
from app.localgen import face as _lg_face  # noqa: E402  (1.56.7)
from app.localgen import sky as _lg_sky  # noqa: E402  (1.57.6)
from app.localgen import relight_split as _lg_relight  # noqa: E402  (1.75.0)
for _router in (_lg_jobs.router, _lg_models.router, _lg_krea2.router, _lg_klein.router, _lg_loras.router, _lg_checkpoints.router, _lg_generate.router, _lg_upscale.router, _lg_inpaint.router, _lg_depth.router, _lg_colorize.router, _lg_style.router, _lg_relight.router, _lg_face.router, _lg_sky.router):
    app.include_router(_router)

_dist = config.dist_dir()
if _dist is not None:
    app.mount("/", StaticFiles(directory=str(_dist), html=True), name="frontend")
