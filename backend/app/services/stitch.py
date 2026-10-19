"""Photo registration shared by Edit > Auto-Align Layers and File > Automate > Photomerge, through OpenCV.

Every picture is a BGRA array (alpha 0 where it has no pixels). `prepare` corrects lens distortion (one radial term
k1, found as the value at which the matched features agree best under a rotation-only camera) and optionally takes out
the vignette; `register` places the pictures on a reference with a homography (perspective), a similarity (collage),
a translation (reposition) or, for cylindrical, after bending every picture onto a cylinder whose radius is the
focal length found from the pairwise homographies. Pictures are chained along a spanning tree of their best matches,
so one that does not overlap the reference still lands through a neighbour."""
import cv2
import numpy as np

IDENT = np.eye(3)


def detector() -> tuple:
    try:
        return cv2.SIFT_create(5000), cv2.NORM_L2
    except (AttributeError, cv2.error):
        return cv2.ORB_create(5000), cv2.NORM_HAMMING


def frame(img: np.ndarray) -> tuple[float, float, float]:
    """Centre and half-diagonal of the pixels a picture has."""
    ys, xs = np.nonzero(img[..., 3] > 0)
    if len(xs) == 0:
        return img.shape[1] / 2, img.shape[0] / 2, float(np.hypot(*img.shape[:2])) / 2
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    return (x0 + x1) / 2, (y0 + y1) / 2, float(np.hypot(x1 - x0 + 1, y1 - y0 + 1)) / 2


def features(det, img: np.ndarray):
    mask = cv2.erode((img[..., 3] > 0).astype(np.uint8) * 255, np.ones((5, 5), np.uint8))
    return det.detectAndCompute(cv2.cvtColor(img[..., :3], cv2.COLOR_BGR2GRAY), mask)


def match(norm: int, a, b) -> tuple[np.ndarray, np.ndarray]:
    """Points of `a` and of `b` that the ratio test pairs."""
    ka, da = a
    kb, db = b
    empty = np.zeros((0, 2), np.float32)
    if da is None or db is None or len(da) < 2 or len(db) < 2:
        return empty, empty
    good = [m[0] for m in cv2.BFMatcher(norm).knnMatch(da, db, k=2) if len(m) == 2 and m[0].distance < 0.75 * m[1].distance]
    if not good:
        return empty, empty
    return np.float32([ka[m.queryIdx].pt for m in good]), np.float32([kb[m.trainIdx].pt for m in good])


def tree(imgs: list[np.ndarray], ref: int, feats: list, norm: int) -> tuple[list[int], dict[int, tuple[int, np.ndarray, np.ndarray]]]:
    """Order of placement from `ref` and, per picture, (parent, its points, the parent's points): each next picture is
    the unplaced one with the most matches to any placed one."""
    cache: dict[tuple[int, int], tuple[np.ndarray, np.ndarray]] = {}

    def pair(j: int, i: int) -> tuple[np.ndarray, np.ndarray]:
        if (j, i) not in cache:
            cache[(j, i)] = match(norm, feats[j], feats[i])
        return cache[(j, i)]

    placed, edges = [ref], {}
    while len(placed) < len(imgs):
        best = (0, -1, -1)
        for j in range(len(imgs)):
            if j in placed:
                continue
            for i in placed:
                n = len(pair(j, i)[0])
                if n > best[0]:
                    best = (n, j, i)
        if best[0] < 8:
            left = next(j for j in range(len(imgs)) if j not in placed)
            raise ValueError(f"Picture {left + 1} does not overlap the others enough to align.")
        _, j, i = best
        edges[j] = (i, *pair(j, i))
        placed.append(j)
    return placed, edges


def radial(p: np.ndarray, k: float, c: tuple[float, float], r: float) -> np.ndarray:
    """Points of a distorted picture moved to where an undistorted one has them: p + (p - c) k |(p - c) / r|^2."""
    d = (p - np.array(c, np.float32)) / r
    return np.array(c, np.float32) + (p - np.array(c, np.float32)) * (1.0 + k * (d * d).sum(axis=-1, keepdims=True))


def undistort(img: np.ndarray, k: float, c: tuple[float, float], r: float) -> np.ndarray:
    h, w = img.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    q = np.stack([xx, yy], axis=-1)
    cc = np.array(c, np.float32)
    p = q.copy()
    for _ in range(8):
        d = (p - cc) / r
        p = cc + (q - cc) / (1.0 + k * (d * d).sum(axis=-1, keepdims=True))
    return cv2.remap(img, p[..., 0].copy(), p[..., 1].copy(), cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))


def _homography(src: np.ndarray, dst: np.ndarray, thr: float = 3.0):
    cv2.setRNGSeed(1)
    h, mask = cv2.findHomography(src, dst, cv2.RANSAC, thr)
    return h, mask


