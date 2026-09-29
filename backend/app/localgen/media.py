"""Where generated pictures go in formvis (formcut's media library stands here): the data folder's generated
pictures, each with its record, served by address for the window to take into the document, then removed."""

import json
import shutil
import uuid
from pathlib import Path

from .paths import DATA_DIR

LIBRARY = DATA_DIR / "generated" / "pictures"


def ingest_path(path: Path, name: str, extra: dict | None = None) -> dict:
    LIBRARY.mkdir(parents=True, exist_ok=True)
    pid = uuid.uuid4().hex
    dest = LIBRARY / f"{pid}{Path(path).suffix.lower() or '.png'}"
    shutil.copyfile(path, dest)
    record = {"id": pid, "name": name, "url": f"/api/generate/pictures/{pid}", **(extra or {})}
    (LIBRARY / f"{pid}.json").write_text(json.dumps(record), encoding="utf-8")
    return record


def find(pid: str) -> Path | None:
    if not (len(pid) == 32 and all(c in "0123456789abcdef" for c in pid)):
        return None
    return next((p for p in LIBRARY.glob(pid + ".*") if p.suffix != ".json"), None)


def forget(pid: str) -> None:
    if find(pid) is None:
        return
    for p in LIBRARY.glob(pid + ".*"):
        p.unlink(missing_ok=True)
