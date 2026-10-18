"""Relight's scene (1.82.0): the photo turned into a lit scene once per Relight layer, on a grid at most 832 cells on
the long side. Geometry from MoGe-2 small (Microsoft, MIT, depth plus normals in one pass at a short side of 518 px)
when installed, else Depth Anything V2 Small's depth with normals from its slope. The subject comes from U2-Net (the
app's subject selection) and is treated as its own surface: the background is filled in behind it and smoothed so
patterns stay straight on it, the subject keeps its own normals so light never bleeds across the outline. The photo's
own light is estimated from how brightness varies with surface direction (second-order spherical harmonics over the
subject's normals) and divided out, so the surface colour keeps every detail of the photo."""
import numpy as np
import cv2
from PIL import Image

from . import model_manager

GRID = 832
MOGE = "moge-2-vits-normal"
MOGE_FILE = "moge-2-vits-normal/model.pt"
MOGE_SHORT = 518

_moge = None


def _lin(rgb: np.ndarray) -> np.ndarray:
    x = rgb.astype(np.float32) / 255
    return np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4).astype(np.float32)


def _lum(lin: np.ndarray) -> np.ndarray:
    return (lin * np.array([0.2126, 0.7152, 0.0722], np.float32)).sum(-1)


def _blur(a: np.ndarray, sigma: float) -> np.ndarray:
    return cv2.GaussianBlur(a.astype(np.float32), (0, 0), max(0.5, float(sigma)))


def _fill(value: np.ndarray, weight: np.ndarray, size: int) -> np.ndarray:
    """`value` where `weight` is 1, filled smoothly from the surroundings where it is 0 (normalised blurs, coarse to
    fine, so a hole of any size closes)."""
    out = value * weight
    have = weight.copy()
    for sigma in (size / 160, size / 60, size / 20, size / 6):
        num, den = _blur(value * weight, sigma), _blur(weight, sigma)
        est = num / np.maximum(den, 1e-6)
        take = np.clip(den * 4, 0, 1) * (1 - have)
        out = out + est * take
        have = np.clip(have + take, 0, 1)
    return out / np.maximum(have, 1e-6)


def moge_ready() -> bool:
    if not model_manager.ready(MOGE):
        return False
    try:
        import importlib.util
        return importlib.util.find_spec("moge") is not None and importlib.util.find_spec("torch") is not None
    except Exception:
        return False


def _moge_normals(rgb: np.ndarray) -> np.ndarray | None:
    """MoGe-2 small's normals at the grid, in Relight's frame (x right, y down, z toward the viewer)."""
    global _moge
    if not moge_ready():
        return None
    try:
        import torch
        from moge.model.v2 import MoGeModel

        if _moge is None:
            _moge = MoGeModel.from_pretrained(str(model_manager.model_file(MOGE_FILE))).eval()
        h, w = rgb.shape[:2]
        k = MOGE_SHORT / min(h, w)
        small = cv2.resize(rgb, (max(14, round(w * k)), max(14, round(h * k))), interpolation=cv2.INTER_AREA)
        with torch.inference_mode():
            out = _moge.infer(torch.from_numpy(small.astype(np.float32) / 255).permute(2, 0, 1), use_fp16=False)
        n = out["normal"].cpu().numpy().astype(np.float32)
        n = np.stack([n[..., 0], n[..., 1], -n[..., 2]], -1)
        n = cv2.resize(n, (w, h), interpolation=cv2.INTER_LINEAR)
        return n / np.maximum(np.linalg.norm(n, axis=-1, keepdims=True), 1e-6)
    except Exception:
        return None


def _depth(rgb: np.ndarray) -> np.ndarray | None:
    if not model_manager.ready("depth-anything-v2-small"):
        return None
    from . import depth
    h, w = rgb.shape[:2]
    return depth.depth_values(Image.fromarray(rgb), w, h).astype(np.float32)


def _subject(rgb: np.ndarray) -> np.ndarray | None:
    if not model_manager.ready("u2net-onnx"):
        return None
    try:
        from app.services import background
        h, w = rgb.shape[:2]
        m = np.asarray(background._u2net_onnx(Image.fromarray(rgb)).convert("L").resize((w, h), Image.Resampling.BILINEAR), np.float32) / 255
        return np.clip((m - 0.25) / 0.5, 0, 1)
    except Exception:
        return None


def _slope_normals(d: np.ndarray, size: int, relief: float = 0.7) -> np.ndarray:
    gy, gx = np.gradient(_blur(d, 1.2) * relief * size)
    n = np.stack([-gx, -gy, np.ones_like(gx)], -1)
    return n / np.linalg.norm(n, axis=-1, keepdims=True)


