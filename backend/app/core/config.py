import os

from app.core import legacy
import tempfile
from pathlib import Path

from app import __version__

APP_NAME = "formvis"
VERSION = __version__
FRONTEND_PORT = 5190
BACKEND_PORT = 8190
MAX_SIDE = 30_000
MAX_PIXELS = 100_000_000
MAX_LAYERS = 10_000
MAX_DEPTH = 64
MAX_CLIP_CHAIN = 256
MAX_MANIFEST_BYTES = 4 * 1024 * 1024
MAX_ASSET_BYTES = 512 * 1024 * 1024
SESSION_TTL_SECONDS = 24 * 60 * 60
BACKEND_DIR = Path(__file__).resolve().parents[2]
REPO_DIR = BACKEND_DIR.parent


def _load_env_file() -> None:
    env = BACKEND_DIR / ".env"
    if not env.is_file():
        return
    for line in env.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        if value.strip():
            os.environ.setdefault(key.strip(), value.strip())


_load_env_file()


def _ensure(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def data_dir() -> Path:
    raw = os.environ.get("FORMVIS_DATA_DIR")
    if raw:
        return _ensure(Path(raw).expanduser())
    path = Path.home() / "Formvis"
    legacy.carry_over_library(path)   # the library saved before the rename moves here (core/legacy.py)
    return _ensure(path)


def projects_dir() -> Path:
    return _ensure(data_dir() / "Projects")


def exports_dir() -> Path:
    return _ensure(data_dir() / "Exports")


def sessions_dir() -> Path:
    return _ensure(Path(tempfile.gettempdir()) / "formvis-sessions")


def dist_dir() -> Path | None:
    raw = os.environ.get("FORMVIS_DIST")
    candidate = Path(raw) if raw else REPO_DIR / "frontend" / "dist"
    return candidate if (candidate / "index.html").is_file() else None


def is_desktop() -> bool:
    return os.environ.get("FORMVIS_DESKTOP") == "1"


def cors_origins() -> list[str]:
    raw = os.environ.get("FORMVIS_CORS_ORIGINS")
    if raw:
        return [origin.strip() for origin in raw.split(",") if origin.strip()]
    return [f"http://localhost:{FRONTEND_PORT}", f"http://127.0.0.1:{FRONTEND_PORT}"]
