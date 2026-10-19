"""File > Automate > Photomerge and Merge to HDR (1.58.2, the parity plan's L6), through OpenCV.

Photomerge stitches overlapping photos with OpenCV's Stitcher: Auto is its panorama mode (features matched, cameras
estimated, a spherical projection, seams found, multi-band blending), Reposition its flat-scan mode (each photo moved
and turned, not bent). Perspective, Cylindrical and Collage register the photos in services/stitch.py (a homography,
a cylinder of the estimated focal length, a similarity) and feather them together; every layout can first correct
lens distortion and vignetting. The answer is RGBA: transparent where no photo reaches (the pure black
the stitcher leaves there, joined to the edge), or cropped to the largest rectangle the photos fill.

Merge to HDR aligns the exposures (median threshold bitmaps, for photos taken by hand), recovers the camera's
response (Debevec) and merges them into linear radiance (Debevec), scaled so the exposure nearest the middle keeps
its mid-tones: a 32-bit picture whose highlights run past white. Exposure times come from each photo's EXIF; when
any lacks one, they are estimated from the photos themselves (the median brightness ratio of pixels mid-toned in
both, in linear light)."""
import base64
import io
import json

import numpy as np
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from PIL import Image, ImageOps
from starlette.concurrency import run_in_threadpool

router = APIRouter(prefix="/api/merge", tags=["merge"])
MAX_SIDE = 4096


def _read(data: bytes) -> tuple[np.ndarray, float | None]:
    im = Image.open(io.BytesIO(data))
    exposure = None
    try:
        exif = im.getexif()
        v = exif.get_ifd(0x8769).get(33434) or exif.get(33434)
        exposure = float(v) if v else None
    except Exception:
        exposure = None
    im = ImageOps.exif_transpose(im).convert("RGB")
    k = min(1.0, MAX_SIDE / max(im.size))
    if k < 1.0:
        im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.Resampling.LANCZOS)
    return np.asarray(im)[..., ::-1].copy(), exposure   # BGR for OpenCV


def _largest_rect(mask: np.ndarray) -> tuple[int, int, int, int]:
    """The largest axis-aligned rectangle of True in `mask`: (x, y, w, h), by the histogram method row by row."""
    h, w = mask.shape
    heights = np.zeros(w, np.int32)
    best = (0, 0, 0, 0, 0)
    for y in range(h):
        heights = np.where(mask[y], heights + 1, 0)
        stack: list[int] = []
        for x in range(w + 1):
            cur = heights[x] if x < w else 0
            while stack and heights[stack[-1]] >= cur:
                top = stack.pop()
                left = stack[-1] + 1 if stack else 0
                area = int(heights[top]) * (x - left)
                if area > best[0]:
                    best = (area, left, y - int(heights[top]) + 1, x - left, int(heights[top]))
            stack.append(x)
    return best[1], best[2], best[3], best[4]


