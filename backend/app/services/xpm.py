"""XPM pixmaps (import only), XPM3 (a C source holding quoted strings) and XPM2 (the plain text form with an "! XPM2"
first line). The first string is "width height colors chars-per-pixel", then one string per colour (the pixel's key
characters, then pairs of a key m, s, g4, g or c and a colour: #RGB, #RRGGBB, #RRRRGGGGBBBB, None, or a colour name),
then one string per row. The c key is preferred, then g and g4, then m. Names come from the X11 table as far as the web
colour names and the grayN / greyN series cover it. A picture comes out as 8-bit RGBA with None transparent."""

import re

import numpy as np
from PIL import ImageColor

MAX_SIDE = 30000
MAX_PIXELS = 400_000_000
KEYS = ("m", "s", "g4", "g", "c")
STRING = re.compile(rb'"((?:[^"\\]|\\.)*)"')


class XpmError(Exception):
    pass


def looks_like_xpm(data: bytes) -> bool:
    head = data[:2048]
    return b"XPM" in head


def _strings(data: bytes) -> list[str]:
    if data.lstrip()[:6].upper() == b"! XPM2":
        lines = [ln for ln in data.decode("latin-1").splitlines()[1:] if ln.strip() != "" and not ln.startswith("!")]
        return lines
    text = re.sub(rb"/\*.*?\*/", b"", data, flags=re.S)
    return [m.group(1).decode("latin-1") for m in STRING.finditer(text)]


def _colour(value: str) -> tuple[int, int, int, int]:
    v = value.strip()
    low = v.lower().replace(" ", "")
    if low in ("none", "transparent", "background"):
        return 0, 0, 0, 0
    if low.startswith("#"):
        digits = low[1:]
        if len(digits) % 3 == 0 and len(digits) in (3, 6, 9, 12) and re.fullmatch(r"[0-9a-f]+", digits):
            n = len(digits) // 3
            parts = [int(digits[i * n:(i + 1) * n], 16) for i in range(3)]
            scale = (1 << (4 * n)) - 1
            r, g, b = (round(p * 255 / scale) for p in parts)
            return r, g, b, 255
        raise XpmError(f"The colour {value} is not a hex colour.")
    m = re.fullmatch(r"gr[ae]y(\d{1,3})", low)
    if m:
        g = round(min(100, int(m.group(1))) * 255 / 100)
        return g, g, g, 255
    try:
        r, g, b = ImageColor.getrgb(low)[:3]
    except ValueError:
        r, g, b = 0, 0, 0
    return r, g, b, 255


def _table(line: str, cpp: int) -> tuple[str, tuple[int, int, int, int]]:
    key, rest = line[:cpp], line[cpp:].split()
    found: dict[str, list[str]] = {}
    cur: str | None = None
    for tok in rest:
        if tok in KEYS and (cur is None or found[cur]):
            cur = tok
            found[cur] = []
        elif cur is not None:
            found[cur].append(tok)
    for k in ("c", "g", "g4", "m"):
        if found.get(k):
            return key, _colour(" ".join(found[k]))
    return key, (0, 0, 0, 255)


def read(data: bytes) -> np.ndarray:
    """RGBA array (height, width, 4), uint8."""
    strings = _strings(data)
    if not strings:
        raise XpmError("This XPM file holds no picture.")
    try:
        w, h, n, cpp = (int(x) for x in strings[0].split()[:4])
    except ValueError as exc:
        raise XpmError("The XPM header line is damaged.") from exc
    if w < 1 or h < 1 or n < 1 or not 1 <= cpp <= 8 or w > MAX_SIDE or h > MAX_SIDE or w * h > MAX_PIXELS:
        raise XpmError("This XPM picture is empty or larger than formvis edits in one piece.")
    if len(strings) < 1 + n + h:
        raise XpmError("This XPM file ends before the picture does.")
    palette = dict(_table(s, cpp) for s in strings[1:1 + n])
    out = np.zeros((h, w, 4), np.uint8)
    for y in range(h):
        row = strings[1 + n + y]
        if len(row) < w * cpp:
            raise XpmError(f"XPM row {y + 1} is shorter than the picture is wide.")
        out[y] = [palette.get(row[i:i + cpp], (0, 0, 0, 255)) for i in range(0, w * cpp, cpp)]
    return out
