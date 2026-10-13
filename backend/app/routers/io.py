import io
import json
import re
from pathlib import Path

import numpy as np
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

from app.core import config
from app.services import dpx, imaging

router = APIRouter(tags=["io"])
EXPORT_NAME = re.compile(r"^[^/\\:*?\"<>|\x00-\x1f]{1,160}\.(png|jpg|jpeg|fmv|formvis|webp|tif|tiff|pdf|avif|dpx)$", re.IGNORECASE)


@router.post("/encode")
def encode(file: UploadFile = File(...), format: str = Form(...), quality: int = Form(90), dpi: int = Form(72), icc: UploadFile | None = File(default=None)) -> Response:
    try:
        data = imaging.encode(file.file.read(), format.lower(), quality, dpi, icc.file.read() if icc else None)
    except imaging.DecodeError as exc:
        raise HTTPException(status_code=415, detail=str(exc)) from exc
    return Response(data, media_type=imaging.ENCODINGS[format.lower()])


@router.post("/pages")
def image_pages(file: UploadFile = File(...)) -> dict:
    """A TIFF's pages (1.53.4): so every page can be opened, not only the first."""
    try:
        return {"pages": imaging.pages(file.file.read(), file.filename or "")}
    except imaging.DecodeError as exc:
        raise HTTPException(status_code=415, detail=str(exc)) from exc


@router.post("/decode-deep")
def decode_deep(file: UploadFile = File(...)) -> Response:
    """A picture's pixels at their own depth (1.53.6, the parity plan's H1): RGBA, 16 bits a channel, little-endian,
    with X-Depth saying whether the file held 16 bits or 8 (widened). OpenCV reads 16-bit PNG and TIFF, which Pillow
    narrows to 8."""
    import cv2
    import numpy as np
    from app.services import contained
    raw = file.file.read()
    if dpx.is_dpx(raw):
        try:
            px, info = dpx.read(raw)
        except dpx.DpxError as exc:
            raise HTTPException(status_code=415, detail=str(exc)) from exc
        return Response(np.ascontiguousarray(px).astype("<u2").tobytes(), media_type="application/octet-stream",
                        headers={"X-Width": str(info["width"]), "X-Height": str(info["height"]), "X-Depth": "16", "X-Transfer": info["transfer"], "X-Bits": str(info["bits"])})
    img = contained.decode_exr(raw) if contained.is_exr(raw) else cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_UNCHANGED)
    if img is None:
        raise HTTPException(status_code=415, detail="The picture could not be read at its depth." if not contained.is_exr(raw) else "The OpenEXR file could not be read; a malformed file is refused outside the engine.")
    if img.dtype in (np.float32, np.float64):   # 32 bits (1.53.9): Radiance HDR, OpenEXR and float TIFF, linear light
        img = img.astype(np.float32)
        if img.ndim == 2:
            img = np.stack([img, img, img], axis=2)
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB) if img.shape[2] == 3 else cv2.cvtColor(img, cv2.COLOR_BGRA2RGBA)
        if img.shape[2] == 3:
            img = np.dstack([img, np.ones(img.shape[:2], np.float32)])
        h, w = img.shape[:2]
        if w > 30000 or h > 30000 or w * h > config.MAX_PIXELS:
            raise HTTPException(status_code=413, detail="The picture is larger than formvis edits in one piece.")
        return Response(np.ascontiguousarray(img).astype("<f4").tobytes(), media_type="application/octet-stream", headers={"X-Width": str(w), "X-Height": str(h), "X-Depth": "32"})
    depth = 16 if img.dtype == np.uint16 else 8
    img = img.astype(np.uint16) * (257 if depth == 8 else 1)
    if img.ndim == 2:
        img = np.stack([img, img, img], axis=2)
    if img.shape[2] == 3:
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB); img = np.dstack([img, np.full(img.shape[:2], 65535, np.uint16)])
    else:
        img = cv2.cvtColor(img, cv2.COLOR_BGRA2RGBA)
    h, w = img.shape[:2]
    if w > 30000 or h > 30000 or w * h > config.MAX_PIXELS:
        raise HTTPException(status_code=413, detail="The picture is larger than formvis edits in one piece.")
    return Response(np.ascontiguousarray(img).astype("<u2").tobytes(), media_type="application/octet-stream", headers={"X-Width": str(w), "X-Height": str(h), "X-Depth": str(depth)})


