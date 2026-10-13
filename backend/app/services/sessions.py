import re
import secrets
import shutil
import time
from pathlib import Path

from app.core import config
from app.services.project_format import safe_name

SID = re.compile(r"\A[0-9a-f]{32}\Z")


def prune() -> None:
    cutoff = time.time() - config.SESSION_TTL_SECONDS
    for folder in config.sessions_dir().iterdir():
        if folder.is_dir() and folder.stat().st_mtime < cutoff:
            shutil.rmtree(folder, ignore_errors=True)


def create(assets: dict[str, bytes]) -> str:
    prune()
    sid = secrets.token_bytes(16).hex()
    images = config.sessions_dir() / sid / "images"
    images.mkdir(parents=True, exist_ok=True)
    for asset_name, blob in assets.items():
        (images / asset_name).write_bytes(blob)
    return sid


def asset_path(sid: str, name: str) -> Path | None:
    if not sid or not SID.fullmatch(sid) or not safe_name(name):
        return None
    found = config.sessions_dir() / sid / "images" / name
    return found if found.is_file() else None


def payload(sid: str, manifest: dict, assets: dict[str, bytes], name: str) -> dict:
    return {"session": sid, "name": name, "manifest": manifest, "images": {key: f"/api/projects/session/{sid}/{key}" for key in assets}}
