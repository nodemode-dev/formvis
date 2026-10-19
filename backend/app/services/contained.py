"""OpenEXR in a separate process (1.54.4, the parity plan's L14).

OpenCV leaves its OpenEXR codec off because the parser has had security problems with untrusted files
(opencv/opencv#21326), and an EXR downloaded from elsewhere is untrusted. The engine keeps the codec off; an EXR is
decoded or encoded by a child interpreter that turns it on for itself alone. If that child crashes or hangs, the
engine is untouched and the request fails cleanly.
"""

from __future__ import annotations

import multiprocessing as mp
import os
import queue
import time

import numpy as np

EXR_MAGIC = b"\x76\x2f\x31\x01"
TIMEOUT_S = 60.0


def _decode_worker(data: bytes, q: "mp.Queue[object]") -> None:
    os.environ["OPENCV_IO_ENABLE_OPENEXR"] = "1"
    try:
        import cv2
        img = None
        try:
            img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_UNCHANGED)
        except Exception:
            img = None   # an OpenCV build without the OpenEXR codec (5.0 ships none): the OpenEXR binding reads it below
        if img is None:
            img = _binding_decode(data)
        q.put(None if img is None else np.ascontiguousarray(img))
    except Exception:
        q.put(None)


def _binding_decode(data: bytes) -> "np.ndarray | None":
    """A single-part EXR through the OpenEXR binding, as OpenCV returns it (BGR or BGRA, or one plane, float32)."""
    try:
        import io
        import OpenEXR
        f = OpenEXR.File(io.BytesIO(data))
        chans = f.parts[0].channels
        key = next((k for k in chans if k.split(".")[-1] == "RGBA"), None) or next((k for k in chans if k.split(".")[-1] == "RGB"), None) or next(iter(chans), None)
        if key is None:
            return None
        px = np.asarray(chans[key].pixels, dtype=np.float32)
        if px.ndim == 3 and px.shape[2] >= 3:
            px = px[:, :, [2, 1, 0] + ([3] if px.shape[2] >= 4 else [])]
        return np.ascontiguousarray(px)
    except Exception:
        return None


EXR_COMPRESSIONS = {"none": "NO_COMPRESSION", "rle": "RLE_COMPRESSION", "zips": "ZIPS_COMPRESSION", "zip": "ZIP_COMPRESSION", "piz": "PIZ_COMPRESSION",
                    "pxr24": "PXR24_COMPRESSION", "b44": "B44_COMPRESSION", "b44a": "B44A_COMPRESSION", "dwaa": "DWAA_COMPRESSION", "dwab": "DWAB_COMPRESSION"}


def _binding_encode(img: np.ndarray, opts: "dict | None" = None) -> "bytes | None":
    """`img` (BGR or BGRA or one plane, float32) as EXR bytes through the OpenEXR binding. `opts`: `compression` (a key of
    EXR_COMPRESSIONS, ZIP by default), `half` for 16-bit float channels, `channels` rgba, rgb, ya or y."""
    try:
        import os
        import tempfile
        import OpenEXR
        opts = opts or {}
        px = np.ascontiguousarray(img, dtype=np.float32)
        want = str(opts.get("channels", "")).lower()
        if px.ndim == 3 and px.shape[2] >= 3 and want not in ("y", "ya"):
            px = np.ascontiguousarray(px[:, :, [2, 1, 0] + ([3] if px.shape[2] >= 4 and want != "rgb" else [])])
            name = "RGBA" if px.shape[2] == 4 else "RGB"
        else:
            if px.ndim == 3 and px.shape[2] >= 3:
                luma = px[:, :, 2] * 0.2126 + px[:, :, 1] * 0.7152 + px[:, :, 0] * 0.0722
                px = np.stack([luma, px[:, :, 3]], axis=2) if px.shape[2] >= 4 and want == "ya" else luma
            elif px.ndim == 3:
                px = px.reshape(px.shape[:2])
            px = np.ascontiguousarray(px)
            name = "Y" if px.ndim == 2 else "YA"
        if opts.get("half"):
            px = px.astype(np.float16)
        packed = {name: px}
        if name == "YA":
            packed = {"Y": np.ascontiguousarray(px[:, :, 0]), "A": np.ascontiguousarray(px[:, :, 1])}
        kind = EXR_COMPRESSIONS.get(str(opts.get("compression", "zip")).lower(), "ZIP_COMPRESSION")
        header = {"compression": getattr(OpenEXR, kind), "type": OpenEXR.scanlineimage}
        fd, path = tempfile.mkstemp(suffix=".exr")
        os.close(fd)
        try:
            with OpenEXR.File(header, packed) as f:
                f.write(path)
            with open(path, "rb") as fh:
                return fh.read()
        finally:
            os.unlink(path)
    except Exception:
        return None