@router.post("/encode-deep")
def encode_deep(file: UploadFile = File(...), width: int = Form(...), height: int = Form(...), format: str = Form("png")) -> Response:
    """A 16-bit PNG or TIFF from RGBA, 16 bits a channel, little-endian (1.53.6, H1)."""
    import cv2
    import numpy as np
    if format not in ("png", "tiff", "hdr", "exr", "tiff32"):
        raise HTTPException(status_code=422, detail="Deep export is 16-bit PNG or TIFF, or 32-bit Radiance HDR, OpenEXR or TIFF.")
    raw = file.file.read()
    wide = format in ("hdr", "exr", "tiff32")   # 32 bits (1.53.9): float, linear light
    if width <= 0 or height <= 0 or len(raw) != width * height * (16 if wide else 8):
        raise HTTPException(status_code=422, detail="The pixels do not match the size given.")
    img = np.frombuffer(raw, "<f4" if wide else "<u2").reshape(height, width, 4)
    if format == "hdr":   # Radiance holds no alpha
        ok, out = cv2.imencode(".hdr", cv2.cvtColor(np.ascontiguousarray(img[..., :3]), cv2.COLOR_RGB2BGR))
    elif format == "exr":
        from app.services import contained
        data = contained.encode_exr(cv2.cvtColor(np.ascontiguousarray(img), cv2.COLOR_RGBA2BGRA))
        if data is None:
            raise HTTPException(status_code=500, detail="The OpenEXR file could not be written.")
        return Response(data, media_type="image/x-exr")
    else:
        ok, out = cv2.imencode({"png": ".png", "tiff": ".tif", "tiff32": ".tif"}[format], cv2.cvtColor(np.ascontiguousarray(img), cv2.COLOR_RGBA2BGRA))
    if not ok:
        raise HTTPException(status_code=500, detail="The 16-bit file could not be written.")
    return Response(out.tobytes(), media_type={"png": "image/png", "hdr": "image/vnd.radiance", "exr": "image/x-exr"}.get(format, "image/tiff"))


@router.post("/encode-dpx")
def encode_dpx(file: UploadFile = File(...), width: int = Form(...), height: int = Form(...), bits: int = Form(10), transfer: str = Form("log"), big_endian: bool = Form(True), name: str = Form("")) -> Response:
    """A DPX film scan (DEV_PLAN 28.2) from RGBA, 16 bits a channel, little-endian, sRGB encoded: 8, 10, 12 or 16 bits,
    the transfer (linear, density or log) written into the header and applied to the data."""
    raw = file.file.read()
    if width <= 0 or height <= 0 or len(raw) != width * height * 8:
        raise HTTPException(status_code=422, detail="The pixels do not match the size given.")
    try:
        data = dpx.write(np.frombuffer(raw, "<u2").reshape(height, width, 4), bits, transfer, big_endian, name)
    except dpx.DpxError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return Response(data, media_type="image/x-dpx")


_PSD_BLENDS = {"normal": "NORMAL", "multiply": "MULTIPLY", "screen": "SCREEN", "overlay": "OVERLAY", "darken": "DARKEN", "lighten": "LIGHTEN",
               "color-dodge": "COLOR_DODGE", "color-burn": "COLOR_BURN", "hard-light": "HARD_LIGHT", "soft-light": "SOFT_LIGHT", "difference": "DIFFERENCE",
               "exclusion": "EXCLUSION", "hue": "HUE", "saturation": "SATURATION", "color": "COLOR", "luminosity": "LUMINOSITY", "linear-burn": "LINEAR_BURN",
               "linear-dodge": "LINEAR_DODGE", "vivid-light": "VIVID_LIGHT", "linear-light": "LINEAR_LIGHT", "pin-light": "PIN_LIGHT", "hard-mix": "HARD_MIX",
               "subtract": "SUBTRACT", "divide": "DIVIDE", "darker-color": "DARKER_COLOR", "lighter-color": "LIGHTER_COLOR", "dissolve": "DISSOLVE"}


def _pack(meta: dict, chunks: list[bytes]) -> bytes:
    head = json.dumps(meta).encode()
    return len(head).to_bytes(4, "little") + head + b"".join(chunks)


