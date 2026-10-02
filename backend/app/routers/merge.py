"""File > Automate > Photomerge and Merge to HDR (1.58.2, the parity plan's L6), through OpenCV.

Photomerge stitches overlapping photos with OpenCV's Stitcher: Auto is its panorama mode (features matched, cameras
estimated, a spherical projection, seams found, multi-band blending), Reposition its flat-scan mode (each photo moved
and turned, not bent), the two layouts this OpenCV's bindings reach (Photoshop's Perspective, Cylindrical and
Collage need a warper they do not expose). The answer is RGBA: transparent where no photo reaches (the pure black
the stitcher leaves there, joined to the edge), or cropped to the largest rectangle the photos fill.

Merge to HDR aligns the exposures (median threshold bitmaps, for photos taken by hand), recovers the camera's
response (Debevec) and merges them into linear radiance (Debevec), scaled so the exposure nearest the middle keeps
its mid-tones: a 32-bit picture whose highlights run past white. Exposure times come from each photo's EXIF; when
any lacks one, they are estimated from the photos themselves (the median brightness ratio of pixels mid-toned in
both, in linear light)."""
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


def panorama(images: list[bytes], layout: str, crop: bool) -> tuple[bytes, int]:
    import cv2
    imgs = [_read(d)[0] for d in images]
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
    return out.getvalue(), len(kept)


def hdr(images: list[bytes]) -> tuple[bytes, dict]:
    import cv2
    read = [_read(d) for d in images]
    imgs, exif = [r[0] for r in read], [r[1] for r in read]
    shape = imgs[0].shape
    if any(i.shape != shape for i in imgs):
        raise ValueError("Merge to HDR needs exposures of the same size.")
    cv2.createAlignMTB().process(imgs, imgs)
    lin = [((i.astype(np.float32) / 255.0 + 0.055) / 1.055) ** 2.4 for i in imgs]
    if all(e for e in exif):
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
async def panorama_route(file: list[UploadFile] = File(...), layout: str = Form("auto"), crop: bool = Form(False)) -> Response:
    if len(file) < 2:
        raise HTTPException(422, "Photomerge needs at least two overlapping photos.")
    data = [await f.read() for f in file]
    try:
        png, kept = await run_in_threadpool(panorama, data, layout, crop)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    return Response(png, media_type="image/png", headers={"X-Photos-Stitched": f"{kept}/{len(data)}"})


@router.post("/hdr")
async def hdr_route(file: list[UploadFile] = File(...)) -> Response:
    if len(file) < 2:
        raise HTTPException(422, "Merge to HDR needs at least two exposures of the same scene.")
    data = [await f.read() for f in file]
    try:
        raw, head = await run_in_threadpool(hdr, data)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    h = json.dumps(head).encode()
    return Response(len(h).to_bytes(4, "little") + h + raw, media_type="application/octet-stream")
