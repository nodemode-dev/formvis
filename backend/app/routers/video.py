"""Video (1.58.9, the parity plan's L1), as Photoshop's File > Import > Video Frames to Layers and its video export:
a clip's frames decoded by ffmpeg, trimmed to a start and an end, every Nth kept, scaled to fit `max_side` and capped
at `max_frames`; and a frame animation encoded to an H.264 MP4, each frame lasting its own delay.

ffmpeg runs as a separate program, never bundled: FORMVIS_FFMPEG, else ffmpeg on the PATH, else imageio-ffmpeg's
binary when that package happens to be installed; without one the routes say how to install it."""
import io
import json
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from starlette.concurrency import run_in_threadpool

router = APIRouter(prefix="/api/video", tags=["video"])
MAX_FRAMES = 300


def _ffmpeg() -> str:
    exe = os.environ.get("FORMVIS_FFMPEG", "").strip() or shutil.which("ffmpeg")
    if not exe:
        try:
            import imageio_ffmpeg
            exe = imageio_ffmpeg.get_ffmpeg_exe()
        except Exception:  # noqa: BLE001 - optional
            exe = None
    if not exe:
        raise HTTPException(status_code=503, detail="Video needs ffmpeg: install it (macOS: brew install ffmpeg; Windows: winget install ffmpeg; Linux: your package manager), or set FORMVIS_FFMPEG to its path.")
    return exe


def _probe(path: Path) -> dict:
    """Size, frame rate and duration from ffmpeg's own report of the file (no ffprobe needed)."""
    r = subprocess.run([_ffmpeg(), "-hide_banner", "-i", str(path)], capture_output=True, text=True, timeout=60)
    text = r.stderr
    video = next((ln for ln in text.splitlines() if "Video:" in ln), "")
    if not video:
        raise HTTPException(status_code=415, detail="That file has no video formvis can read.")
    size = re.search(r"\b(\d{2,5})x(\d{2,5})\b", video)
    fps = re.search(r"([\d.]+) fps", video) or re.search(r"([\d.]+) tbr", video)
    dur = re.search(r"Duration: (\d+):(\d+):([\d.]+)", text)
    seconds = int(dur.group(1)) * 3600 + int(dur.group(2)) * 60 + float(dur.group(3)) if dur else 0.0
    rate = float(fps.group(1)) if fps else 25.0
    return {"width": int(size.group(1)) if size else 0, "height": int(size.group(2)) if size else 0, "fps": rate, "duration": round(seconds, 3), "frames": int(round(seconds * rate))}


async def _saved(file: UploadFile, folder: Path) -> Path:
    path = folder / ("clip" + (Path(file.filename or "").suffix or ".mp4"))
    with open(path, "wb") as f:
        while chunk := await file.read(1 << 20):
            f.write(chunk)
    return path


@router.post("/probe")
async def probe(file: UploadFile = File(...)) -> dict:
    with tempfile.TemporaryDirectory() as tmp:
        path = await _saved(file, Path(tmp))
        return await run_in_threadpool(_probe, path)


def _frames(path: Path, out: Path, start: float, end: float, every: int, max_frames: int, max_side: int) -> dict:
    info = _probe(path)
    w, h = info["width"], info["height"]
    k = min(1.0, max_side / max(1, w, h))
    tw, th = max(2, int(round(w * k / 2)) * 2), max(2, int(round(h * k / 2)) * 2)
    filters = []
    if every > 1:
        filters.append(f"select=not(mod(n\\,{every}))")
    if (tw, th) != (w, h):
        filters.append(f"scale={tw}:{th}:flags=lanczos")
    cmd = [_ffmpeg(), "-hide_banner", "-loglevel", "error", "-ss", f"{max(0.0, start):.3f}", "-i", str(path)]
    if end > start:
        cmd += ["-t", f"{end - max(0.0, start):.3f}"]
    if filters:
        cmd += ["-vf", ",".join(filters)]
    cmd += ["-fps_mode", "vfr", "-frames:v", str(max_frames), str(out / "f%05d.png")]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    pngs = sorted(out.glob("f*.png"))
    if r.returncode != 0 or not pngs:
        raise HTTPException(status_code=422, detail=f"ffmpeg could not read frames from that clip{': ' + r.stderr.strip()[-200:] if r.stderr.strip() else ''}.")
    return {"width": tw, "height": th, "fps": info["fps"], "every": every, "delayMs": int(round(1000 * every / max(0.001, info["fps"]))), "count": len(pngs), "files": pngs}