@router.post("/encode-tiff16")
def encode_tiff16(width: int = Form(...), height: int = Form(...), space: str = Form(...), file: list[UploadFile] = File(...)) -> Response:
    """16-bit CMYK and Lab TIFFs (1.57.8), which Pillow does not write, through tifffile (BSD-3-Clause, Christoph
    Gohlke): CMYK as separated inks with the document's profile embedded; Lab as CIELab with L* over 0 to 65535 and a*
    and b* as signed 16-bit values (a* times 256), as the TIFF specification and Photoshop have them. The window sends
    16-bit values: inks, or L and a and b in its own encoding (a and b at half for neutral). zlib-compressed."""
    import tifffile
    parts = {f.filename: f.file.read() for f in file}
    raw = parts.get("values.raw", b"")
    n = 4 if space == "cmyk" else 3
    if space not in ("cmyk", "lab") or width <= 0 or height <= 0 or width * height > config.MAX_PIXELS or len(raw) != width * height * n * 2:
        raise HTTPException(status_code=422, detail="The 16-bit values do not match the size given.")
    v = np.frombuffer(raw, "<u2").reshape(height, width, n)
    out = io.BytesIO()
    if space == "cmyk":
        icc = parts.get("profile.icc")
        tifffile.imwrite(out, v, photometric="separated", compression="zlib", extratags=[(34675, "B", len(icc), icc, True)] if icc else [])
    else:
        lab = v.astype(np.int32)
        ab = np.round((lab[..., 1:] / 65535.0 * 255.0 - 128.0) * 256.0).astype(np.int32)
        packed = np.empty((height, width, 3), np.uint16)
        packed[..., 0] = lab[..., 0].astype(np.uint16)
        packed[..., 1:] = (ab & 0xFFFF).astype(np.uint16)
        tifffile.imwrite(out, packed, photometric="cielab", compression="zlib")
    return Response(out.getvalue(), media_type="image/tiff")


@router.post("/encode-lab-tiff")
def encode_lab_tiff(width: int = Form(...), height: int = Form(...), file: UploadFile = File(...)) -> Response:
    """A Lab TIFF (1.56.6, DEV_PLAN 22.9): 8-bit CIELab (photometric 8) as the TIFF specification and Photoshop have it,
    L* as L * 255 / 100 and a* and b* as signed bytes. The window sends a and b offset by 128; they are turned signed
    here, since Pillow writes the bytes it is given (its own reading of such a file differs, which a spec reader's
    does not), and the file is LZW-compressed."""
    from PIL import Image
    raw = file.file.read()
    if width <= 0 or height <= 0 or width * height > config.MAX_PIXELS or len(raw) != width * height * 3:
        raise HTTPException(status_code=422, detail="The Lab pixels do not match the size given.")
    px = np.frombuffer(raw, np.uint8).reshape(height, width, 3).copy()
    px[..., 1:] = ((px[..., 1:].astype(np.int16) - 128) & 0xFF).astype(np.uint8)
    out = io.BytesIO()
    Image.frombytes("LAB", (width, height), px.tobytes()).save(out, "TIFF", compression="tiff_lzw")
    return Response(out.getvalue(), media_type="image/tiff")


