import base64
import io

from PIL import Image, ImageCms

SCENE = """async () => {
  const e = window.formvis.engine;
  e.newDocument(60, 40, 'Colour', 'white');
  const c = e.current.activeLayer.raster.ctx;
  c.fillStyle = 'rgb(204,77,51)'; c.fillRect(0, 0, 30, 40); c.fillStyle = 'rgb(20,200,90)'; c.fillRect(30, 0, 30, 40);
  e.current.activeLayer.raster.touch(); e.refresh();
}"""
EXPORT = """async ([format, profile]) => {
  const got = new Promise((resolve) => {
    const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      HTMLAnchorElement.prototype.click = orig;
      fetch(this.href).then((r) => r.arrayBuffer()).then((buf) => { let s = ''; new Uint8Array(buf).forEach((b) => { s += String.fromCharCode(b); }); resolve({ name: this.download, b64: btoa(s) }); });
    };
  });
  if (!window.formvis.commands.run('export-as')) throw new Error('export-as');
  const field = (label) => { const f = [...document.querySelectorAll('.cv-scrim:not([hidden]) .cv-field')].find((x) => x.textContent.trim().startsWith(label)); if (!f) throw new Error('missing ' + label); return f.querySelector('select'); };
  const pick = (label, v) => { const s = field(label); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); };
  pick('Format', format); pick('Colour profile', profile);
  const b = [...document.querySelectorAll('.cv-scrim:not([hidden]) .cv-dialog-foot button')].find((x) => x.textContent === 'Export'); if (!b) throw new Error('missing export'); b.click();
  return await Promise.race([got, new Promise((r) => setTimeout(() => r(null), 20000))]);
}"""
SRGB = ImageCms.createProfile("sRGB")


def back_to_srgb(data):
    img = Image.open(io.BytesIO(data))
    icc = img.info.get("icc_profile")
    assert icc, "no embedded profile"
    prof = ImageCms.ImageCmsProfile(io.BytesIO(icc))
    rgb = ImageCms.profileToProfile(img.convert("RGB"), prof, SRGB, renderingIntent=ImageCms.Intent.RELATIVE_COLORIMETRIC)
    return ImageCms.getProfileDescription(prof).strip(), rgb.getpixel((10, 20)), rgb.getpixel((50, 20))


def close(a, b, tol):
    return all(abs(x - y) <= tol for x, y in zip(a, b))


def test_exports_carry_their_profile_and_colours(page):
    page.evaluate(SCENE)
    for fmt, tol in [("png", 1), ("jpg", 6), ("webp", 8), ("tiff", 1)]:
        r = page.evaluate(EXPORT, [fmt, "display-p3"])
        assert r, fmt
        desc, left, right = back_to_srgb(base64.b64decode(r["b64"]))
        assert desc == "Display P3", (fmt, desc)
        # Back to sRGB through LittleCMS: 8-bit storage costs a few levels in dark channels (sRGB 20 comes back as 23,
        # as Chrome also shows when it opens such a file), so the round trip allows 4 beyond the format's own loss.
        assert close(left, (204, 77, 51), tol + 4) and close(right, (20, 200, 90), tol + 4), (fmt, left, right)
        # the stored numbers really are Display P3's, not sRGB's
        raw = Image.open(io.BytesIO(base64.b64decode(r["b64"]))).convert("RGB").getpixel((50, 20))
        assert close(raw, (93, 197, 103), tol), (fmt, raw)
        if fmt == "jpg":
            # Chrome's encoder writes an sRGB profile of its own; ours replaces it rather than sitting beside it.
            assert base64.b64decode(r["b64"]).count(b"ICC_PROFILE\x00") == 1
    r = page.evaluate(EXPORT, ["png", "adobe-rgb"])
    desc, left, _ = back_to_srgb(base64.b64decode(r["b64"]))
    assert desc == "Adobe RGB (1998)" and close(left, (204, 77, 51), 1), (desc, left)
    r = page.evaluate(EXPORT, ["png", "srgb"])
    desc, left, _ = back_to_srgb(base64.b64decode(r["b64"]))
    assert desc == "sRGB IEC61966-2.1" and left == (204, 77, 51), (desc, left)