def _encode_worker(arg: tuple, q: "mp.Queue[object]") -> None:
    os.environ["OPENCV_IO_ENABLE_OPENEXR"] = "1"
    img, opts = arg
    try:
        if opts:
            q.put(_binding_encode(img, opts))   # a chosen compression, half float or channel set: only the binding writes those
            return
        import cv2
        try:
            ok, out = cv2.imencode(".exr", np.ascontiguousarray(img))
        except Exception:
            ok, out = False, None   # no OpenEXR codec in this OpenCV build: the binding writes it
        q.put(out.tobytes() if ok else _binding_encode(img))
    except Exception:
        q.put(None)


MAX_PARTS = 64
MAX_PART_PIXELS = 120_000_000   # all parts together, so a hostile header cannot ask the child for more than the engine edits


def _parts_worker(data: bytes, q: "mp.Queue[object]") -> None:
    """Every part of a multi-part OpenEXR (DEV_PLAN 36.15), read by the OpenEXR binding inside this child alone.
    Each part gives its name, size, data window offset and RGBA as float32; a part without R, G and B channels gives
    its first channel as grey (a depth pass) and an alpha of 1."""
    try:
        import io
        import OpenEXR
        f = OpenEXR.File(io.BytesIO(data))
        parts = list(f.parts)
        if len(parts) < 2 or len(parts) > MAX_PARTS:
            q.put({"count": len(parts)})
            return
        boxes = []
        for p in parts:
            dw, disp = p.header["dataWindow"], p.header.get("displayWindow", p.header["dataWindow"])
            boxes.append((int(dw[0][0]), int(dw[0][1]), int(dw[1][0]), int(dw[1][1]), int(disp[0][0]), int(disp[0][1]), int(disp[1][0]), int(disp[1][1])))
        total = sum((b[2] - b[0] + 1) * (b[3] - b[1] + 1) for b in boxes)
        if total > MAX_PART_PIXELS:
            q.put(None)
            return
        # The canvas is the display window of the first part joined with every data window, so nothing is cropped.
        x0 = min([boxes[0][4]] + [b[0] for b in boxes]); y0 = min([boxes[0][5]] + [b[1] for b in boxes])
        x1 = max([boxes[0][6]] + [b[2] for b in boxes]); y1 = max([boxes[0][7]] + [b[3] for b in boxes])
        out, meta = [], []
        for i, p in enumerate(parts):
            chans = p.channels
            key = next((k for k in chans if k.split(".")[-1] == "RGBA"), None) or next((k for k in chans if k.split(".")[-1] == "RGB"), None) or next(iter(chans), None)
            if key is None:
                continue
            px = np.asarray(chans[key].pixels, dtype=np.float32)
            if px.ndim == 2:
                px = np.stack([px, px, px], axis=2)
            if px.shape[2] == 2:
                px = np.dstack([px, np.zeros(px.shape[:2], np.float32)])
            if px.shape[2] == 3:
                px = np.dstack([px, np.ones(px.shape[:2], np.float32)])
            h, w = px.shape[:2]
            name = p.name() or f"Part {i + 1}"
            out.append(np.ascontiguousarray(px[:, :, :4]))
            meta.append({"name": name, "width": w, "height": h, "x": boxes[i][0] - x0, "y": boxes[i][1] - y0})
        q.put({"count": len(meta), "width": x1 - x0 + 1, "height": y1 - y0 + 1, "parts": meta, "pixels": out})
    except Exception:
        q.put(None)