@router.post("/decode-lab")
def decode_lab(file: UploadFile = File(...)) -> Response:
    """Lab TIFF and PSD opened as Lab (1.58.1, DEV_PLAN 22.11): a 4-byte length, a JSON header (width, height, bits,
    layers with name, left, top, width, height, opacity, visible), then each layer's L, a, b and alpha as 16-bit values
    in the window's encoding (L over 0 to 65535; a and b offset by 128 over 0 to 65535, half for neutral). An 8-bit
    CIELab TIFF is read by Pillow with a* and b* as signed bytes, as the TIFF specification has them; a 16-bit one by
    tifffile (a* and b* signed, a* times 256); a Lab PSD by psd-tools, each pixel layer through Pillow's LAB (a PSD
    keeps a and b offset by 128), or the flat image when it has no layers. 204 for a file that is not Lab."""
    from PIL import Image
    data = file.file.read()
    layers: list[dict] = []
    blobs: list[bytes] = []
    bits = 8

    def add(name: str, left: int, top: int, lab: np.ndarray, alpha: np.ndarray | None, opacity: int = 255, visible: bool = True) -> None:
        h, w = lab.shape[:2]
        a = np.full((h, w), 65535, np.uint16) if alpha is None else alpha.astype(np.uint16)
        blobs.append(np.dstack([lab.astype(np.uint16), a]).astype("<u2").tobytes())
        layers.append({"name": name, "left": int(left), "top": int(top), "width": int(w), "height": int(h), "opacity": int(opacity), "visible": bool(visible)})

    if data[:4] == b"8BPS":
        from psd_tools import PSDImage
        from psd_tools.constants import ColorMode
        try:
            psd = PSDImage.open(io.BytesIO(data))
        except Exception:
            return Response(status_code=204)
        if psd.color_mode != ColorMode.LAB:
            return Response(status_code=204)
        W, H = psd.width, psd.height
        pixel = [l for l in psd.descendants() if l.kind == "pixel" and l.width > 0 and l.height > 0]
        def from_numpy(v: np.ndarray) -> np.ndarray:
            # Photoshop's layout stores a Lab PSD's L, a and b each over 0 to 255, a and b offset by 128; psd-tools'
            # numpy gives them over 0 to 1, which is formvis's own encoding. (psd-tools' own Lab writer puts a* and b*
            # signed on disk instead, which is not Photoshop's layout; such files read wrongly here.)
            return np.clip(np.asarray(v, np.float64)[..., :3], 0, 1) * 65535.0

        for layer in pixel:
            col = layer.numpy("color")
            if col is None:
                continue
            lab = from_numpy(col)
            # Transparency from psd-tools' shape channel: Pillow's LAB bands are L, A and B, and its A is a*, not alpha.
            try:
                shape = layer.numpy("shape")
                alpha = None if shape is None else np.clip(np.asarray(shape, np.float64).reshape(lab.shape[:2]), 0, 1) * 65535.0
            except Exception:
                alpha = None
            add(layer.name, layer.left, layer.top, lab, alpha, layer.opacity, layer.visible)
        if not layers:
            flat = psd.numpy("color")
            if flat is None:
                return Response(status_code=204)
            add("Background", 0, 0, from_numpy(flat), None)
    elif data[:4] in (b"II*\x00", b"MM\x00*"):
        try:
            im = Image.open(io.BytesIO(data))
            im.load()
        except Exception:
            im = None
        W = H = 0
        if im is not None and im.mode == "LAB":
            # The TIFF specification's CIELab has a* and b* signed, as formvis (1.56.6) and Photoshop write them; Pillow
            # hands the file's bytes over as they are (and writes its own files with them offset, which this reads as
            # the specification says).
            W, H = im.size
            v = np.asarray(im, np.uint8)[..., :3].astype(np.int16)
            ab = np.where(v[..., 1:] > 127, v[..., 1:] - 256, v[..., 1:]).astype(np.float64)
            add("Background", 0, 0, np.dstack([v[..., 0] * 257.0, (ab + 128.0) * 257.0]), None)
        else:
            import tifffile
            try:
                page = tifffile.TiffFile(io.BytesIO(data)).pages[0]
            except Exception:
                return Response(status_code=204)
            if int(page.photometric) != 8 or page.bitspersample != 16:
                return Response(status_code=204)
            v = page.asarray().astype(np.int32)
            ab = np.where(v[..., 1:] > 32767, v[..., 1:] - 65536, v[..., 1:]) / 256.0
            lab = np.dstack([v[..., 0], np.clip((ab + 128.0) / 255.0, 0, 1) * 65535.0])
            H, W = lab.shape[:2]
            bits = 16
            add("Background", 0, 0, lab, None)
    else:
        return Response(status_code=204)
    head = json.dumps({"width": int(W), "height": int(H), "bits": bits, "layers": layers}).encode()
    return Response(len(head).to_bytes(4, "little") + head + b"".join(blobs), media_type="application/octet-stream")


