"""./formvis corpus DIR: the real-file corpus check.

Walks DIR for pictures, sends each to the engine's decoder (POST /api/io/decode) and reports, per file, whether it
opened, the size it decoded to, the time it took and the engine's reason when it did not. A summary by extension and the
failures come last; the report is also written to bench-results/corpus-<date>.json. Exit status 1 when any file that
should open does not. Files named in DIR/expected-failures.txt (one name per line) are expected to be refused, and are
reported as failures if they open. Only the engine is needed; nothing is opened in the window or written to DIR.
"""
from __future__ import annotations

import argparse
import json
import os
import struct
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tif", ".tiff", ".heic", ".heif", ".avif", ".tga", ".ico", ".qoi",
              ".pbm", ".pgm", ".ppm", ".pnm", ".pam", ".fits", ".fit", ".dpx", ".cin", ".dng", ".cr2", ".cr3", ".nef", ".arw", ".orf", ".rw2", ".raf"}


def post(engine: str, name: str, data: bytes) -> tuple[int, bytes]:
    boundary = uuid.uuid4().hex
    body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{name}\"\r\nContent-Type: application/octet-stream\r\n\r\n").encode() + data + f"\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request(engine + "/api/io/decode", data=body, headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as err:
        return err.code, err.read()


def main() -> int:
    ap = argparse.ArgumentParser(prog="formvis corpus")
    ap.add_argument("directory")
    ap.add_argument("--engine", default=os.environ.get("FORMVIS_ENGINE_URL", "http://127.0.0.1:8190"))
    ap.add_argument("--limit", type=int, default=0, help="stop after this many files")
    a = ap.parse_args()
    root = Path(a.directory)
    if not root.is_dir():
        print(f"{root} is not a folder", file=sys.stderr)
        return 2
    expected = set()
    marker = root / "expected-failures.txt"
    if marker.exists():
        expected = {line.strip() for line in marker.read_text().splitlines() if line.strip()}
    files = sorted(p for p in root.rglob("*") if p.is_file() and p.suffix.lower() in EXTENSIONS)
    if a.limit:
        files = files[: a.limit]
    rows: list[dict] = []
    for path in files:
        rel = str(path.relative_to(root))
        data = path.read_bytes()
        start = time.perf_counter()
        status, body = post(a.engine, path.name, data)
        ms = round((time.perf_counter() - start) * 1000, 1)
        row: dict = {"file": rel, "bytes": len(data), "ms": ms, "opened": status == 200 and body[:8] == b"\x89PNG\r\n\x1a\n"}
        if row["opened"]:
            row["width"], row["height"] = struct.unpack(">II", body[16:24])
        else:
            row["reason"] = body[:300].decode("utf-8", "replace")
        row["expected"] = rel in expected or path.name in expected
        rows.append(row)
        mark = "ok  " if row["opened"] else "FAIL"
        print(f"{mark} {rel}  {ms} ms" + (f"  {row['width']}x{row['height']}" if row["opened"] else f"  {row['reason'][:120]}"), flush=True)
    bad = [r for r in rows if r["opened"] == r["expected"]]
    by: dict[str, list[int]] = {}
    for r in rows:
        by.setdefault(Path(r["file"]).suffix.lower(), [0, 0])[0 if r["opened"] else 1] += 1
    print("\nby extension (opened, refused): " + ", ".join(f"{k} {v[0]}/{v[1]}" for k, v in sorted(by.items())))
    print(f"{len(rows)} files, {sum(1 for r in rows if r['opened'])} opened, {len(bad)} not as expected")
    out = ROOT / "bench-results"
    out.mkdir(exist_ok=True)
    (out / f"corpus-{time.strftime('%Y-%m-%d-%H%M%S')}.json").write_text(json.dumps({"directory": str(root), "files": rows}, indent=1))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
