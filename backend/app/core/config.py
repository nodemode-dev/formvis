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
def total_memory() -> int:
    """This computer's memory in bytes, or 0 when it cannot be read (1.53.4)."""
    import os
    import sys
    try:
        if sys.platform == "win32":
            import ctypes

            class Status(ctypes.Structure):
                _fields_ = [("dwLength", ctypes.c_ulong), ("dwMemoryLoad", ctypes.c_ulong), ("ullTotalPhys", ctypes.c_ulonglong)] + [(f"f{i}", ctypes.c_ulonglong) for i in range(6)]
            st = Status(); st.dwLength = ctypes.sizeof(Status)
            return int(st.ullTotalPhys) if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(st)) else 0
        return int(os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES"))
    except (ValueError, OSError, AttributeError):
        return 0


def pixel_budget(memory: int) -> int:
    """The largest document, from the machine's memory (1.53.4, the capability plan's L10): a pixel per 40 bytes, never
    below 100 megapixels (formvis's fixed cap until now) and never past 250 (under a browser's canvas area limit)."""
    return max(100_000_000, min(250_000_000, memory // 40)) if memory else 100_000_000


MAX_PIXELS = pixel_budget(total_memory())
MAX_LAYERS = 10_000
MAX_DEPTH = 64
MAX_CLIP_CHAIN = 256
MAX_MANIFEST_BYTES = 4 * 1024 * 1024
MAX_ASSET_BYTES = 512 * 1024 * 1024
SESSION_TTL_SECONDS = 24 * 60 * 60
BACKEND_DIR = Path(__file__).resolve().parents[2]
REPO_DIR = BACKEND_DIR.parent


def _load_env_file() -> None:
    env_file = BACKEND_DIR / ".env"
    if not env_file.is_file():
        return
    for entry in env_file.read_text(encoding="utf-8").splitlines():
        entry = entry.strip()
        if not entry or entry.startswith("#") or "=" not in entry:
            continue
        key, _, value = entry.partition("=")
        key, value = key.strip(), value.strip()
        if key and value:
            os.environ.setdefault(key, value)


_load_env_file()


def _ensure(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def portable_dir() -> Path | None:
    """FormvisData beside the program when --portable (FORMVIS_PORTABLE=1) was given or a file named portable or
    portable.txt sits beside the frozen engine; None otherwise."""
    import sys
    beside = Path(sys.executable).resolve().parent if getattr(sys, "frozen", False) else BACKEND_DIR
    if os.environ.get("FORMVIS_PORTABLE") == "1" or (getattr(sys, "frozen", False) and any((beside / name).is_file() for name in ("portable", "portable.txt"))):
        return beside / "FormvisData"
    return None


def platform_data_dir() -> Path:
    """Where a new install keeps its data by the platform's convention, in a folder named formvis: Application Support on
    macOS, %APPDATA% on Windows, $XDG_DATA_HOME (an absolute path, else ~/.local/share) elsewhere."""
    import sys
    home = Path.home()
    if sys.platform == "darwin":
        return home / "Library" / "Application Support" / "formvis"
    if sys.platform.startswith("win"):
        return Path(os.environ.get("APPDATA") or home / "AppData" / "Roaming") / "formvis"
    base = Path(os.environ.get("XDG_DATA_HOME") or ".")
    return (base if base.is_absolute() else home / ".local" / "share") / "formvis"


def data_dir() -> Path:
    """Order: --user-data-dir or FORMVIS_DATA_DIR, then the portable folder (FORMVIS_PORTABLE=1 or a portable marker file
    beside the engine), then ~/Formvis where an install already has it (its data stays there; nothing is moved), and for
    a new install the platform's own folder."""
    raw = os.environ.get("FORMVIS_DATA_DIR")
    if raw:
        return _ensure(Path(raw).expanduser())
    portable = portable_dir()
    if portable:
        return _ensure(portable)
    path = Path.home() / "Formvis"
    if path.exists() or path.with_name(legacy.FORMER.capitalize()).is_dir():
        legacy.carry_over_library(path)   # the library saved before the rename moves here (core/legacy.py)
        return _ensure(path)
    return _ensure(platform_data_dir())


def data_dir_source() -> str:
    """Why data_dir() is where it is: "override" (--user-data-dir or FORMVIS_DATA_DIR), "portable" or "default"."""
    if os.environ.get("FORMVIS_DATA_DIR"):
        return "override"
    return "portable" if portable_dir() else "default"


def default_projects_dir() -> Path:
    return data_dir() / "Projects"


def projects_dir() -> Path:
    """The library (1.58.8, the parity plan's L13): FORMVIS_LIBRARY_DIR, else the folder chosen in Preferences (kept
    in library.json in the data folder; any folder, a synced one such as iCloud Drive, Dropbox or OneDrive included),
    else the data folder's Projects. A chosen folder that cannot be made falls back to the default."""
    raw = os.environ.get("FORMVIS_LIBRARY_DIR", "").strip()
    if not raw:
        try:
            import json
            raw = str(json.loads((data_dir() / "library.json").read_text()).get("folder", "")).strip()
        except (OSError, ValueError, AttributeError):
            raw = ""
    if raw:
        try:
            return _ensure(Path(raw).expanduser())
        except OSError:
            pass
    return _ensure(default_projects_dir())


def exports_dir() -> Path:
    return _ensure(data_dir() / "Exports")


def sessions_dir() -> Path:
    return _ensure(Path(tempfile.gettempdir()) / "formvis-sessions")


def dist_dir() -> Path | None:
    raw = os.environ.get("FORMVIS_DIST")
    folder = Path(raw).expanduser() if raw else REPO_DIR / "frontend" / "dist"
    return folder if (folder / "index.html").is_file() else None


def is_desktop() -> bool:
    return os.environ.get("FORMVIS_DESKTOP") == "1"


def cors_origins() -> list[str]:
    raw = os.environ.get("FORMVIS_CORS_ORIGINS")
    if raw:
        return [item.strip() for item in raw.split(",") if item.strip()]
    return [f"http://localhost:{FRONTEND_PORT}", f"http://127.0.0.1:{FRONTEND_PORT}"]
