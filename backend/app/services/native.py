"""The native renderer from the engine (DEV_PLAN 28.6): native/formvis-render's command line, run as a subprocess with
JSON on stdout. Nothing runs unless FORMVIS_NATIVE is set, and the engine never depends on it being built."""
from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

from app.core import config

CRATE = config.REPO_DIR / "native" / "formvis-render"
EXE = "formvis-render.exe" if os.name == "nt" else "formvis-render"


class NativeError(RuntimeError):
    pass


def enabled() -> bool:
    return os.environ.get("FORMVIS_NATIVE", "").lower() in ("1", "true", "on", "yes")


def binary() -> Path | None:
    override = os.environ.get("FORMVIS_NATIVE_BIN")
    candidates = [Path(override).expanduser()] if override else []
    candidates.append(CRATE / "target" / "release" / EXE)
    for path in candidates:
        if path.is_file():
            return path
    return None


def _run(args: list[str], timeout: float = 60) -> dict:
    if not enabled():
        raise NativeError("The native renderer is off; start formvis with FORMVIS_NATIVE=1")
    exe = binary()
    if exe is None:
        raise NativeError("The native renderer is not built; run cargo build --release in native/formvis-render")
    try:
        out = subprocess.run([str(exe), *args], capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        raise NativeError("The native renderer did not answer in time") from None
    lines = out.stdout.strip().splitlines()
    try:
        data = json.loads(lines[-1]) if lines else {}
    except ValueError:
        raise NativeError(f"The native renderer failed: {(out.stderr or out.stdout).strip()[-300:]}") from None
    return data


def status() -> dict:
    exe = binary()
    out: dict = {"enabled": enabled(), "available": False, "path": str(exe) if exe else None, "info": None}
    if exe is None or not out["enabled"]:
        return out
    try:
        info = _run(["info"], timeout=30)
    except NativeError as err:
        out["error"] = str(err)
        return out
    out["info"] = info
    out["available"] = bool(info.get("ok"))
    return out


def composite(spec_path: str | Path, out_path: str | Path) -> dict:
    data = _run(["composite", "--spec", str(spec_path), "--out", str(out_path)])
    if not data.get("ok"):
        raise NativeError(f"The native renderer failed: {data.get('error') or 'no result'}")
    return data
