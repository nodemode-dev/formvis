import re
import secrets
import shutil
import time
from pathlib import Path

from app.core import config
from app.services.project_format import safe_name

SID = re.compile(r"^[a-f0-9]{32}$")


def prune() -> None:
    now = time.time()
    for entry in config.sessions_dir().iterdir():
        if entry.is_dir() and now - entry.stat().st_mtime > config.SESSION_TTL_SECONDS:
            shutil.rmtree(entry, ignore_errors=True)


def create(assets: dict[str, bytes]) -> str:
    prune()
    sid = secrets.token_hex(16)
    folder = config.sessions_dir() / sid / "images"
    folder.mkdir(parents=True)
    for name, data in assets.items():
        (folder / name).write_bytes(data)
    return sid


def asset_path(sid: str, name: str) -> Path | None:
    if not SID.match(sid or "") or not safe_name(name):
        return None
    path = config.sessions_dir() / sid / "images" / name
    return path if path.is_file() else None


def payload(sid: str, manifest: dict, assets: dict[str, bytes], name: str) -> dict:
    return {"session": sid, "name": name, "manifest": manifest, "images": {key: f"/api/projects/session/{sid}/{key}" for key in assets}}
