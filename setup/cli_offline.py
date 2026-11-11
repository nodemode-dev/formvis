#!/usr/bin/env python3
"""formvis cli subcommands that need no window: image stack statistics, contact sheets and Fit Image run here with
Pillow and numpy, Photomerge and Merge to HDR through the engine's merge routes (so only the engine has to run).

  stack <files|folder...> --mode mean|median|minimum|maximum|range|stddev|variance|summation [--align] [--out FILE]
  contact <files|folder...> [--out FILE] [--width N --height N --unit px|in|cm|mm --ppi N] [--columns N --rows N] [--gap N]
          [--order across|down] [--rotate] [--no-captions] [--font NAME_OR_FILE] [--font-size N] [--mode rgb|grayscale]
  fit <files|folder...> --width N --height N [--no-enlarge] [--resample nearest|bilinear|bicubic|lanczos] [--out DIR] [--suffix TEXT]
  photomerge <files...> [--layout auto|perspective|cylindrical|collage|reposition] [--crop] [--vignette] [--distortion] [--out FILE]
  hdr <files...> [--no-align] [--times 1/60,1/15,...] [--depth 32|16|8] [--out FILE]
"""
from __future__ import annotations

import argparse
import io
import json
import os
import sys
import urllib.request
import uuid

PICTURES = {".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif", ".tif", ".tiff", ".bmp", ".qoi", ".tga", ".ico", ".pbm", ".pgm", ".ppm", ".pnm", ".psd"}
STACK_MODES = ("mean", "median", "minimum", "maximum", "range", "stddev", "variance", "summation")
URL = os.environ.get("FORMVIS_URL", f"http://127.0.0.1:{os.environ.get('FORMVIS_PORT', '').lstrip('0') or 8190}").rstrip("/")


def say(text: str) -> None:
    print(text, file=sys.stderr)


def gather(words: list[str]) -> list[str]:
    out = []
    for w in words:
        if os.path.isdir(w):
            out += [os.path.join(w, n) for n in sorted(os.listdir(w), key=lambda s: [int(t) if t.isdigit() else t.lower() for t in __import__("re").split(r"(\d+)", s)]) if os.path.splitext(n)[1].lower() in PICTURES]
        else:
            out.append(w)
    return out


def load(path: str, mode: str = "RGBA"):
    from PIL import Image, ImageOps
    im = Image.open(path)
    im.load()
    return ImageOps.exif_transpose(im).convert(mode)


def need(files: list[str], least: int, what: str) -> bool:
    if len(files) < least:
        say(f"{what} needs at least {least} picture{'' if least == 1 else 's'}.")
        return False
    return True


def aligned(arrays: list):
    """Each picture moved onto the first by the translation that matches them best (ECC); a picture that cannot be matched stays as it is."""
    import cv2
    import numpy as np
    ref = cv2.cvtColor(arrays[0][..., :3], cv2.COLOR_RGB2GRAY).astype(np.float32)
    out, moved = [arrays[0]], 0
    for a in arrays[1:]:
        gray = cv2.cvtColor(a[..., :3], cv2.COLOR_RGB2GRAY).astype(np.float32)
        warp = np.eye(2, 3, dtype=np.float32)
        try:
            _, warp = cv2.findTransformECC(ref, gray, warp, cv2.MOTION_TRANSLATION, (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 60, 1e-5), None, 5)
            a = cv2.warpAffine(a, warp, (a.shape[1], a.shape[0]), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REPLICATE)
            moved += 1
        except cv2.error:
            pass
        out.append(a)
    return out, moved


def stack_stat(mode: str, stack):
    """One statistic over axis 0 of an (n, h, w, 3) array, in 0..255 units like the window's stack modes (variance and standard deviation are of the population)."""
    import numpy as np
    if mode == "mean":
        return stack.mean(axis=0)
    if mode == "median":
        return np.median(stack, axis=0)
    if mode == "minimum":
        return stack.min(axis=0)
    if mode == "maximum":
        return stack.max(axis=0)
    if mode == "range":
        return stack.max(axis=0) - stack.min(axis=0)
    if mode == "summation":
        return stack.sum(axis=0)
    return stack.var(axis=0) if mode == "variance" else stack.std(axis=0)