@router.post("/decode-cmyk-psd")
def decode_cmyk_psd(file: UploadFile = File(...)) -> Response:
    """A CMYK PSD's layers as ink (1.56.1, DEV_PLAN 22.8), read by psd-tools (MIT): a 4-byte length, a JSON header
    (the document's size and each pixel layer's name, place, size, opacity, visibility and blend mode), then each
    layer's C, M, Y, K and alpha bytes in turn (a layer mask folded into the alpha), then the embedded profile. 204
    when the file is not a CMYK PSD, so the usual reader goes on."""
    from PIL import Image
    from psd_tools import PSDImage
    from psd_tools.constants import ColorMode, Resource
    data = file.file.read()
    try:
        psd = PSDImage.open(io.BytesIO(data))
    except Exception:
        return Response(status_code=204)
    if psd.color_mode != ColorMode.CMYK or psd.depth != 8:
        return Response(status_code=204)
    if psd.width * psd.height > config.MAX_PIXELS:
        raise HTTPException(status_code=413, detail="The picture is larger than formvis edits in one piece.")
    layers, chunks = [], []
    for layer in psd.descendants():
        if layer.is_group() or not layer.has_pixels() or layer.width <= 0 or layer.height <= 0:
            continue
        ink = layer.topil(apply_icc=False)
        if ink is None or ink.mode != "CMYK":
            continue
        arr = layer.numpy()
        alpha = np.clip(arr[..., 4] * 255 + 0.5, 0, 255).astype(np.uint8) if arr is not None and arr.shape[-1] >= 5 else np.full((layer.height, layer.width), 255, np.uint8)
        m = layer.mask
        if m is not None and not m.disabled and m.width > 0 and m.height > 0:
            mi = np.asarray(m.topil().convert("L"), np.float32) / 255.0
            full = np.full((layer.height, layer.width), m.background_color / 255.0, np.float32)
            x0, y0 = m.left - layer.left, m.top - layer.top
            sx0, sy0, sx1, sy1 = max(0, -x0), max(0, -y0), min(m.width, layer.width - x0), min(m.height, layer.height - y0)
            if sx1 > sx0 and sy1 > sy0:
                full[y0 + sy0:y0 + sy1, x0 + sx0:x0 + sx1] = mi[sy0:sy1, sx0:sx1]
            alpha = np.clip(alpha.astype(np.float32) * full + 0.5, 0, 255).astype(np.uint8)
        px = np.concatenate([np.asarray(ink, np.uint8).reshape(layer.height, layer.width, 4), alpha[..., None]], axis=-1)
        chunks.append(px.tobytes())
        layers.append({"name": layer.name, "left": layer.left, "top": layer.top, "width": layer.width, "height": layer.height,
                       "opacity": layer.opacity, "visible": layer.is_visible(),
                       "blend": next((k for k, v in _PSD_BLENDS.items() if v == getattr(layer.blend_mode, "name", "NORMAL")), "normal")})
    icc = psd.image_resources.get_data(Resource.ICC_PROFILE) or b""
    return Response(_pack({"width": psd.width, "height": psd.height, "layers": layers, "icc": len(icc)}, chunks + [icc]), media_type="application/octet-stream")


@router.post("/encode-cmyk-psd")
def encode_cmyk_psd(meta: str = Form(...), file: UploadFile = File(...)) -> Response:
    """A layered CMYK PSD (1.56.1), written by psd-tools: the request's `meta` names the document's size and each
    layer's name, place, size, opacity, visibility and blend mode; `file` holds the composite's C, M, Y, K and alpha
    bytes, then each layer's, then the profile. A layer's transparency is stored as a layer mask, as Photoshop's CMYK
    documents hold no transparency band."""
    from PIL import Image
    from psd_tools import PSDImage
    from psd_tools.api.layers import PixelLayer
    from psd_tools.constants import BlendMode, Resource
    from psd_tools.psd.image_resources import ImageResource
    m = json.loads(meta)
    W, H, raw = int(m["width"]), int(m["height"]), file.file.read()
    if W <= 0 or H <= 0 or W * H > config.MAX_PIXELS:
        raise HTTPException(status_code=422, detail="The document's size is out of range.")
    at = W * H * 5
    if len(raw) < at:
        raise HTTPException(status_code=422, detail="The composite does not match the size given.")

    def paper(px: np.ndarray) -> Image.Image:
        a = px[..., 4:5].astype(np.float32) / 255.0
        return Image.fromarray(np.clip(px[..., :4].astype(np.float32) * a + 0.5, 0, 255).astype(np.uint8), "CMYK")

    psd = PSDImage.frompil(paper(np.frombuffer(raw[:at], np.uint8).reshape(H, W, 5)))
    for lm in m.get("layers", []):
        w, h = int(lm["width"]), int(lm["height"])
        n = w * h * 5
        if w <= 0 or h <= 0 or at + n > len(raw):
            raise HTTPException(status_code=422, detail=f"Layer \"{lm.get('name', '')}\" does not match its size.")
        px = np.frombuffer(raw[at:at + n], np.uint8).reshape(h, w, 5)
        at += n
        layer = PixelLayer.frompil(Image.fromarray(np.ascontiguousarray(px[..., :4]), "CMYK"), psd, str(lm.get("name", "Layer")), top=int(lm["top"]), left=int(lm["left"]))
        if (px[..., 4] < 255).any():
            layer.create_mask(Image.fromarray(np.ascontiguousarray(px[..., 4]), "L"), top=int(lm["top"]), left=int(lm["left"]))
        layer.opacity = max(0, min(255, int(lm.get("opacity", 255))))
        layer.visible = bool(lm.get("visible", True))
        layer.blend_mode = BlendMode[_PSD_BLENDS.get(str(lm.get("blend", "normal")), "NORMAL")]
    icc = raw[at:]
    if icc:
        psd._record.image_resources[Resource.ICC_PROFILE] = ImageResource(key=Resource.ICC_PROFILE, data=icc)
    out = io.BytesIO()
    psd.save(out)
    return Response(out.getvalue(), media_type="image/vnd.adobe.photoshop")