MAX_MATTES = 64


def _crypto_names(parts) -> dict:
    """Cryptomatte sets named in the headers: {set name: {object name: hash as uint32}}. A manifest that is not
    JSON, or sits in a sidecar file, gives a set with no objects."""
    import json
    import re
    out: dict = {}
    for p in parts:
        for k, v in p.header.items():
            m = re.fullmatch(r"cryptomatte/([0-9a-fA-F]+)/name", str(k))
            if not m:
                continue
            name, objects = str(v), {}
            try:
                for obj, h in json.loads(str(p.header.get(f"cryptomatte/{m.group(1)}/manifest", "{}"))).items():
                    objects[str(obj)] = int(str(h), 16) & 0xFFFFFFFF
            except Exception:
                objects = {}
            out[name] = objects
    return out


def _view_of(part, key: str) -> "tuple[str, str]":
    """The stereo view a channel belongs to and its name without the view prefix. A multi-view file prefixes every view
    but the default one (left.diffuse.R); a multi-part file names the view in each part's `view` attribute."""
    def text(v) -> str:
        return v.decode("utf-8", "replace") if isinstance(v, (bytes, bytearray)) else str(v)
    mv = [text(v) for v in (part.header.get("multiView") or [])]
    for v in mv:
        if key.startswith(v + "."):
            return v, key[len(v) + 1:]
    own = part.header.get("view")
    if own:
        return text(own), key
    return (mv[0] if mv else ""), key


def _group_label(part, key: str) -> str:
    key = _view_of(part, key)[1]
    if "." in key:
        return key.rsplit(".", 1)[0]
    return (part.name() or "Beauty") if key in ("RGBA", "RGB") else key


def _crypto_carrier(key: str, sets) -> "str | None":
    import re
    m = re.fullmatch(r"(.+?)(\d{2})(?:\.[A-Za-z]+)?", key)
    return m.group(1) if m and m.group(1) in sets else None


def _matte(parts, name: str, hash32: int, shape) -> np.ndarray:
    """The coverage of one Cryptomatte object: each rank's coverage where its id equals the object's hash."""
    cov = np.zeros(shape, np.float32)
    for p in parts:
        for key, ch in p.channels.items():
            if _crypto_carrier(key, {name}) != name:
                continue
            px = np.asarray(ch.pixels, dtype=np.float32)
            if px.ndim != 3 or px.shape[2] < 2 or px.shape[:2] != shape:
                continue
            for r in range(0, px.shape[2] - 1, 2):
                ids = np.ascontiguousarray(px[:, :, r]).view(np.uint32)
                cov += np.where(ids == np.uint32(hash32), px[:, :, r + 1], 0.0)
    return np.clip(cov, 0.0, 1.0)