def stack_cmd(argv: list[str]) -> int:
    p = argparse.ArgumentParser(prog="formvis cli stack", description="Combine same-size pictures with a stack mode, no window needed.")
    p.add_argument("inputs", nargs="+")
    p.add_argument("--mode", default="median", choices=STACK_MODES)
    p.add_argument("--align", action="store_true", help="move each picture onto the first before combining")
    p.add_argument("--out", default="stack.png")
    a = p.parse_args(argv)
    import numpy as np
    from PIL import Image
    files = gather(a.inputs)
    if not need(files, 2, "A stack"):
        return 2
    arrays = [np.asarray(load(f, "RGB")) for f in files]
    if any(x.shape != arrays[0].shape for x in arrays):
        say("Every picture in a stack must have the same size.")
        return 1
    moved = 0
    if a.align:
        arrays, moved = aligned(arrays)
    result = np.clip(np.rint(stack_stat(a.mode, np.stack(arrays).astype(np.float64))), 0, 255).astype(np.uint8)
    Image.fromarray(result, "RGB").save(a.out)
    print(f"{a.out}: {a.mode} of {len(files)} pictures, {result.shape[1]} x {result.shape[0]} px" + (f", {moved} aligned" if a.align else ""))
    return 0


def unit_pixels(value: float, unit: str, ppi: float) -> int:
    return round({"in": value * ppi, "cm": value / 2.54 * ppi, "mm": value / 25.4 * ppi}.get(unit, value))


def sheet_cells(width: int, height: int, cols: int, rows: int, gap_x: int, gap_y: int, caption: int, order: str) -> list[tuple[int, int, int, int]]:
    cw, ch = (width - gap_x * (cols + 1)) / cols, (height - gap_y * (rows + 1)) / rows
    if cw < 1 or ch - caption < 1:
        return []

    def cell(r: int, c: int) -> tuple[int, int, int, int]:
        return round(gap_x + c * (cw + gap_x)), round(gap_y + r * (ch + gap_y)), int(cw), int(ch - caption)

    if order == "down":
        return [cell(r, c) for c in range(cols) for r in range(rows)]
    return [cell(r, c) for r in range(rows) for c in range(cols)]


def font_of(name: str | None, size: int):
    from PIL import ImageFont
    for pick in ([name] if name else []) + ["DejaVuSans.ttf", "Arial.ttf"]:
        try:
            return ImageFont.truetype(pick, size)
        except OSError:
            continue
    return ImageFont.load_default(size)