@router.post("/frames")
async def frames(file: UploadFile = File(...), start: float = Form(0.0), end: float = Form(0.0), every: int = Form(1), max_frames: int = Form(MAX_FRAMES), max_side: int = Form(2048)) -> Response:
    """The clip's frames from `start` to `end` seconds (0: to the end), every `every`th: a 4-byte length, a JSON
    header (width, height, fps, every, delayMs, count, sizes) and the frames as PNGs one after another."""
    every, max_frames, max_side = max(1, every), max(1, min(MAX_FRAMES, max_frames)), max(64, min(4096, max_side))
    with tempfile.TemporaryDirectory() as tmp:
        path = await _saved(file, Path(tmp))
        out = Path(tmp) / "out"
        out.mkdir()
        got = await run_in_threadpool(_frames, path, out, start, end, every, max_frames, max_side)
        blobs = [p.read_bytes() for p in got.pop("files")]
    head = json.dumps({**got, "sizes": [len(b) for b in blobs]}).encode()
    return Response(len(head).to_bytes(4, "little") + head + b"".join(blobs), media_type="application/octet-stream")


def _encode(folder: Path, names: list[str], delays: list[int]) -> bytes:
    # Each frame for its own delay, exactly: the frames are repeated on a common grid of time (the delays' greatest
    # common divisor, up to 60 a second; else 30 a second, each delay rounded to it) and written as a constant-rate
    # image sequence, which players take best. (ffmpeg's concat list added a frame, or drifted to its own time base.)
    from functools import reduce
    from math import gcd
    ms = [d if d > 0 else 33 for d in delays]
    unit = reduce(gcd, ms)
    if unit * 60 >= 1000:
        fps, repeats = 1000 / unit, [d // unit for d in ms]
    else:
        fps, repeats = 30.0, [max(1, round(d * 30 / 1000)) for d in ms]
    if sum(repeats) > 20000:
        raise HTTPException(status_code=422, detail="That animation is too long to write as a video.")
    n = 0
    for name, r in zip(names, repeats):
        for _ in range(r):
            n += 1
            os.link(folder / name, folder / f"s{n:06d}.png")
    out = folder / "out.mp4"
    cmd = [_ffmpeg(), "-hide_banner", "-loglevel", "error", "-framerate", f"{fps:.6g}", "-i", str(folder / "s%06d.png"),
           "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-r", f"{fps:.6g}", "-movflags", "+faststart", str(out)]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=900)
    if r.returncode != 0 or not out.is_file():
        raise HTTPException(status_code=422, detail=f"ffmpeg could not write the video{': ' + r.stderr.strip()[-200:] if r.stderr.strip() else ''}.")
    return out.read_bytes()


@router.post("/encode")
async def encode(file: list[UploadFile] = File(...), delays: str = Form("[]")) -> Response:
    """An H.264 MP4 from frames (PNGs in order) and their delays in milliseconds."""
    try:
        ms = [int(d) for d in json.loads(delays)]
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=422, detail="The frame delays could not be read.") from exc
    if not file or len(ms) != len(file):
        raise HTTPException(status_code=422, detail="Each frame needs its delay.")
    with tempfile.TemporaryDirectory() as tmp:
        folder, names = Path(tmp), []
        for i, f in enumerate(file):
            name = f"f{i + 1:05d}.png"
            (folder / name).write_bytes(await f.read())
            names.append(name)
        data = await run_in_threadpool(_encode, folder, names, ms)
    return Response(data, media_type="video/mp4")