def _inspect_worker(arg, q: "mp.Queue[object]") -> None:
    """The channel groups of an OpenEXR, or (with `picks`) the chosen groups as RGBA float32. A group is a channel set
    sharing a prefix (diffuse.R, diffuse.G, diffuse.B), a part's own channels, or one Cryptomatte object's matte."""
    data, picks = arg
    try:
        import io
        import OpenEXR
        f = OpenEXR.File(io.BytesIO(data))
        parts = list(f.parts)
        if not parts or len(parts) > MAX_PARTS:
            q.put(None)
            return
        boxes = []
        for p in parts:
            dw, disp = p.header["dataWindow"], p.header.get("displayWindow", p.header["dataWindow"])
            boxes.append((int(dw[0][0]), int(dw[0][1]), int(dw[1][0]), int(dw[1][1]), int(disp[0][0]), int(disp[0][1]), int(disp[1][0]), int(disp[1][1])))
        if sum((b[2] - b[0] + 1) * (b[3] - b[1] + 1) for b in boxes) > MAX_PART_PIXELS:
            q.put(None)
            return
        x0 = min([boxes[0][4]] + [b[0] for b in boxes]); y0 = min([boxes[0][5]] + [b[1] for b in boxes])
        x1 = max([boxes[0][6]] + [b[2] for b in boxes]); y1 = max([boxes[0][7]] + [b[3] for b in boxes])
        sets = _crypto_names(parts)
        listing, carriers = [], set()
        for i, p in enumerate(parts):
            groups = []
            for key, ch in p.channels.items():
                if _crypto_carrier(key, sets):
                    carriers.add(key)
                    continue
                shape = np.asarray(ch.pixels).shape
                groups.append({"key": key, "label": _group_label(p, key), "channels": int(shape[2]) if len(shape) == 3 else 1, "view": _view_of(p, key)[0]})
            listing.append({"part": i, "name": p.name() or f"Part {i + 1}", "groups": groups})
        if picks is None:
            seen = [g["view"] for lp in listing for g in lp["groups"]]
            views = list(dict.fromkeys(v for v in seen if v)) if len(set(seen)) > 1 else []
            q.put({"width": x1 - x0 + 1, "height": y1 - y0 + 1, "parts": listing, "views": views,
                   "crypto": [{"name": n, "objects": sorted(o)[:MAX_MATTES]} for n, o in sets.items()]})
            return
        out, meta = [], []

        def rgba(i: int, key: str):
            ch = parts[i].channels.get(key) if 0 <= i < len(parts) else None
            if ch is None:
                return None
            px = np.asarray(ch.pixels, dtype=np.float32)
            if px.ndim == 2:
                px = np.stack([px, px, px], axis=2)
            if px.shape[2] == 2:
                px = np.dstack([px, np.zeros(px.shape[:2], np.float32)])
            if px.shape[2] == 3:
                px = np.dstack([px, np.ones(px.shape[:2], np.float32)])
            return px[:, :, :4]

        for pick in picks[:MAX_PARTS]:
            if "sum" in pick:
                # A beauty precomp: the light groups added together in linear light, opaque.
                found = [(int(s.get("part", 0)), rgba(int(s.get("part", 0)), str(s.get("key")))) for s in (pick["sum"] if isinstance(pick["sum"], list) else [])[:MAX_PARTS] if isinstance(s, dict)]
                found = [(i, s) for i, s in found if s is not None]
                if len(found) < 2 or any(s.shape != found[0][1].shape for _, s in found):
                    continue
                total = np.zeros(found[0][1].shape, np.float32)
                for _, s in found:
                    total[:, :, :3] += s[:, :, :3]
                total[:, :, 3] = 1.0
                bi = found[0][0]
                meta.append({"name": str(pick.get("name") or "Beauty")[:60], "width": total.shape[1], "height": total.shape[0], "x": boxes[bi][0] - x0, "y": boxes[bi][1] - y0})
                out.append(np.ascontiguousarray(total))
                continue
            if "crypto" in pick:
                objects = sets.get(str(pick["crypto"]), {})
                obj = str(pick.get("object", ""))
                if obj not in objects:
                    continue
                shape = next((np.asarray(ch.pixels).shape[:2] for p in parts for k, ch in p.channels.items() if _crypto_carrier(k, {str(pick["crypto"])})), None)
                if shape is None:
                    continue
                m = _matte(parts, str(pick["crypto"]), objects[obj], shape)
                px = np.dstack([m, m, m, np.ones(shape, np.float32)])
                meta.append({"name": obj, "width": shape[1], "height": shape[0], "x": boxes[0][0] - x0, "y": boxes[0][1] - y0})
                out.append(np.ascontiguousarray(px))
                continue
            i = int(pick.get("part", 0))
            ch = parts[i].channels.get(str(pick.get("key"))) if 0 <= i < len(parts) else None
            if ch is None:
                continue
            px = np.asarray(ch.pixels, dtype=np.float32)
            if px.ndim == 2:
                px = np.stack([px, px, px], axis=2)
            if px.shape[2] == 2:
                px = np.dstack([px, np.zeros(px.shape[:2], np.float32)])
            if px.shape[2] == 3:
                px = np.dstack([px, np.ones(px.shape[:2], np.float32)])
            view = _view_of(parts[i], str(pick.get("key")))[0]
            meta.append({"name": (f"{view} " if view else "") + _group_label(parts[i], str(pick.get("key"))), "width": px.shape[1], "height": px.shape[0], "x": boxes[i][0] - x0, "y": boxes[i][1] - y0})
            out.append(np.ascontiguousarray(px[:, :, :4]))
        q.put({"count": len(meta), "width": x1 - x0 + 1, "height": y1 - y0 + 1, "parts": meta, "pixels": out})
    except Exception:
        q.put(None)