def contact_cmd(argv: list[str]) -> int:
    p = argparse.ArgumentParser(prog="formvis cli contact", description="Lay pictures out as captioned thumbnails on one or more pages, no window needed.")
    p.add_argument("inputs", nargs="+")
    p.add_argument("--out", default="ContactSheet.png")
    p.add_argument("--width", type=float, default=2480)
    p.add_argument("--height", type=float, default=3508)
    p.add_argument("--unit", default="px", choices=("px", "in", "cm", "mm"))
    p.add_argument("--ppi", type=float, default=300)
    p.add_argument("--columns", type=int, default=5)
    p.add_argument("--rows", type=int, default=6)
    p.add_argument("--gap", type=int, default=None, help="pixels between thumbnails; about 1 percent of the shorter side when left out")
    p.add_argument("--order", default="across", choices=("across", "down"))
    p.add_argument("--rotate", action="store_true")
    p.add_argument("--no-captions", action="store_true")
    p.add_argument("--font", default=None)
    p.add_argument("--font-size", type=int, default=12)
    p.add_argument("--mode", default="rgb", choices=("rgb", "grayscale"))
    a = p.parse_args(argv)
    from PIL import Image, ImageDraw
    files = gather(a.inputs)
    if not need(files, 1, "A contact sheet"):
        return 2
    width, height = unit_pixels(a.width, a.unit, a.ppi), unit_pixels(a.height, a.unit, a.ppi)
    gap = a.gap if a.gap is not None else max(1, round(min(width, height) * 0.01))
    size = max(6, a.font_size)
    caption = 0 if a.no_captions else round(size * 1.6)
    cells = sheet_cells(width, height, max(1, a.columns), max(1, a.rows), gap, gap, caption, a.order)
    if not width >= 1 or not height >= 1 or not cells:
        say("The thumbnails do not fit the page: lower the columns, rows or spacing.")
        return 1
    font = font_of(a.font, size)
    per, pages = len(cells), -(-len(files) // len(cells))
    root, ext = os.path.splitext(a.out)
    for page in range(pages):
        sheet = Image.new("RGB", (width, height), "white")
        draw = ImageDraw.Draw(sheet)
        for i, cell in enumerate(cells):
            at = page * per + i
            if at >= len(files):
                break
            x, y, cw, ch = cell
            try:
                im = load(files[at])
            except Exception as exc:
                say(f"{files[at]}: skipped. {exc}")
                continue
            plain, turned = min(cw / im.width, ch / im.height), min(cw / im.height, ch / im.width)
            turn = a.rotate and turned > plain * 1.0001
            if turn:
                im = im.rotate(-90, expand=True)
            k = turned if turn else plain
            w, h = max(1, round(im.width * k)), max(1, round(im.height * k))
            im = im.resize((w, h), Image.Resampling.LANCZOS)
            sheet.paste(im, (round(x + (cw - w) / 2), round(y + (ch - h) / 2)), im)
            if caption:
                label = os.path.splitext(os.path.basename(files[at]))[0]
                while len(label) > 1 and draw.textlength(label, font=font) > cw:
                    label = label[:-2] + "."
                draw.text((x + cw / 2, y + ch + size * 1.2), label, fill="black", font=font, anchor="ms")
        if a.mode == "grayscale":
            sheet = sheet.convert("L")
        target = a.out if pages == 1 else f"{root}-{page + 1:03d}{ext}"
        sheet.save(target, dpi=(a.ppi, a.ppi))
        print(f"{target}: page {page + 1} of {pages}, {width} x {height} px")
    return 0


def fit_cmd(argv: list[str]) -> int:
    p = argparse.ArgumentParser(prog="formvis cli fit", description="Fit pictures inside a width and height, proportions kept, no window needed.")
    p.add_argument("inputs", nargs="+")
    p.add_argument("--width", type=int, required=True)
    p.add_argument("--height", type=int, required=True)
    p.add_argument("--no-enlarge", action="store_true")
    p.add_argument("--resample", default="lanczos", choices=("nearest", "bilinear", "bicubic", "lanczos"))
    p.add_argument("--out", default=None)
    p.add_argument("--suffix", default="-fit")
    a = p.parse_args(argv)
    from PIL import Image
    method = {"nearest": Image.Resampling.NEAREST, "bilinear": Image.Resampling.BILINEAR, "bicubic": Image.Resampling.BICUBIC, "lanczos": Image.Resampling.LANCZOS}[a.resample]
    files = gather(a.inputs)
    if not need(files, 1, "Fit Image") or a.width < 1 or a.height < 1:
        return 2
    failed = 0
    for f in files:
        try:
            im = load(f, "RGBA")
            k = min(a.width / im.width, a.height / im.height)
            if a.no_enlarge:
                k = min(1.0, k)
            size = (max(1, round(im.width * k)), max(1, round(im.height * k)))
            out_dir = a.out or os.path.dirname(os.path.abspath(f))
            os.makedirs(out_dir, exist_ok=True)
            stem, ext = os.path.splitext(os.path.basename(f))
            ext = ext.lower() if ext.lower() in (".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff", ".bmp") else ".png"
            target = os.path.join(out_dir, stem + (a.suffix if not a.out else "") + ext)
            if os.path.abspath(target) == os.path.abspath(f):
                raise RuntimeError("the result would replace the source; give --out DIR or a --suffix")
            done = im.resize(size, method)
            if ext in (".jpg", ".jpeg"):
                done = done.convert("RGB")
            done.save(target)
            print(f"{f} -> {target} ({im.width} x {im.height} to {size[0]} x {size[1]})")
        except Exception as exc:
            failed += 1
            say(f"{f}: failed. {exc}")
    return 1 if failed else 0


def post_files(path: str, files: list[str], fields: dict) -> tuple[dict, bytes]:
    boundary = uuid.uuid4().hex
    body = io.BytesIO()
    for k, v in fields.items():
        body.write(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
    for f in files:
        with open(f, "rb") as h:
            body.write(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{os.path.basename(f)}"\r\nContent-Type: application/octet-stream\r\n\r\n'.encode() + h.read() + b"\r\n")
    body.write(f"--{boundary}--\r\n".encode())
    req = urllib.request.Request(URL + path, data=body.getvalue(), method="POST", headers={"Content-Type": f"multipart/form-data; boundary={boundary}", "X-Formvis-Client": "formvis-cli"})
    with urllib.request.urlopen(req, timeout=600) as r:
        return {k.lower(): v for k, v in r.headers.items()}, r.read()


def engine_call(path: str, files: list[str], fields: dict) -> tuple[dict, bytes] | None:
    import urllib.error
    try:
        return post_files(path, files, fields)
    except urllib.error.HTTPError as exc:
        try:
            say(json.loads(exc.read().decode()).get("detail") or f"The engine answered {exc.code}.")
        except ValueError:
            say(f"The engine answered {exc.code}.")
    except (urllib.error.URLError, OSError):
        say(f"The formvis engine is not answering at {URL}. Start it with ./formvis boot, then retry.")
    return None


def photomerge_cmd(argv: list[str]) -> int:
    p = argparse.ArgumentParser(prog="formvis cli photomerge", description="Stitch overlapping photos through the engine, no window needed.")
    p.add_argument("inputs", nargs="+")
    p.add_argument("--layout", default="auto", choices=("auto", "perspective", "cylindrical", "collage", "reposition"))
    p.add_argument("--crop", action="store_true")
    p.add_argument("--vignette", action="store_true")
    p.add_argument("--distortion", action="store_true")
    p.add_argument("--out", default="Panorama.png")
    a = p.parse_args(argv)
    files = gather(a.inputs)
    if not need(files, 2, "Photomerge"):
        return 2
    got = engine_call("/api/merge/panorama", files, {"layout": a.layout, "crop": str(a.crop).lower(), "vignette": str(a.vignette).lower(), "distortion": str(a.distortion).lower()})
    if not got:
        return 1
    with open(a.out, "wb") as f:
        f.write(got[1])
    print(f"{a.out}: {got[0].get('x-photos-stitched', '?')} photos stitched ({a.layout})")
    return 0


def hdr_cmd(argv: list[str]) -> int:
    p = argparse.ArgumentParser(prog="formvis cli hdr", description="Merge bracketed exposures through the engine, no window needed.")
    p.add_argument("inputs", nargs="+")
    p.add_argument("--no-align", action="store_true")
    p.add_argument("--times", default="", help="exposure times in seconds, one per photo, as numbers or 1/60")
    p.add_argument("--depth", default="32", choices=("32", "16", "8"), help="32: Radiance .hdr; 16 or 8: tone-mapped PNG")
    p.add_argument("--out", default=None)
    a = p.parse_args(argv)
    import numpy as np
    files = gather(a.inputs)
    if not need(files, 2, "Merge to HDR"):
        return 2
    try:
        times = ",".join(str(eval_fraction(t)) for t in a.times.split(",") if t.strip())
    except ValueError:
        say("--times takes numbers or fractions such as 1/60, comma separated.")
        return 2
    got = engine_call("/api/merge/hdr", files, {"align": str(not a.no_align).lower(), "times": times})
    if not got:
        return 1
    n = int.from_bytes(got[1][:4], "little")
    head = json.loads(got[1][4:4 + n])
    rgb = np.frombuffer(got[1][4 + n:], np.float32).reshape(head["height"], head["width"], 3)
    out = a.out or ("HDR.hdr" if a.depth == "32" else "HDR.png")
    if a.depth == "32":
        import cv2
        cv2.imwrite(out, np.ascontiguousarray(rgb[..., ::-1]))
    else:
        from PIL import Image
        mapped = rgb / (1.0 + rgb)
        mapped = (np.clip(mapped, 0, 1) ** (1 / 2.2))
        if a.depth == "16":
            import cv2
            cv2.imwrite(out, np.ascontiguousarray((mapped * 65535).astype(np.uint16)[..., ::-1]))
        else:
            Image.fromarray((mapped * 255).astype(np.uint8), "RGB").save(out)
    print(f"{out}: {head['width']} x {head['height']}, {a.depth} bit, exposure times {', '.join(f'{t:g}' for t in head['times'])} ({head['source']})")
    return 0


def eval_fraction(text: str) -> float:
    top, _, bottom = text.strip().partition("/")
    return float(top) / float(bottom) if bottom else float(top)


COMMANDS = {"stack": stack_cmd, "contact": contact_cmd, "fit": fit_cmd, "photomerge": photomerge_cmd, "hdr": hdr_cmd}


def main(argv: list[str]) -> int:
    if not argv or argv[0] not in COMMANDS:
        print(__doc__)
        return 2
    return COMMANDS[argv[0]](argv[1:])


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