def _trimmed_rms(src: np.ndarray, dst: np.ndarray) -> float:
    h, _ = _homography(src, dst, 2.0)
    if h is None:
        return 1e9
    e = np.sort(np.linalg.norm(cv2.perspectiveTransform(src.reshape(-1, 1, 2), h).reshape(-1, 2) - dst, axis=1))
    return float(np.sqrt(np.mean(e[: max(8, int(len(e) * 0.7))] ** 2)))


def lens_k1(edges: list[tuple[np.ndarray, np.ndarray, tuple, float, tuple, float]]) -> tuple[float, float, float]:
    """(k1, residual at k1 = 0, residual at k1) in pixels, over every matched pair; k1 stays 0 unless it brings a clear gain."""
    sub = []
    for s, d, ca, ra, cb, rb in edges:
        step = max(1, len(s) // 300)
        sub.append((s[::step], d[::step], ca, ra, cb, rb))

    def cost(k: float) -> float:
        return sum(_trimmed_rms(radial(s, k, ca, ra), radial(d, k, cb, rb)) for s, d, ca, ra, cb, rb in sub) / len(sub)

    grid = np.linspace(-0.3, 0.3, 13)
    costs = [cost(float(k)) for k in grid]
    at = int(np.argmin(costs))
    lo, hi = float(grid[max(0, at - 1)]), float(grid[min(len(grid) - 1, at + 1)])
    for _ in range(10):
        a, b = lo + (hi - lo) * 0.382, lo + (hi - lo) * 0.618
        if cost(a) < cost(b):
            hi = b
        else:
            lo = a
    k = (lo + hi) / 2
    base, best = cost(0.0), cost(k)
    if best > 0.92 * base:
        return 0.0, base, base
    return float(k), base, best


def focal(h: np.ndarray, ca: tuple[float, float], cb: tuple[float, float], size: float) -> tuple[float, float]:
    """The focal length (pixels) at which `h` is closest to a pure rotation K R K^-1, and how far from one it still is."""
    ta = np.array([[1, 0, -ca[0]], [0, 1, -ca[1]], [0, 0, 1.0]])
    tb = np.array([[1, 0, -cb[0]], [0, 1, -cb[1]], [0, 0, 1.0]])
    h0 = tb @ h @ np.linalg.inv(ta)
    if np.linalg.det(h0) <= 0:
        return size, 1e9

    def err(f: float) -> float:
        kk = np.diag([f, f, 1.0])
        m = np.linalg.inv(kk) @ h0 @ kk
        m = m / np.cbrt(np.linalg.det(m))
        return float(np.linalg.norm(m.T @ m - np.eye(3)))

    fs = np.geomspace(0.3 * size, 8 * size, 240)
    es = [err(float(f)) for f in fs]
    at = int(np.argmin(es))
    lo, hi = float(fs[max(0, at - 1)]), float(fs[min(len(fs) - 1, at + 1)])
    for _ in range(30):
        a, b = lo + (hi - lo) * 0.382, lo + (hi - lo) * 0.618
        if err(a) < err(b):
            hi = b
        else:
            lo = a
    f = (lo + hi) / 2
    return f, err(f)


def cylinder(img: np.ndarray, f: float, c: tuple[float, float]) -> np.ndarray:
    """The picture bent onto a cylinder of radius f about its centre: u = f atan(x / f), v = f y / sqrt(x^2 + f^2)."""
    h, w = img.shape[:2]
    uu, vv = np.mgrid[0:h, 0:w].astype(np.float32)[::-1]
    th = (uu - c[0]) / f
    ok = np.abs(th) < 1.4
    x = np.where(ok, f * np.tan(th) + c[0], -1.0).astype(np.float32)
    y = np.where(ok, (vv - c[1]) / np.cos(th) + c[1], -1.0).astype(np.float32)
    return cv2.remap(img, x, y, cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))


def sphere(img: np.ndarray, f: float, c: tuple[float, float]) -> np.ndarray:
    """The picture bent onto a sphere of radius f about its centre: u = f atan(x / f), v = f atan(y / sqrt(x^2 + f^2))."""
    h, w = img.shape[:2]
    uu, vv = np.mgrid[0:h, 0:w].astype(np.float32)[::-1]
    th, ph = (uu - c[0]) / f, (vv - c[1]) / f
    z = np.cos(th) * np.cos(ph)
    ok = z > 0.2
    zs = np.where(ok, z, 1.0)
    x = np.where(ok, f * np.sin(th) * np.cos(ph) / zs + c[0], -1.0).astype(np.float32)
    y = np.where(ok, f * np.sin(ph) / zs + c[1], -1.0).astype(np.float32)
    return cv2.remap(img, x, y, cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))


