#!/usr/bin/env python3
"""Copies the three browser demos' photographs into the app build, so Home > Demos and Help > Demos open them in the
real window.

The demos in demo/ (painting), demos/retouch and demos/design carry their photographs as JavaScript data packs (base64
of a JPEG, and for some a grey PNG mask, for file://). This writes each pack's bytes unchanged as plain files under
frontend/public/demos/<demo>/ (<name>.jpg, and <name>-mask.png when the pack has a mask), with media.json naming them,
which Vite copies into frontend/dist and the desktop app serves from there. Only the packs each demo's session uses are
copied, and every one is listed in that demo's CREDITS.md. Run from anywhere:

    python3 scripts/demo-media.py
"""
from __future__ import annotations

import base64
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "frontend" / "public" / "demos"
PACKS = {
    "paint": ("demo/assets/media", ["tray-night", "mist", "sky", "mountains", "birds", "balloon", "tray-lake", "tray-larch", "tray-surf", "tray-dunes", "tray-glacier"]),
    "retouch": ("demos/retouch/assets/media", ["golden-portrait", "golden-chain"]),
    "design": ("demos/design/assets/media", ["lanterns", "tree", "bokeh"]),
}
FIELD = re.compile(r'"?(img|mask)"?\s*:\s*"data:(image/[a-z+]+);base64,([A-Za-z0-9+/=]+)"')
EXT = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}


def main() -> None:
    for demo, (folder, names) in PACKS.items():
        dest = OUT / demo
        dest.mkdir(parents=True, exist_ok=True)
        table: dict[str, dict[str, str]] = {}
        for name in names:
            text = (ROOT / folder / f"{name}.js").read_text()
            entry: dict[str, str] = {}
            for field, mime, data in FIELD.findall(text):
                file = f"{name}{'-mask' if field == 'mask' else ''}{EXT[mime]}"
                (dest / file).write_bytes(base64.b64decode(data))
                entry[field] = file
            if "img" not in entry:
                raise SystemExit(f"{folder}/{name}.js: no picture in the pack")
            table[name] = entry
        (dest / "media.json").write_text(json.dumps(table, indent=1) + "\n")
        size = sum(p.stat().st_size for p in dest.iterdir())
        print(f"{demo}: {len(table)} photographs, {size / 1e6:.2f} MB in {dest.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
