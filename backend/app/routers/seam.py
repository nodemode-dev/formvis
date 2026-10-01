"""Content-Aware Scale (1.55.4, the parity plan's M4): seam carving (Avidan and Shamir). The picture's width or height
changes by removing or inserting the lowest-energy seams, so the parts that matter keep their shape. Energy is the
gradient magnitude of the luminance; a protection mask (the selection, or skin tones) raises energy so seams avoid
it. Enlarging inserts the k lowest seams found on the original, each duplicated with its neighbours averaged. The
dynamic programme is vectorised over rows, so a 1,000 by 1,000 picture loses a seam in a few milliseconds."""
import io
import numpy as np
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from PIL import Image

router = APIRouter(tags=["seam"])
PROTECT = 1_000_000.0
MAX_PIXELS = 12_000_000


def _energy(rgb: np.ndarray, protect: np.ndarray | None) -> np.ndarray:
    lum = rgb[..., 0] * 0.299 + rgb[..., 1] * 0.587 + rgb[..., 2] * 0.114
    gx = np.abs(np.diff(lum, axis=1, prepend=lum[:, :1]))
    gy = np.abs(np.diff(lum, axis=0, prepend=lum[:1, :]))
    e = gx + gy
    if protect is not None:
        e = e + protect * PROTECT
    return e


def _seam(energy: np.ndarray) -> np.ndarray:
    """The lowest-cost vertical seam: the column of each row, by the usual dynamic programme over rows."""
    h, w = energy.shape
    cost = energy.copy()
    back = np.zeros((h, w), np.int8)
    for y in range(1, h):
        prev = cost[y - 1]
        left = np.concatenate([[np.inf], prev[:-1]])
        right = np.concatenate([prev[1:], [np.inf]])
        stacked = np.stack([left, prev, right])
        choice = np.argmin(stacked, axis=0)
        cost[y] += stacked[choice, np.arange(w)]
        back[y] = choice - 1
    seam = np.zeros(h, np.int64)
    seam[-1] = int(np.argmin(cost[-1]))
    for y in range(h - 1, 0, -1):
        seam[y - 1] = seam[y] + back[y, seam[y]]
    return seam


def _remove(rgba: np.ndarray, seam: np.ndarray) -> np.ndarray:
    h, w = rgba.shape[:2]
    keep = np.ones((h, w), bool)
    keep[np.arange(h), seam] = False
    return rgba[keep].reshape(h, w - 1, rgba.shape[2])


def _insert(rgba: np.ndarray, seam: np.ndarray) -> np.ndarray:
    h, w, c = rgba.shape
    out = np.empty((h, w + 1, c), rgba.dtype)
    for y in range(h):
        x = seam[y]
        left = rgba[y, max(0, x - 1)]
        mid = ((rgba[y, x].astype(np.float32) + left.astype(np.float32)) / 2).astype(rgba.dtype)
        out[y, :x] = rgba[y, :x]
        out[y, x] = mid
        out[y, x + 1:] = rgba[y, x:]
    return out


def carve_width(rgba: np.ndarray, target: int, protect: np.ndarray | None) -> np.ndarray:
    h, w = rgba.shape[:2]
    if target == w:
        return rgba
    if target < w:
        prot = protect
        for _ in range(w - target):
            e = _energy(rgba[..., :3].astype(np.float32), prot)
            s = _seam(e)
            rgba = _remove(rgba, s)
            if prot is not None:
                prot = _remove(prot[..., None], s)[..., 0]
        return rgba
    # Enlarge: find the k lowest seams on the original (removing each from a working copy), then insert them, each
    # seam's columns shifted by the ones inserted before it.
    k = target - w
    work, prot = rgba.copy(), (protect.copy() if protect is not None else None)
    seams = []
    tracker = np.tile(np.arange(w), (h, 1))
    for _ in range(k):
        e = _energy(work[..., :3].astype(np.float32), prot)
        s = _seam(e)
        seams.append(tracker[np.arange(h), s])
        work = _remove(work, s)
        tracker = _remove(tracker[..., None], s)[..., 0]
        if prot is not None:
            prot = _remove(prot[..., None], s)[..., 0]
    seams = np.stack(seams, axis=1)   # h by k, original columns
    order = np.argsort(seams, axis=1)
    out = rgba
    for j in range(k):
        s = seams[np.arange(h), order[:, j]] + j
        out = _insert(out, s)
    return out


def carve(rgba: np.ndarray, width: int, height: int, protect: np.ndarray | None) -> np.ndarray:
    out = carve_width(rgba, width, protect)
    if height != rgba.shape[0]:
        p = None if protect is None else carve_width(protect[..., None].astype(np.uint8), width, None)[..., 0]
        out = carve_width(np.ascontiguousarray(out.transpose(1, 0, 2)), height, None if p is None else np.ascontiguousarray(p.T)).transpose(1, 0, 2)
    return np.ascontiguousarray(out)


def skin_mask(rgb: np.ndarray) -> np.ndarray:
    r, g, b = rgb[..., 0].astype(np.float32), rgb[..., 1].astype(np.float32), rgb[..., 2].astype(np.float32)
    cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b
    cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b
    return ((cb > 77) & (cb < 127) & (cr > 133) & (cr < 173)).astype(np.float32)


@router.post("/content-aware-scale")
def content_aware_scale(file: UploadFile = File(...), width: int = Form(...), height: int = Form(...), skin: bool = Form(False), mask: UploadFile | None = File(default=None)) -> Response:
    try:
        img = Image.open(io.BytesIO(file.file.read())).convert("RGBA")
    except Exception:
        raise HTTPException(400, "The picture could not be read")
    w, h = img.size
    if width < 1 or height < 1 or width * height > MAX_PIXELS or w * h > MAX_PIXELS:
        raise HTTPException(413, "Content-Aware Scale works up to 12 megapixels at a time.")
    if width < w // 4 or height < h // 4 or width > w * 2 or height > h * 2:
        raise HTTPException(422, "Content-Aware Scale goes down to a quarter and up to twice the size in one step.")
    rgba = np.asarray(img).copy()
    protect: np.ndarray | None = None
    if mask is not None:
        m = Image.open(io.BytesIO(mask.file.read())).convert("L").resize((w, h), Image.Resampling.NEAREST)
        protect = (np.asarray(m, np.float32) / 255.0)
    if skin:
        s = skin_mask(rgba[..., :3])
        protect = s if protect is None else np.maximum(protect, s)
    out = carve(rgba, width, height, protect)
    buf = io.BytesIO()
    Image.fromarray(out, "RGBA").save(buf, "PNG")
    return Response(buf.getvalue(), media_type="image/png")