def edge_matrix(src: np.ndarray, dst: np.ndarray, kind: str) -> tuple[np.ndarray, int, str]:
    """3x3 matrix taking `src` to `dst`: a homography, a similarity or a translation, with how many points agree."""
    if kind == "homography" and len(src) >= 8:
        h, mask = _homography(src, dst)
        if h is not None and mask is not None and int(mask.sum()) >= 8 and 0.25 < abs(np.linalg.det(h[:2, :2])) < 4.0:
            return h / h[2, 2], int(mask.sum()), "homography"
    if kind in ("homography", "similarity") and len(src) >= 6:
        cv2.setRNGSeed(1)
        a, mask = cv2.estimateAffinePartial2D(src, dst, method=cv2.RANSAC, ransacReprojThreshold=3.0)
        if a is not None and mask is not None and int(mask.sum()) >= 6:
            s = float(np.hypot(a[0, 0], a[0, 1]))
            if 0.7 < s < 1.4:
                return np.vstack([a, [0, 0, 1.0]]), int(mask.sum()), "similarity"
    d = dst - src
    med = np.median(d, axis=0)
    near = np.linalg.norm(d - med, axis=1) < 3.0
    t = d[near].mean(axis=0) if near.any() else med
    return np.array([[1, 0, t[0]], [0, 1, t[1]], [0, 0, 1.0]]), int(near.sum()), "translation"


def apply_gain(img: np.ndarray, g: dict) -> np.ndarray:
    """A vignette gain table (r = 0 at the centre, 1 at the radius) multiplied into the colour of every pixel that has any."""
    h, w = img.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    t = np.clip(np.hypot(xx + 0.5 - g["cx"], yy + 0.5 - g["cy"]) / g["radius"], 0, 1)
    k = np.interp(t, np.linspace(0, 1, len(g["lut"])), g["lut"]).astype(np.float32)
    out = img.copy()
    out[..., :3] = np.clip(img[..., :3].astype(np.float32) * k[..., None] + 0.5, 0, 255).astype(np.uint8)
    out[..., :3][img[..., 3] == 0] = 0
    return out


def prepare(imgs: list[np.ndarray], ref: int, distortion: bool, vignette: bool, gains_fn=None) -> tuple[list[np.ndarray], dict]:
    """The pictures with lens distortion and vignetting taken out, and what was found: {"k1", "error_before",
    "error_after", "vignette"}. Needs overlapping pictures; anything that cannot be measured is left as it is."""
    info: dict = {"k1": 0.0, "error_before": None, "error_after": None, "vignette": "off"}
    if not distortion and not vignette:
        return imgs, info
    det, norm = detector()
    feats = [features(det, i) for i in imgs]
    _, edges = tree(imgs, ref, feats, norm)
    frames = [frame(i) for i in imgs]
    out = list(imgs)
    if distortion:
        k, before, after = lens_k1([(s, d, frames[j][:2], frames[j][2], frames[i][:2], frames[i][2]) for j, (i, s, d) in edges.items()])
        info.update(k1=round(k, 4), error_before=round(before, 3), error_after=round(after, 3))
        if k != 0.0:
            out = [undistort(im, k, fr[:2], fr[2]) for im, fr in zip(imgs, frames)]
    if vignette and gains_fn and len({i.shape for i in out}) == 1:
        order = [ref] + [i for i in range(len(out)) if i != ref]
        pts = {j: (i, radial(s, info["k1"], frames[j][:2], frames[j][2]), radial(d, info["k1"], frames[i][:2], frames[i][2])) for j, (i, s, d) in edges.items()} if distortion else edges
        mats: dict[int, np.ndarray] = {ref: IDENT}
        for j in tree_order(edges, ref):
            i, s, d = pts[j]
            m, _, _ = edge_matrix(s, d, "homography")
            mats[j] = mats[i] @ m
        layers = [(out[j][..., :3], out[j][..., 3] > 0) for j in order]
        gains = gains_fn(layers, [mats[j].ravel().tolist() for j in order])
        if any(gains):
            for pos, j in enumerate(order):
                if gains[pos]:
                    out[j] = apply_gain(out[j], gains[pos])
            info["vignette"] = "applied"
        else:
            info["vignette"] = "no vignetting found"
    elif vignette:
        info["vignette"] = "skipped: the pictures differ in size"
    return out, info


def tree_order(edges: dict, ref: int) -> list[int]:
    """Placement order of the pictures that have a parent: every parent comes before its children."""
    done, rest, out = {ref}, dict(edges), []
    while rest:
        for j, (i, *_) in list(rest.items()):
            if i in done:
                out.append(j)
                done.add(j)
                del rest[j]
    return out


