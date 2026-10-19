"""Relight's Python runtime: torch and the moge package for MoGe-2, which the engine itself cannot pip-install
when it is a frozen desktop app. Installed as a job into an environment of its own under models/relight-runtime (the
pattern of Krea 2's runtime), from backend/requirements_relight.txt, and MoGe-2 then runs in a subprocess of that
environment. If the engine's own Python already has moge and torch, that is used and nothing is installed."""
from __future__ import annotations

import hashlib
import importlib.util
import json
import platform
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import numpy as np

from . import jobs
from .paths import MODELS_DIR

RUNTIME = MODELS_DIR / "relight-runtime"
REQUIREMENTS_FILE = Path(__file__).resolve().parents[2] / "requirements_relight.txt"
# the same pins as requirements_relight.txt, for an engine that ships without that file
PINNED = [
    "--extra-index-url https://download.pytorch.org/whl/cpu",
    "torch==2.8.0",
    "diffusers==0.41.0",
    "transformers==5.20.1",
    "accelerate==1.15.0",
    "safetensors==0.8.0",
    "moge @ git+https://github.com/microsoft/MoGe.git@74fbce054ebed49800de42d0ad0e83495065719a",
]
SIZE_NOTE = "PyTorch is large: about 1 to 2 GB on a CPU-only computer."
_job: str | None = None


def runtime_python() -> Path:
    return RUNTIME / ("Scripts/python.exe" if platform.system() == "Windows" else "bin/python")


def engine_has_moge() -> bool:
    try:
        return importlib.util.find_spec("moge") is not None and importlib.util.find_spec("torch") is not None
    except (ImportError, ValueError):
        return False


def installed() -> bool:
    """The environment of its own is made and holds moge and torch."""
    try:
        marker = json.loads((RUNTIME / "installed.json").read_text(encoding="utf-8"))
        return runtime_python().is_file() and bool(marker.get("moge"))
    except (OSError, ValueError):
        return False


def requirements() -> list[str]:
    try:
        lines = [x.split(" #")[0].strip() for x in REQUIREMENTS_FILE.read_text(encoding="utf-8").splitlines()]
        found = [x for x in lines if x and not x.startswith("#")]
        if found:
            return found
    except OSError:
        pass
    return list(PINNED)


def _base_python() -> str:
    """A Python to make the environment with: this one, unless the engine is a frozen app."""
    if not getattr(sys, "frozen", False):
        return sys.executable
    found = shutil.which("python3") or shutil.which("python")
    if not found:
        raise RuntimeError("The Relight runtime needs a Python of its own: install Python 3.10 or later and try again")
    return found


def _make_environment() -> None:
    if runtime_python().is_file():
        return
    done = subprocess.run([_base_python(), "-m", "venv", str(RUNTIME)], capture_output=True, text=True)
    if done.returncode:
        raise RuntimeError(f"Could not make the runtime environment: {(done.stderr or done.stdout).strip()[-300:]}")


def _pip(python: Path, listing: Path, report, cancelled) -> None:
    """pip install -r, followed line by line: the bar moves with the packages collected and installed."""
    command = [str(python), "-m", "pip", "install", "--disable-pip-version-check", "--no-input", "--progress-bar", "off", "-r", str(listing)]
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, errors="replace")
    seen, tail = 0, []
    try:
        for line in process.stdout:
            if cancelled():
                process.terminate()
                raise InterruptedError("cancelled")
            line = line.strip()
            if not line:
                continue
            tail = (tail + [line])[-6:]
            if line.startswith(("Collecting", "Downloading", "Using cached")):
                seen += 1
                report(0.1 + 0.8 * (1 - 0.93 ** seen), line[:120])
            elif line.startswith("Installing collected"):
                report(0.92, "Installing the packages")
        if process.wait():
            raise RuntimeError("pip could not install the packages: " + " ".join(tail)[-300:])
    finally:
        if process.poll() is None:
            process.kill()


def _verify(python: Path) -> None:
    done = subprocess.run([str(python), "-I", "-c", "import torch, moge.model.v2"], capture_output=True, text=True)
    if done.returncode:
        raise RuntimeError("The packages installed but MoGe-2 does not import: " + (done.stderr or done.stdout).strip()[-300:])


def install(report, cancelled) -> dict:
    """The job: the environment, the packages of requirements_relight.txt, a check that MoGe-2 imports."""
    if engine_has_moge():
        report(1.0, "The engine already has torch and moge")
        return status()
    if not shutil.which("git") and any("git+" in x for x in requirements()):
        raise RuntimeError("The moge package installs from GitHub: install git and try again")
    RUNTIME.mkdir(parents=True, exist_ok=True)
    report(0.02, "Making the runtime environment")
    _make_environment()
    if cancelled():
        raise InterruptedError("cancelled")
    listing = RUNTIME / "requirements.txt"
    listing.write_text("\n".join([*requirements(), "numpy"]) + "\n", encoding="utf-8")
    report(0.1, "Installing torch and moge (large)")
    _pip(runtime_python(), listing, report, cancelled)
    report(0.95, "Checking MoGe-2 imports")
    _verify(runtime_python())
    (RUNTIME / "installed.json").write_text(json.dumps({
        "moge": True, "requirements": hashlib.sha256("\n".join(requirements()).encode()).hexdigest(), "installed": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }), encoding="utf-8")
    return status()


def active_job() -> str | None:
    global _job
    if _job:
        try:
            if jobs.status(_job)["status"] in ("queued", "running"):
                return _job
        except Exception:
            pass
        _job = None
    return None


def start() -> dict:
    global _job
    running = active_job()
    if running:
        return {"job_id": running}
    _job = jobs.submit("relight-runtime-install", lambda _id, report, cancelled: install(report, cancelled))["job_id"]
    return {"job_id": _job}


def status() -> dict:
    here = engine_has_moge()
    return {"ready": here or installed(), "engine": here, "environment": installed(), "sizeNote": SIZE_NOTE, "job": active_job(),
            "python": str(runtime_python()) if installed() else None}


_RUNNER = """
import sys, numpy as np, torch
from moge.model.v2 import MoGeModel
model_file, source, target = sys.argv[1], sys.argv[2], sys.argv[3]
rgb = np.load(source)
model = MoGeModel.from_pretrained(model_file).eval()
with torch.inference_mode():
    out = model.infer(torch.from_numpy(rgb.astype(np.float32) / 255).permute(2, 0, 1), use_fp16=False)
np.savez(target, normal=out["normal"].cpu().numpy(), depth=out["depth"].cpu().numpy(), intrinsics=out["intrinsics"].cpu().numpy())
"""


def infer(rgb: np.ndarray, model_file: str, timeout: int = 900) -> dict:
    """MoGe-2 in the runtime's Python: the picture (uint8 RGB) in, the normals, depth and intrinsics out as arrays."""
    with tempfile.TemporaryDirectory(prefix="formvis-moge-") as folder:
        work = Path(folder)
        np.save(work / "in.npy", rgb)
        (work / "run.py").write_text(_RUNNER, encoding="utf-8")
        done = subprocess.run([str(runtime_python()), "-I", str(work / "run.py"), model_file, str(work / "in.npy"), str(work / "out.npz")],
                              capture_output=True, text=True, timeout=timeout)
        if done.returncode:
            raise RuntimeError((done.stderr or done.stdout).strip()[-300:])
        with np.load(work / "out.npz") as out:
            return {k: out[k] for k in ("normal", "depth", "intrinsics")}