@router.post("/decode-cmyk")
def decode_cmyk(file: UploadFile = File(...)) -> Response:
    """A CMYK picture's ink (1.54.0, the parity plan's H1): C, M, Y, K and alpha, a byte each, then the embedded
    profile's bytes (X-Profile-Bytes long, 0 when none). 204 when the file is not CMYK, so the usual decode goes on."""
    from PIL import Image, UnidentifiedImageError
    data = file.file.read()
    try:
        with Image.open(io.BytesIO(data)) as img:
            if img.mode != "CMYK":
                return Response(status_code=204)
            w, h = img.size
            if w > 30000 or h > 30000 or w * h > config.MAX_PIXELS:
                raise HTTPException(status_code=413, detail="The picture is larger than formvis edits in one piece.")
            icc = img.info.get("icc_profile") or b""
            ink = np.asarray(img).reshape(h * w, 4)
    except (UnidentifiedImageError, OSError, ValueError):
        return Response(status_code=204)
    px = np.concatenate([ink, np.full((h * w, 1), 255, np.uint8)], axis=1).astype(np.uint8).tobytes()
    return Response(px + icc, media_type="application/octet-stream", headers={"X-Width": str(w), "X-Height": str(h), "X-Profile-Bytes": str(len(icc))})


@router.post("/encode-cmyk")
def encode_cmyk(file: UploadFile = File(...), width: int = Form(...), height: int = Form(...), format: str = Form("tiff"), quality: int = Form(90), dpi: int = Form(72), icc: UploadFile | None = File(default=None)) -> Response:
    """A CMYK TIFF or JPEG from C, M, Y, K and alpha bytes (1.54.0): alpha lays the ink over paper, the profile embedded."""
    from PIL import Image
    if format not in ("tiff", "jpg"):
        raise HTTPException(status_code=422, detail="CMYK export is TIFF or JPEG.")
    raw = file.file.read()
    if width <= 0 or height <= 0 or len(raw) != width * height * 5:
        raise HTTPException(status_code=422, detail="The pixels do not match the size given.")
    px = np.frombuffer(raw, np.uint8).reshape(height, width, 5).astype(np.float32)
    ink = np.clip(px[..., :4] * (px[..., 4:5] / 255.0) + 0.5, 0, 255).astype(np.uint8)
    img = Image.fromarray(ink, "CMYK")
    out = io.BytesIO()
    extra = {"icc_profile": icc.file.read()} if icc else {}
    if format == "jpg":
        img.save(out, "JPEG", quality=max(1, min(100, quality)), dpi=(dpi, dpi), **extra)
    else:
        img.save(out, "TIFF", compression="tiff_deflate", dpi=(dpi, dpi), **extra)
    return Response(out.getvalue(), media_type="image/jpeg" if format == "jpg" else "image/tiff")


@router.post("/decode")
def decode(file: UploadFile = File(...), page: int = Form(0)) -> Response:
    data = file.file.read()
    try:
        png, width, height = imaging.decode_to_png(data, file.filename or "", page)
    except imaging.DecodeError as exc:
        raise HTTPException(status_code=415, detail=str(exc)) from exc
    return Response(content=png, media_type="image/png", headers={"X-Width": str(width), "X-Height": str(height)})


@router.post("/export")
def export(file: UploadFile = File(...), name: str = Form(...)) -> dict:
    base = Path(name.replace("\\", "/")).name.strip()
    if base.startswith(".") or not EXPORT_NAME.match(base):
        raise HTTPException(status_code=400, detail="Invalid export file name.")
    folder = config.exports_dir()
    target = folder / base
    number = 2
    while target.exists():
        target = folder / f"{Path(base).stem} {number}{Path(base).suffix}"
        number += 1
    target.write_bytes(file.file.read())
    return {"path": str(target)}