def _sh_basis(n: np.ndarray) -> np.ndarray:
    x, y, z = n[..., 0], n[..., 1], n[..., 2]
    return np.stack([np.ones_like(x), x, y, z, x * y, x * z, y * z, x * x - y * y, 3 * z * z - 1], -1)


def solve(rgb: np.ndarray) -> dict:
    h0, w0 = rgb.shape[:2]
    k = min(1.0, GRID / max(h0, w0))
    g = rgb if k == 1.0 else cv2.resize(rgb, (max(1, round(w0 * k)), max(1, round(h0 * k))), interpolation=cv2.INTER_AREA)
    h, w = g.shape[:2]
    size = max(h, w)
    lin = _lin(g)
    d = _depth(g)
    mask = _subject(g)
    if d is None:
        d = np.full((h, w), 0.5, np.float32)
    if mask is None:
        mask = np.zeros((h, w), np.float32)
    core = (mask > 0.5).astype(np.float32)
    # Unreliable depth: stray pixels along outlines (a big jump against the local median) are refilled from around them.
    med = cv2.medianBlur((d * 255).astype(np.uint8), 5).astype(np.float32) / 255
    sure = (np.abs(d - med) < 0.08).astype(np.float32)
    d = _fill(d, sure, size)
    # Two layers: the subject's depth extended past its outline, the background filled in behind it and smoothed.
    subj = _fill(d, core * sure, size) if core.sum() > 64 else d
    bg_w = (1 - np.clip(mask * 1.5, 0, 1)) * sure
    bg = _fill(d, bg_w, size) if bg_w.sum() > 64 else d
    bg = _blur(bg, size / 30)
    if core.sum() > 64:
        bg = np.minimum(bg, subj - 0.03)
    depth = (mask * subj + (1 - mask) * bg).astype(np.float32)
    # Normals: MoGe-2 for the subject when installed, else the slope of its own layer; the background from its layer.
    n_sub = _moge_normals(g)
    engine = "moge" if n_sub is not None else "slope"
    if n_sub is None:
        n_sub = _slope_normals(subj, size)
        r = size / 130
        n_sub = np.stack([_blur(n_sub[..., c], r) for c in range(3)], -1)
    n_bg = _slope_normals(bg, size)
    m3 = mask[..., None]
    normals = n_sub * m3 + n_bg * (1 - m3)
    normals = normals / np.maximum(np.linalg.norm(normals, axis=-1, keepdims=True), 1e-6)
    # The photo's own light: second-order SH of the smoothed luminance over the subject's normals, robustly.
    Y = _blur(_lum(lin), size / 200) + 1e-4
    shading = np.ones((h, w), np.float32)
    if core.sum() > 256:
        B = _sh_basis(n_sub)
        sel = (core > 0) & (Y > np.percentile(Y[core > 0], 5))
        A, b = B[sel], Y[sel]
        wts = np.ones(len(b), np.float32)
        for _ in range(4):
            coef, *_ = np.linalg.lstsq(A * wts[:, None], b * wts, rcond=None)
            fit = A @ coef
            res = np.abs(np.log(np.maximum(fit, 1e-4) / b))
            wts = 1 / (1 + (res / 0.35) ** 2)
        S = np.maximum(B @ coef, 1e-4)
        S = S / np.percentile(S[core > 0], 90)
        shading = (mask * np.clip(S, 0.4, 1.3) + (1 - mask)).astype(np.float32)
    level = float(np.mean(_lum(lin / shading[..., None])[core > 0])) if core.sum() > 64 else float(np.mean(_lum(lin)))
    # Texture for glints: the photo's own fine contrast (pores, hair strands), where light catches.
    g8 = np.sqrt(np.clip(_lum(lin), 0, 1)).astype(np.float32)
    fine = np.abs(g8 - _blur(g8, 1.5)) + 0.5 * np.abs(g8 - _blur(g8, 4))
    fine = _blur(fine, 0.8)
    texture = np.clip(fine / max(1e-4, float(np.percentile(fine[core > 0] if core.sum() > 64 else fine, 95))), 0, 1) * np.clip(mask * 1.5, 0, 1)
    return {"depth": depth, "mask": mask.astype(np.float32), "normals": normals.astype(np.float32), "shading": shading,
            "level": level, "geometry": engine, "size": (w, h), "texture": texture.astype(np.float32)}