def register(imgs: list[np.ndarray], projection: str, ref: int = 0) -> tuple[list[np.ndarray], list[np.ndarray], list[dict]]:
    """(pictures as placed, a 3x3 per picture into the reference's pixels, per picture {"inliers", "kind"}).
    Cylindrical returns the pictures bent onto the cylinder, the others return them as they came."""
    det, norm = detector()
    feats = [features(det, i) for i in imgs]
    _, edges = tree(imgs, ref, feats, norm)
    frames = [frame(i) for i in imgs]
    kind = {"reposition": "translation", "collage": "similarity"}.get(projection, "homography")
    out = list(imgs)
    f_used = None
    if projection in ("cylindrical", "spherical"):
        size = max(imgs[ref].shape[:2])
        fs = []
        for j, (i, s, d) in edges.items():
            h, mask = _homography(s, d)
            if h is None or mask is None or int(mask.sum()) < 8:
                continue
            f, e = focal(h, frames[j][:2], frames[i][:2], size)
            if e < 0.2:
                fs.append(f)
        f_used = float(np.median(fs)) if fs else float(size)
        bend = sphere if projection == "spherical" else cylinder
        out = [bend(im, f_used, fr[:2]) for im, fr in zip(imgs, frames)]
        feats = [features(det, im) for im in out]
        _, edges = tree(out, ref, feats, norm)
        kind = "similarity"
    mats = [IDENT] * len(imgs)
    info: list[dict] = [{"inliers": 0, "kind": "reference"} for _ in imgs]
    for j in tree_order(edges, ref):
        i, s, d = edges[j]
        m, n, k = edge_matrix(s, d, kind)
        mats[j] = mats[i] @ m
        mats[j] = mats[j] / mats[j][2, 2]
        info[j] = {"inliers": n, "kind": "cylindrical" if f_used else k}
    if f_used:
        info[ref]["focal"] = round(f_used, 1)
    return out, mats, info


def compose(imgs: list[np.ndarray], mats: list[np.ndarray], limit: int = 12000) -> tuple[np.ndarray, np.ndarray]:
    """The placed pictures on one canvas, feathered where they overlap: (BGRA canvas, per-picture coverage count)."""
    corners = []
    for im, m in zip(imgs, mats):
        ys, xs = np.nonzero(im[..., 3] > 0)
        if len(xs) == 0:
            continue
        box = np.float32([[xs.min(), ys.min()], [xs.max() + 1, ys.min()], [xs.max() + 1, ys.max() + 1], [xs.min(), ys.max() + 1]]).reshape(-1, 1, 2)
        if (m @ np.vstack([box.reshape(-1, 2).T, np.ones(4)]))[2].min() <= 0.05:
            raise ValueError("These photos span too wide an angle for this layout; try Cylindrical.")
        corners.append(cv2.perspectiveTransform(box, m).reshape(-1, 2))
    allc = np.concatenate(corners)
    x0, y0 = np.floor(allc.min(axis=0)), np.ceil(allc.max(axis=0))
    w, h = int(y0[0] - x0[0]), int(y0[1] - x0[1])
    k = min(1.0, limit / max(w, h), (60e6 / max(1, w * h)) ** 0.5)
    shift = np.array([[k, 0, -x0[0] * k], [0, k, -x0[1] * k], [0, 0, 1.0]])
    w, h = max(1, round(w * k)), max(1, round(h * k))
    acc = np.zeros((h, w, 3), np.float32)
    wsum = np.zeros((h, w), np.float32)
    cover = np.zeros((h, w), np.uint8)
    for im, m in zip(imgs, mats):
        valid = (im[..., 3] > 0).astype(np.uint8)
        dist = cv2.distanceTransform(cv2.erode(valid, np.ones((3, 3), np.uint8)), cv2.DIST_L2, 3).astype(np.float32)
        mm = shift @ m
        px = cv2.warpPerspective(im[..., :3], mm, (w, h), flags=cv2.INTER_LINEAR).astype(np.float32)
        wt = cv2.warpPerspective((np.minimum(dist, 64.0) + 1e-3 * valid).astype(np.float32), mm, (w, h), flags=cv2.INTER_LINEAR) * (cv2.warpPerspective(valid, mm, (w, h), flags=cv2.INTER_NEAREST) > 0)
        acc += px * wt[..., None]
        wsum += wt
        cover |= (wt > 0).astype(np.uint8)
    rgb = np.where(wsum[..., None] > 0, acc / np.maximum(wsum, 1e-6)[..., None], 0)
    return np.dstack([np.clip(rgb + 0.5, 0, 255).astype(np.uint8), cover * 255]), cover