def _finish(rgba: np.ndarray, cover: np.ndarray, crop: bool) -> bytes:
    """The RGBA canvas as PNG, cropped to the largest rectangle `cover` fills when `crop`."""
    if crop:
        small = cover[:: max(1, cover.shape[0] // 512), :: max(1, cover.shape[1] // 512)]
        fy, fx = cover.shape[0] / small.shape[0], cover.shape[1] / small.shape[1]
        x, y, w, h = _largest_rect(small)
        x0, y0 = int(np.ceil(x * fx)), int(np.ceil(y * fy))
        x1, y1 = int((x + w) * fx), int((y + h) * fy)
        if x1 > x0 and y1 > y0:
            rgba = rgba[y0:y1, x0:x1]
    out = io.BytesIO()
    Image.fromarray(np.ascontiguousarray(rgba), "RGBA").save(out, "PNG")
    return out.getvalue()


def panorama(images: list[bytes], layout: str, crop: bool, distortion: bool = False, vignette: bool = False) -> tuple[bytes, int, dict]:
    """Photomerge. Auto and Reposition use OpenCV's stitcher; Perspective, Cylindrical and Collage register the photos
    themselves (stitch.py) and feather them together. Distortion and vignette correct the photos first."""
    import cv2
    imgs = [_read(d)[0] for d in images]
    notes: dict = {}
    if distortion or vignette or layout in ("perspective", "cylindrical", "collage"):
        from ..services import stitch
        four = [np.dstack([i, np.full(i.shape[:2], 255, np.uint8)]) for i in imgs]
        four, notes = stitch.prepare(four, 0, distortion, vignette, _vignette_gains)
        if layout in ("perspective", "cylindrical", "collage"):
            placed, mats, _ = stitch.register(four, layout, 0)
            canvas, cover = stitch.compose(placed, mats)
            return _finish(canvas[..., [2, 1, 0, 3]], cover, crop), len(imgs), notes
        imgs = [np.ascontiguousarray(i[..., :3]) for i in four]
    s = cv2.Stitcher_create(cv2.Stitcher_SCANS if layout == "reposition" else cv2.Stitcher_PANORAMA)
    status, pano = s.stitch(imgs)
    if status != cv2.Stitcher_OK:
        reasons = {cv2.Stitcher_ERR_NEED_MORE_IMGS: "the photos do not overlap enough to match", cv2.Stitcher_ERR_HOMOGRAPHY_EST_FAIL: "the photos' overlaps could not be lined up", cv2.Stitcher_ERR_CAMERA_PARAMS_ADJUST_FAIL: "the cameras could not be worked out"}
        raise ValueError(f"Photomerge could not stitch these: {reasons.get(status, f'OpenCV status {status}')}.")
    kept = [int(i) for i in np.asarray(s.component()).ravel()] or list(range(len(imgs)))
    # Where no photo reaches, the stitcher leaves pure black joined to the edge; that becomes transparent, and black
    # inside the picture stays. (Recomposing white copies through the cameras would be exact, but OpenCV 5.0's
    # composePanorama crashes when the stitch kept only some of the photos.)
    from scipy import ndimage
    black = pano.max(axis=2) == 0
    labels, _ = ndimage.label(black)
    edge = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    cover = ~np.isin(labels, edge[edge > 0])
    rgba = np.dstack([pano[..., ::-1], np.where(cover, 255, 0).astype(np.uint8)])
    return _finish(rgba, cover, crop), len(kept), notes


def hdr(images: list[bytes], align: bool = True, times: list[float] | None = None) -> tuple[bytes, dict]:
    import cv2
    read = [_read(d) for d in images]
    imgs, exif = [r[0] for r in read], [r[1] for r in read]
    shape = imgs[0].shape
    if any(i.shape != shape for i in imgs):
        raise ValueError("Merge to HDR needs exposures of the same size.")
    if times is not None and (len(times) != len(imgs) or any(not t > 0 for t in times)):
        raise ValueError("Give one exposure time above zero for each photo.")
    if align:
        cv2.createAlignMTB().process(imgs, imgs)
    lin = [((i.astype(np.float32) / 255.0 + 0.055) / 1.055) ** 2.4 for i in imgs]
    if times is not None:
        times, source = np.array(times, np.float32), "entered"
    elif all(e for e in exif):
        times, source = np.array(exif, np.float32), "EXIF"
    else:
        base = int(np.argsort([float(np.median(l)) for l in lin])[len(lin) // 2])
        times = np.ones(len(lin), np.float32)
        for k, l in enumerate(lin):
            if k == base:
                continue
            ok = (l > 0.05) & (l < 0.85) & (lin[base] > 0.05) & (lin[base] < 0.85)
            times[k] = float(np.median(l[ok] / lin[base][ok])) if ok.sum() > 100 else 1.0
        source = "estimated from the photos"
    response = cv2.createCalibrateDebevec().process(imgs, times)
    radiance = cv2.createMergeDebevec().process(imgs, times, response)   # BGR, as the photos are here
    mid = int(np.argsort(times)[len(times) // 2])
    ok = (lin[mid] > 0.05) & (lin[mid] < 0.85)
    scale = float(np.median(lin[mid][ok] / np.maximum(radiance[ok], 1e-9))) if ok.sum() > 100 else 1.0 / max(1e-9, float(np.median(radiance)))
    out = np.ascontiguousarray((radiance[..., ::-1] * scale).astype(np.float32))
    return out.tobytes(), {"width": int(shape[1]), "height": int(shape[0]), "times": [float(t) for t in times], "source": source}


@router.post("/panorama")
async def panorama_route(file: list[UploadFile] = File(...), layout: str = Form("auto"), crop: bool = Form(False), distortion: bool = Form(False), vignette: bool = Form(False)) -> Response:
    if len(file) < 2:
        raise HTTPException(422, "Photomerge needs at least two overlapping photos.")
    data = [await f.read() for f in file]
    try:
        png, kept, notes = await run_in_threadpool(panorama, data, layout, crop, distortion, vignette)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    return Response(png, media_type="image/png", headers={"X-Photos-Stitched": f"{kept}/{len(data)}", "X-Photomerge-Notes": json.dumps(notes)})


@router.post("/hdr")
async def hdr_route(file: list[UploadFile] = File(...), align: bool = Form(True), times: str = Form("")) -> Response:
    if len(file) < 2:
        raise HTTPException(422, "Merge to HDR needs at least two exposures of the same scene.")
    data = [await f.read() for f in file]
    try:
        given = [float(t) for t in times.split(",") if t.strip()] if times.strip() else None
        raw, head = await run_in_threadpool(hdr, data, align, given)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    h = json.dumps(head).encode()
    return Response(len(h).to_bytes(4, "little") + h + raw, media_type="application/octet-stream")


# Edit > Auto-Align Layers and Auto-Blend Layers (DEV_PLAN 32.1). Each layer arrives as a document-sized RGBA PNG (the
# frontend renders it alone), bottom-most selected layer first; the answers are in document pixels.

def _decode(data: bytes) -> tuple[np.ndarray, np.ndarray]:
    a = np.asarray(Image.open(io.BytesIO(data)).convert("RGBA"))
    return a[..., [2, 1, 0]].copy(), a[..., 3] > 0   # BGR, and where the layer has pixels


def _translation(src: np.ndarray, dst: np.ndarray) -> list[float]:
    d = dst - src
    med = np.median(d, axis=0)
    near = np.linalg.norm(d - med, axis=1) < 3.0
    t = d[near].mean(axis=0) if near.any() else med
    return [1.0, 0.0, float(t[0]), 0.0, 1.0, float(t[1]), 0.0, 0.0, 1.0]


_LUT = 64
_MAX_GAIN = 2.5


def _vignette_gains(layers: list[tuple[np.ndarray, np.ndarray]], matrices: list[list[float]]) -> list[dict | None]:
    """The lens's radial falloff, from how the aligned layers disagree where they overlap. One scene point is seen at
    two distances from the centre in two layers, so log(layer) - log(reference) = f(r_layer) - f(r_reference) + a
    constant for exposure, with f = a r^2 + b r^4 + c r^6 (r: 0 at a layer's centre, 1 at its corners), the same lens
    for every layer. Blurred, flat, unclipped overlap pixels feed a robust (Huber) least squares; the gain is exp(-f),
    never below 1 or falling with r, capped at 2.5, as a 64-step table over r with each layer's centre and radius in
    its pixels. All None when the overlaps do not show a falloff worth removing (a corner gain under 4 percent, or no
    better a fit than exposure offsets alone)."""
    import cv2
    nothing: list[dict | None] = [None] * len(layers)
    h0, w0 = layers[0][0].shape[:2]
    k = min(1.0, 1024 / max(h0, w0))
    w, h = max(8, round(w0 * k)), max(8, round(h0 * k))
    scale = np.diag([w / w0, h / h0, 1.0])
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    frames = []
    for bgr, valid in layers:
        ys, xs = np.nonzero(valid)
        if len(xs) < 2500:
            frames.append(None)
            continue
        x0, x1, y0, y1 = int(xs.min()), int(xs.max()) + 1, int(ys.min()), int(ys.max()) + 1
        cx, cy, radius = (x0 + x1) / 2, (y0 + y1) / 2, float(np.hypot(x1 - x0, y1 - y0)) / 2
        gray = bgr[..., 0] * 0.114 + bgr[..., 1] * 0.587 + bgr[..., 2] * 0.299
        lum = cv2.GaussianBlur(cv2.resize(gray.astype(np.float32), (w, h), interpolation=cv2.INTER_AREA), (0, 0), 2)
        inside = cv2.erode((cv2.resize(valid.astype(np.uint8) * 255, (w, h), interpolation=cv2.INTER_AREA) >= 250).astype(np.uint8), np.ones((7, 7), np.uint8))
        rad = np.hypot(xx + 0.5 - cx * w / w0, yy + 0.5 - cy * h / h0) / (radius * w / w0)
        frames.append((lum, rad.astype(np.float32), inside.astype(np.float32), (cx, cy, radius)))
    if frames[0] is None:
        return nothing
    lum0, rad0, in0, _ = frames[0]
    gx, gy = cv2.Sobel(lum0, cv2.CV_32F, 1, 0), cv2.Sobel(lum0, cv2.CV_32F, 0, 1)
    flat = np.hypot(gx, gy)
    rows, target, owner, reach = [], [], [], 0.2
    for n in range(1, len(layers)):
        if frames[n] is None:
            continue
        m = scale @ np.array(matrices[n], np.float64).reshape(3, 3) @ np.linalg.inv(scale)
        lum, rad, inside = (cv2.warpPerspective(a, m, (w, h), flags=cv2.INTER_LINEAR) for a in frames[n][:3])
        ok = (in0 > 0.5) & (inside > 0.99) & (lum0 > 8) & (lum0 < 245) & (lum > 8) & (lum < 245)
        if ok.sum() < 500:
            continue
        ok &= flat <= np.percentile(flat[ok], 60)
        idx = np.flatnonzero(ok)
        idx = idx[:: max(1, len(idx) // 20000)]
        r0, rn = rad0.ravel()[idx].astype(np.float64), rad.ravel()[idx].astype(np.float64)
        rows.append(np.stack([rn ** 2 - r0 ** 2, rn ** 4 - r0 ** 4, rn ** 6 - r0 ** 6], axis=1))
        target.append(np.log(lum.ravel()[idx].astype(np.float64)) - np.log(lum0.ravel()[idx].astype(np.float64)))
        owner.append(np.full(len(idx), n - 1))
        reach = max(reach, float(np.percentile(np.maximum(r0, rn), 99)))
    if not rows:
        return nothing
    basis, y, who = np.concatenate(rows), np.concatenate(target), np.concatenate(owner)
    offsets = np.zeros((len(y), len(layers) - 1))
    offsets[np.arange(len(y)), who] = 1.0
    used = np.flatnonzero(offsets.any(axis=0))
    full = np.hstack([basis, offsets[:, used]])
    ridge = np.hstack([np.sqrt(1e-4 * len(y)) * np.eye(3), np.zeros((3, len(used)))])
    wts = np.ones(len(y))

    def fit(cols: np.ndarray, pad: np.ndarray) -> np.ndarray:
        return np.linalg.lstsq(np.vstack([cols * wts[:, None], pad]), np.concatenate([y * wts, np.zeros(len(pad))]), rcond=None)[0]

    for _ in range(10):
        beta = fit(full, ridge)
        res = y - full @ beta
        spread = 1.4826 * float(np.median(np.abs(res))) + 1e-4
        wts = np.sqrt(np.minimum(1.0, 1.5 * spread / np.maximum(np.abs(res), 1e-9)))
    plain = fit(full[:, 3:], np.zeros((0, len(used))))
    if np.median(np.abs(res)) > 0.9 * np.median(np.abs(y - full[:, 3:] @ plain)):
        return nothing
    grid = np.linspace(0.0, 1.0, _LUT)
    on = np.minimum(grid, reach)
    f = np.stack([on ** 2, on ** 4, on ** 6], axis=1) @ beta[:3]
    lut = np.maximum.accumulate(np.clip(np.exp(-f), 1.0, _MAX_GAIN))
    if lut[-1] < 1.04:
        return nothing
    table = [round(float(v), 4) for v in lut]
    return [None if fr is None else {"cx": fr[3][0], "cy": fr[3][1], "radius": fr[3][2], "lut": table} for fr in frames]


def _png(img: np.ndarray) -> str:
    buf = io.BytesIO()
    Image.fromarray(np.ascontiguousarray(img[..., [2, 1, 0, 3]]), "RGBA").save(buf, "PNG")
    return base64.b64encode(buf.getvalue()).decode()


def align(images: list[bytes], projection: str, vignette: bool, reference: int = 0, distortion: bool = False) -> dict:
    """Edit > Auto-Align Layers. `reference` is the layer (0 = the first sent) the others are moved onto. Plain
    Auto, Perspective and Reposition take the quick path below; Cylindrical and Geometric Distortion correction go
    through stitch.py, which bends or straightens the layers' pixels itself and answers them as `warped` PNGs (None for
    a layer left as it is) with the matrices to apply after, `lens` (k1 and the matching error before and after) and
    `focal` (the cylinder's radius in pixels)."""
    ref = min(max(reference, 0), len(images) - 1)
    order = [ref] + [i for i in range(len(images)) if i != ref]
    data = [images[i] for i in order]
    if projection != "cylindrical" and not distortion:
        res = _align_plain(data, projection, vignette)
        back = {key: [None] * len(images) for key in ("matrices", "layers", "gains")}
        for pos, i in enumerate(order):
            for key in back:
                back[key][i] = res[key][pos]
        return {**res, **back}
    from ..services import stitch
    layers = [_decode(d) for d in data]
    imgs = [np.dstack([bgr, v.astype(np.uint8) * 255]) for bgr, v in layers]
    imgs, prep = stitch.prepare(imgs, 0, distortion, vignette, _vignette_gains)
    placed, mats, info = stitch.register(imgs, "cylindrical" if projection == "cylindrical" else ("reposition" if projection == "reposition" else "perspective"), 0)
    changed = projection == "cylindrical" or prep["k1"] != 0.0 or prep["vignette"] == "applied"
    out = {"matrices": [None] * len(images), "layers": [None] * len(images), "gains": [None] * len(images), "warped": [None] * len(images)}
    for pos, i in enumerate(order):
        out["matrices"][i] = [float(v) for v in mats[pos].ravel()]
        out["layers"][i] = {**info[pos], "gain": None}
        if changed:
            out["warped"][i] = _png(placed[pos])
    focal = next((e["focal"] for e in info if "focal" in e), None)
    return {**out, "vignette": prep["vignette"], "lens": {"k1": prep["k1"], "error_before": prep["error_before"], "error_after": prep["error_after"]} if distortion else None, "focal": focal}


def _align_plain(images: list[bytes], projection: str, vignette: bool) -> dict:
    """Per-layer 3x3 matrices (row-major, layer pixels to the reference's) with SIFT (ORB if absent) features and a
    RANSAC homography; Reposition keeps only a translation. With vignette, the
    lens's radial falloff is estimated from the aligned overlaps (_vignette_gains) and its gain tables come back as
    `gains` (None for a layer with none) for the window to apply to the layers before they are moved and blended."""
    import cv2
    layers = [_decode(d) for d in images]
    gains: list[dict | None] = [None] * len(layers)
    try:
        det, norm = cv2.SIFT_create(5000), cv2.NORM_L2
    except (AttributeError, cv2.error):
        det, norm = cv2.ORB_create(5000), cv2.NORM_HAMMING

    def features(bgr: np.ndarray, valid: np.ndarray):
        m = cv2.erode(valid.astype(np.uint8) * 255, np.ones((5, 5), np.uint8))
        return det.detectAndCompute(cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY), m)

    rk, rd = features(*layers[0])
    ident = [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0]
    out, info = [ident], [{"inliers": 0, "kind": "reference"}]
    bf = cv2.BFMatcher(norm)
    for n, (bgr, valid) in enumerate(layers[1:], 1):
        kp, ds = features(bgr, valid)
        if rd is None or ds is None or len(rd) < 2 or len(ds) < 2:
            raise ValueError(f"Layer {n + 1} has too few features to align.")
        good = [m[0] for m in bf.knnMatch(ds, rd, k=2) if len(m) == 2 and m[0].distance < 0.75 * m[1].distance]
        if len(good) < 3:
            raise ValueError(f"Layer {n + 1} does not overlap the reference enough to align.")
        src = np.float32([kp[m.queryIdx].pt for m in good])
        dst = np.float32([rk[m.trainIdx].pt for m in good])
        kind, mat, inl = "translation", None, len(good)
        if projection != "reposition" and len(good) >= 8:
            h, mask = cv2.findHomography(src, dst, cv2.RANSAC, 3.0)
            if h is not None and mask is not None and int(mask.sum()) >= 8 and 0.25 < abs(np.linalg.det(h[:2, :2])) < 4.0:
                kind, mat, inl = "homography", (h / h[2, 2]).ravel().tolist(), int(mask.sum())
        out.append(mat if mat is not None else _translation(src, dst))
        info.append({"inliers": inl, "kind": kind})
    if vignette:
        gains = _vignette_gains(layers, out)
    for g, entry in zip(gains, info):
        entry["gain"] = g["lut"][-1] if g else None   # the corner gain removed, None when none was
    return {"matrices": out, "layers": info, "vignette": ("applied" if any(gains) else "no vignetting found") if vignette else "off", "gains": gains}


def _guided(guide: np.ndarray, src: np.ndarray, r: int, eps: float) -> np.ndarray:
    """Guided filter (box means, radius r): `src` smoothed so that its edges follow the edges of `guide`."""
    import cv2
    box = lambda a: cv2.boxFilter(a, cv2.CV_32F, (2 * r + 1, 2 * r + 1))
    mi, mp = box(guide), box(src)
    a = (box(guide * src) - mi * mp) / (box(guide * guide) - mi * mi + eps)
    return box(a) * guide + box(mp - a * mi)


def blend(images: list[bytes], method: str, seamless: bool, halo: int = 0, depth: bool = False) -> dict:
    """Per-layer masks (0-255 PNGs) where each pixel comes from one layer with smooth transitions: Stack Images picks
    the layer with the most local Laplacian energy (its choice cleaned with a median so lone pixels do not flip layers),
    Panorama the layer farthest from its own edge (a seam mid-overlap). Halo (0 to 100, Stack Images) swaps the plain
    blur of each choice for a guided filter that follows the edges of the picked-pixel composite, so a sharp edge keeps
    the layer that has it and its blurred neighbour does not bleed over. Seamless Tones returns per-layer RGB gains
    matching each layer's overlap with the reference (the median ratio of its mid-tones). With depth, `depth` is a grey
    PNG of which layer is sharpest at each point, 0 for the first layer and 255 for the last."""
    import cv2
    layers = [_decode(d) for d in images]
    h, w = layers[0][0].shape[:2]
    valid = [v for _, v in layers]
    if method == "stack":
        score = []
        for bgr, v in layers:
            lap = cv2.Laplacian(cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY).astype(np.float32), cv2.CV_32F, ksize=3)
            e = cv2.GaussianBlur(lap * lap, (0, 0), 3)
            score.append(np.where(v, e, -1.0))
        sigma = 4.0
    else:
        score = [cv2.distanceTransform(v.astype(np.uint8), cv2.DIST_L2, 3) for v in valid]
        sigma = max(3.0, 0.01 * max(w, h))
    best = np.argmax(np.stack(score), axis=0)
    if method == "stack" and len(layers) < 256:
        best = cv2.medianBlur(best.astype(np.uint8), 5).astype(best.dtype)
    hard = [(best == i).astype(np.float32) * valid[i] for i in range(len(layers))]
    if method == "stack" and halo > 0:
        picked = np.zeros((h, w), np.float32)
        for i, (bgr, _) in enumerate(layers):
            picked += hard[i] * cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0
        r = max(1, 5 - int(halo) // 25)
        wts = [np.clip(_guided(picked, hard[i], r, 1e-3), 0, 1) * valid[i] for i in range(len(layers))]
    else:
        wts = [cv2.GaussianBlur((best == i).astype(np.float32), (0, 0), sigma) * valid[i] for i in range(len(layers))]
    total = np.maximum(sum(wts), 1e-6)

    def encode(a: np.ndarray) -> str:
        buf = io.BytesIO()
        Image.fromarray(np.clip(a * 255 + 0.5, 0, 255).astype(np.uint8), "L").save(buf, "PNG")
        return base64.b64encode(buf.getvalue()).decode()

    masks = [encode(wt / total) for wt in wts]
    tones = [[1.0, 1.0, 1.0]]
    for bgr, v in layers[1:]:
        both = v & valid[0] & (layers[0][0].min(axis=2) > 10) & (layers[0][0].max(axis=2) < 245) & (bgr.min(axis=2) > 10) & (bgr.max(axis=2) < 245)
        if seamless and both.sum() > 100:
            g = np.exp(np.median(np.log(np.maximum(layers[0][0][both], 1.0).astype(np.float32) / np.maximum(bgr[both], 1.0)), axis=0))
            tones.append([float(x) for x in np.clip(g[::-1], 0.5, 2.0)])   # RGB
        else:
            tones.append([1.0, 1.0, 1.0])
    out: dict = {"masks": masks, "tones": tones}
    if depth:
        out["depth"] = encode(sum(wt / total * (i / max(1, len(layers) - 1)) for i, wt in enumerate(wts)))
    return out


@router.post("/align")
async def align_route(file: list[UploadFile] = File(...), projection: str = Form("auto"), vignette: bool = Form(False), reference: int = Form(0), distortion: bool = Form(False)) -> dict:
    if len(file) < 2:
        raise HTTPException(422, "Auto-Align Layers needs at least two layers.")
    data = [await f.read() for f in file]
    try:
        return await run_in_threadpool(align, data, projection, vignette, reference, distortion)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


def crop_photos(data: bytes) -> list[dict]:
    """File > Automate > Crop and Straighten Photos (DEV_PLAN 30.3 part b): each photo on a plain scan background,
    found by colour distance from the border's median, cut out of the page and turned upright."""
    import cv2

    rgb = _read(data)[0]
    h, w = rgb.shape[:2]
    border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]]).astype(np.float32)
    bg = np.median(border, axis=0)
    dist = np.linalg.norm(rgb.astype(np.float32) - bg, axis=2)
    dist = cv2.GaussianBlur(dist, (0, 0), 1.2)
    mask = (dist > max(18.0, float(np.percentile(np.linalg.norm(border - bg, axis=1), 98)) * 2)).astype(np.uint8) * 255
    k = max(3, round(min(w, h) / 150)) | 1
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (k, k))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
    mask = cv2.erode(mask, np.ones((3, 3), np.uint8), iterations=1)   # the blur and the closing grew the edge
    found, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    out = []
    for c in sorted(found, key=lambda c: (cv2.boundingRect(c)[1] // max(1, h // 8), cv2.boundingRect(c)[0])):
        if cv2.contourArea(c) <= 0.01 * w * h:
            continue
        (cx, cy), (rw, rh), ang = cv2.minAreaRect(c)
        if rw < 2 or rh < 2:
            continue
        # Upright: the rectangle's angle folded into -45..45, its sides swapped to match.
        if ang > 45:
            ang -= 90
            rw, rh = rh, rw
        elif ang < -45:
            ang += 90
            rw, rh = rh, rw
        ow, oh = max(1, round(rw)), max(1, round(rh))
        box = cv2.boxPoints(((cx, cy), (rw, rh), ang)).astype(np.float32)   # bl, tl, tr, br
        dst = np.array([[0, oh - 1], [0, 0], [ow - 1, 0], [ow - 1, oh - 1]], np.float32)
        m = cv2.getPerspectiveTransform(box, dst)
        warped = cv2.warpPerspective(rgb, m, (ow, oh), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
        buf = io.BytesIO()
        Image.fromarray(warped).save(buf, "PNG")
        out.append({"png": base64.b64encode(buf.getvalue()).decode("ascii"), "width": ow, "height": oh,
                    "rect": {"cx": cx, "cy": cy, "w": rw, "h": rh, "angle": ang}})
    return out


@router.post("/photos")
async def photos_route(file: UploadFile = File(...)) -> dict:
    try:
        return {"photos": await run_in_threadpool(crop_photos, await file.read())}
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.post("/blend")
async def blend_route(file: list[UploadFile] = File(...), method: str = Form("panorama"), seamless: bool = Form(False), halo: int = Form(0), depth: bool = Form(False)) -> dict:
    if len(file) < 2:
        raise HTTPException(422, "Auto-Blend Layers needs at least two layers.")
    data = [await f.read() for f in file]
    return await run_in_threadpool(blend, data, method, seamless, max(0, min(100, halo)), depth)
