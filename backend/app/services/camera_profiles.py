"""Camera profiles for Camera Raw import and Develop (DEV_PLAN 28.2): the `.dcp` files found in formvis's own
CameraProfiles folder and in the shared system folder other raw converters keep theirs in, matched to the camera a RAW file came from.
The matching is by the profile's UniqueCameraModel against the file's make and model (spaces, case, punctuation and
a repeated make ignored); a profile's tables are read only when it is used."""

from __future__ import annotations

import hashlib
import os
import re
import struct
import sys
from pathlib import Path

from app.core import config
from app.services import dcp

MAX_FILES = 6000
PREFERRED = ("adobe color", "adobe standard", "camera standard")
NOISE = {"corporation", "corp", "co", "ltd", "inc", "company", "camera", "cameras", "digital", "imaging", "electric", "industry"}
_cache: dict[str, tuple[float, int, dict]] = {}


def folders() -> list[Path]:
    """Where profiles are looked for: formvis's own folder first, any named in FORMVIS_CAMERA_PROFILE_DIRS, then the
    shared folder other raw converters use on this system."""
    out = [config.data_dir() / "CameraProfiles"]
    extra = os.environ.get("FORMVIS_CAMERA_PROFILE_DIRS")
    if extra:
        out += [Path(p) for p in extra.split(os.pathsep) if p]
    home = Path.home()
    if sys.platform == "darwin":
        out += [home / "Library/Application Support/Adobe/CameraRaw/CameraProfiles", Path("/Library/Application Support/Adobe/CameraRaw/CameraProfiles")]
    elif sys.platform == "win32":
        out += [Path(os.environ.get("APPDATA", str(home / "AppData/Roaming"))) / "Adobe/CameraRaw/CameraProfiles", Path(os.environ.get("PROGRAMDATA", "C:/ProgramData")) / "Adobe/CameraRaw/CameraProfiles"]
    return out


def _files() -> list[Path]:
    seen, out = set(), []
    for d in folders():
        if not d.is_dir():
            continue
        try:
            for path in d.rglob("*"):
                if path.suffix.lower() != ".dcp" or not path.is_file():
                    continue
                key = str(path.resolve())
                if key in seen:
                    continue
                seen.add(key)
                out.append(path)
                if len(out) >= MAX_FILES:
                    return out
        except OSError:
            continue
    return out


def _entry(path: Path) -> dict | None:
    try:
        st = path.stat()
        key = str(path)
        hit = _cache.get(key)
        if hit and hit[0] == st.st_mtime and hit[1] == st.st_size:
            return hit[2]
        with open(path, "rb") as fh:
            info = dcp.names(fh, st.st_size)
        entry = {"id": hashlib.sha1(f"{key}|{st.st_size}".encode()).hexdigest()[:16], "name": info["name"] or path.stem, "camera": info["camera"], "file": path.name, "path": key}
        _cache[key] = (st.st_mtime, st.st_size, entry)
        return entry
    except (OSError, dcp.DcpError):
        return None


def catalogue() -> list[dict]:
    """Every readable profile in the folders (name and camera only)."""
    return [e for e in (_entry(p) for p in _files()) if e]


def _norm(text: str) -> str:
    words = re.sub(r"[^a-z0-9]+", " ", text.lower()).split()
    return " ".join(w for w in words if w not in NOISE)


def _tiff_fields(data: bytes) -> dict:
    """Make, model and unique camera model from the first directory of a TIFF-structured file (DNG, CR2, NEF, ARW, ORF,
    RW2, PEF and the like), as far as the bytes given reach."""
    order = {b"II": "<", b"MM": ">"}.get(data[:2])
    if not order or len(data) < 8:
        return {}
    (offset,) = struct.unpack(order + "I", data[4:8])
    try:
        count = struct.unpack(order + "H", data[offset : offset + 2])[0]
        out = {}
        for i in range(min(count, 512)):
            raw = data[offset + 2 + i * 12 : offset + 14 + i * 12]
            tag, kind, n = struct.unpack(order + "HHI", raw[:8])
            if tag not in (271, 272, 50708) or kind != 2 or n > 256:
                continue
            at = struct.unpack(order + "I", raw[8:12])[0] if n > 4 else offset + 2 + i * 12 + 8
            out[tag] = data[at : at + n].split(b"\0")[0].decode("utf-8", "replace").strip()
        return {"make": out.get(271, ""), "model": out.get(272, ""), "unique": out.get(50708, "")}
    except (struct.error, IndexError):
        return {}


def camera_of(data: bytes) -> dict:
    """The camera a RAW file came from, as far as its first bytes say: {"make", "model", "unique"}, empty strings where
    unknown. Canon CR3 keeps a TIFF block in its CMT1 box and Fujifilm RAF names the camera in its header."""
    head = data[: 8 * 1024 * 1024]
    if head.startswith(b"FUJIFILMCCD-RAW"):
        return {"make": "FUJIFILM", "model": head[28:60].split(b"\0")[0].decode("ascii", "replace").strip(), "unique": ""}
    found = _tiff_fields(head)
    if not found:
        i = head.find(b"CMT1")
        if i >= 0:
            found = _tiff_fields(head[i + 4 :])
    return {"make": found.get("make", ""), "model": found.get("model", ""), "unique": found.get("unique", "")}


def matches(camera: dict, entry_camera: str) -> bool:
    if not entry_camera:
        return False
    want = _norm(entry_camera)
    make, model = camera.get("make", ""), camera.get("model", "")
    return want in {_norm(camera.get("unique", "")), _norm(model), _norm(f"{make} {model}")} - {""}


def for_camera(camera: dict) -> list[dict]:
    """The profiles made for this camera, preferred names first."""
    found = [e for e in catalogue() if matches(camera, e["camera"])]
    rank = lambda e: (PREFERRED.index(e["name"].lower()) if e["name"].lower() in PREFERRED else len(PREFERRED), e["name"].lower())
    return sorted(found, key=rank)


def automatic(camera: dict) -> dict | None:
    """The profile a RAW file opens with when none is chosen: the first matching profile named like the common defaults,
    or none (the engine's own development stays)."""
    for e in for_camera(camera):
        if e["name"].lower() in PREFERRED:
            return e
    return None


def load(pid: str) -> tuple[dict, dcp.Dcp]:
    """A listed profile read in full; DcpError when it is gone or damaged."""
    for e in catalogue():
        if e["id"] == pid:
            try:
                return e, dcp.parse(Path(e["path"]).read_bytes())
            except OSError as exc:
                raise dcp.DcpError("The profile file could not be read.") from exc
    raise dcp.DcpError("That camera profile is no longer in the profile folders.")