def _run(worker, arg) -> object:
    ctx = mp.get_context("spawn")
    q: "mp.Queue[object]" = ctx.Queue(1)
    proc = ctx.Process(target=worker, args=(arg, q), daemon=True)
    proc.start()
    deadline = time.monotonic() + TIMEOUT_S
    try:
        while time.monotonic() < deadline:
            try:
                return q.get(timeout=0.2)
            except queue.Empty:
                if not proc.is_alive():
                    try:
                        return q.get(timeout=0.2)
                    except queue.Empty:
                        return None
        return None
    finally:
        proc.join(timeout=1.0)
        if proc.is_alive():
            proc.kill()


def is_exr(data: bytes) -> bool:
    return data[:4] == EXR_MAGIC


def decode_exr(data: bytes) -> np.ndarray | None:
    """The EXR's pixels as OpenCV returns them (BGR or BGRA, float32), or None when the child could not read it."""
    out = _run(_decode_worker, data)
    return out if isinstance(out, np.ndarray) else None


def is_multipart_exr(data: bytes) -> bool:
    """Whether the version field says multi-part (bit 12 of the flags): eight bytes read, nothing parsed."""
    return len(data) >= 8 and data[:4] == EXR_MAGIC and bool(data[5] & 0x10)


def decode_exr_parts(data: bytes) -> dict | None:
    """A multi-part EXR's parts (DEV_PLAN 36.15): {count, width, height, parts: [{name, width, height, x, y}], pixels:
    [RGBA float32 arrays]}. A file of one part, or none the binding can read, gives {count} alone or None, and the
    caller opens it the single-part way. The parsing runs in the child, as every EXR does."""
    if not is_multipart_exr(data):
        return {"count": 1}
    out = _run(_parts_worker, data)
    return out if isinstance(out, dict) else None


def inspect_exr(data: bytes, picks: "list | None" = None) -> dict | None:
    """The channel groups of an EXR ({width, height, parts: [{part, name, groups: [{key, label, channels}]}], crypto:
    [{name, objects}]}), or with `picks` ([{part, key}] or [{crypto, object}]) the chosen groups in the format of
    `decode_exr_parts`. None when the child could not read the file."""
    out = _run(_inspect_worker, (data, picks))
    return out if isinstance(out, dict) else None


def encode_exr(img: np.ndarray, opts: dict | None = None) -> bytes | None:
    """`img` (BGRA float32) as EXR bytes, or None when the child could not write it. `opts` as `_binding_encode` takes."""
    out = _run(_encode_worker, (img, opts or {}))
    return out if isinstance(out, (bytes, bytearray)) else None
