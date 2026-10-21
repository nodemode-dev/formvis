"""Rebuilds every fixture beside this script. PSDs are written by hand from the published file layout (struct),
EXR with the OpenEXR bindings, ICC with Pillow's ImageCms, Cineon by hand from the published header layout, EXIF with
Pillow. None of it goes through formvis's own writers. Run: python3 make_fixtures.py"""
import io
import os
import struct
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageCms

OUT = Path(__file__).resolve().parent
W, H = 32, 24


def u16(v):
    return struct.pack(">H", v)


def u32(v):
    return struct.pack(">I", v)


def pad(b, n):
    return b + b"\0" * ((-len(b)) % n)


def pascal(s, n):
    b = s.encode("latin-1")
    return pad(bytes([len(b)]) + b, n)


def unistr(s):
    return u32(len(s)) + s.encode("utf-16-be")


def key(k):
    return u32(len(k)) + k.encode() if len(k) != 4 else u32(0) + k.encode()


def d_long(v):
    return b"long" + struct.pack(">i", v)


def d_doub(v):
    return b"doub" + struct.pack(">d", v)


def d_bool(v):
    return b"bool" + bytes([1 if v else 0])


def d_untf(unit, v):
    return b"UntF" + unit.encode() + struct.pack(">d", v)


def d_text(s):
    return b"TEXT" + unistr(s + "\0")


def d_enum(t, e):
    return b"enum" + key(t) + key(e)


def d_objc(cls, items, name=""):
    body = unistr(name) + key(cls) + u32(len(items))
    for k, v in items:
        body += key(k) + v
    return b"Objc" + body


def d_list(vals):
    return b"VlLs" + u32(len(vals)) + b"".join(vals)


def descriptor(cls, items):
    return u32(16) + unistr("") + key(cls) + u32(len(items)) + b"".join(key(k) + v for k, v in items)


def rgbc(r, g, b):
    return d_objc("RGBC", [("Rd  ", d_doub(r)), ("Grn ", d_doub(g)), ("Bl  ", d_doub(b))])


def fixed(v):
    return struct.pack(">i", int(round(v * (1 << 24))))


def vmsk_rect(x0, y0, x1, y1, invert=False):
    rec = lambda sel, body: u16(sel) + body.ljust(24, b"\0")[:24]
    out = u32(3) + u32(1 if invert else 0)
    out += rec(6, b"") + rec(8, u16(0)) + rec(0, u16(4))
    for (x, y) in ((x0, y0), (x1, y0), (x1, y1), (x0, y1)):
        pt = fixed(y / H) + fixed(x / W)
        out += rec(1, pt * 3)
    out += rec(6, b"")
    return out


class Layer:
    def __init__(self, name, rect, rgb=(200, 30, 30), alpha=None, blend=b"norm", opacity=255, blocks=None, mask=None, ranges=b"", flags=0, pixels=None):
        self.name, self.rect, self.blend, self.opacity, self.blocks, self.ranges, self.flags = name, rect, blend, opacity, blocks or [], ranges, flags
        t, l, b, r = rect
        h, w = b - t, r - l
        if pixels is not None:
            self.planes = pixels
        else:
            self.planes = [np.full((h, w), rgb[i], np.uint8) for i in range(3)] + [np.full((h, w), 255 if alpha is None else alpha, np.uint8)]
        self.mask = mask

    def record(self):
        t, l, b, r = self.rect
        ids = [0, 1, 2, 3, -1] if len(self.planes) == 5 else [0, 1, 2, -1][: len(self.planes)]
        chans = list(zip(ids, self.planes))
        if self.mask is not None:
            chans.append((-2, self.mask))
        rec = struct.pack(">iiii", t, l, b, r) + u16(len(chans))
        for cid, p in chans:
            rec += struct.pack(">h", cid) + u32(2 + p.size)
        mask = b"" if self.mask is None else u32(20) + struct.pack(">iiii", t, l, b, r)[:16] + bytes([0, 0]) + u16(0)
        if self.mask is not None:
            mask = u32(20) + struct.pack(">iiii", t, l, b, r) + bytes([0, 0, 0, 0])
        else:
            mask = u32(0)
        extra = mask + u32(len(self.ranges)) + self.ranges + pascal(self.name, 4)
        for k, data in self.blocks:
            data = pad(data, 4)
            extra += b"8BIM" + k.encode() + u32(len(data)) + data
        rec += b"8BIM" + self.blend + bytes([self.opacity, 0, self.flags, 0]) + u32(len(extra)) + extra
        return rec

    def data(self):
        out = b""
        chans = list(self.planes) + ([self.mask] if self.mask is not None else [])
        for p in chans:
            out += u16(0) + p.tobytes()
        return out


def group_markers(name, blocks=None, collapsed=False, blend=b"pass"):
    end = Layer("</Layer group>", (0, 0, 0, 0), blocks=[("lsct", u32(3))], pixels=[])
    start = Layer(name, (0, 0, 0, 0), blend=blend, blocks=[("lsct", u32(2 if collapsed else 1))] + (blocks or []), pixels=[])
    return end, start


def resource(rid, data, name=""):
    return b"8BIM" + u16(rid) + pascal(name, 2) + u32(len(data)) + pad(data, 2)


def packbits(row):
    out, i, n = b"", 0, len(row)
    while i < n:
        j = i
        while j + 1 < n and row[j + 1] == row[i] and j - i < 127:
            j += 1
        if j > i:
            out += bytes([257 - (j - i + 1)]) + bytes([row[i]])
            i = j + 1
        else:
            k = i
            while k + 1 < n and (k + 2 >= n or row[k + 1] != row[k + 2]) and k - i < 127:
                k += 1
            out += bytes([k - i]) + bytes(row[i:k + 1])
            i = k + 1
    return out


def rle_merged(planes, depth):
    rows = [packbits(bytes(r)) for p in planes for r in p.astype(np.uint8)]
    return u16(1) + b"".join(u16(len(r)) for r in rows) + b"".join(rows)


def build(mode, depth, layers=None, resources=b"", colordata=b"", merged=None, channels=3, w=W, h=H, version=1, globals_=b"", layer16=False, rle=False):
    head = b"8BPS" + u16(version) + b"\0" * 6 + u16(channels) + u32(h) + u32(w) + u16(depth) + u16(mode)
    body = u32(len(colordata)) + colordata + u32(len(resources)) + resources
    if layers:
        recs = b"".join(l.record() for l in layers)
        dat = b"".join(l.data() for l in layers)
        info = struct.pack(">h", len(layers)) + recs + dat
        info = pad(info, 4)
        lm = u32(len(info)) + info + u32(0) + globals_
        body += u32(len(lm)) + lm
    else:
        body += (b"\0" * 8 if version == 2 else u32(0))
    bps = depth // 8
    if rle:
        return head + body + rle_merged(merged, depth)
    comp = u16(0)
    for p in merged:
        comp += p.astype(">u2" if bps == 2 else np.uint8).tobytes()
    return head + body + comp


def solid_planes(vals, w=W, h=H, dtype=np.uint8):
    return [np.full((h, w), v, dtype) for v in vals]


def gradient_plane(w=W, h=H):
    return np.tile(np.linspace(0, 255, w).astype(np.uint8), (h, 1))


def write(name, data):
    (OUT / name).write_bytes(data)
    assert len(data) < 300_000, name


def guides_resource(h=(8, 16), v=(10,)):
    body = u32(1) + u32(0) + u32(0) + u32(len(h) + len(v))
    for g in v:
        body += u32(g * 32) + bytes([0])
    for g in h:
        body += u32(g * 32) + bytes([1])
    return resource(1032, body)


def make_modes():
    gray = [gradient_plane()]
    write("psd_mode_gray.psd", build(1, 8, merged=gray, channels=1))
    pal = bytes(range(256)) + bytes(255 - i for i in range(256)) + bytes([(i * 7) % 256 for i in range(256)])
    idx = [np.tile((np.arange(W) % 4 * 60).astype(np.uint8), (H, 1))]
    write("psd_mode_indexed.psd", build(2, 8, colordata=pal, merged=idx, channels=1))
    rows = np.zeros((H, W // 8), np.uint8)
    rows[:, :2] = 0xFF
    write("psd_mode_indexed_rle.psd", build(2, 8, colordata=pal, merged=idx, channels=1, rle=True))
    write("psd_mode_gray_rle.psd", build(1, 8, merged=gray, channels=1, rle=True))
    write("psd_mode_bitmap.psd", b"8BPS" + u16(1) + b"\0" * 6 + u16(1) + u32(H) + u32(W) + u16(1) + u16(0) + u32(0) + u32(0) + u32(0) + u16(0) + rows.tobytes())
    write("psd_mode_rgb16.psd", build(3, 16, merged=[np.full((H, W), 40000, np.uint16), np.full((H, W), 20000, np.uint16), np.full((H, W), 10000, np.uint16)], channels=3))
    write("psd_mode_cmyk.psd", build(4, 8, merged=solid_planes([255 - 200, 255 - 100, 255 - 50, 255 - 0]), channels=4))
    cm = Layer("Ink layer", (2, 2, 14, 14), pixels=[np.full((12, 12), v, np.uint8) for v in (255 - 200, 255 - 100, 255 - 50, 255, 255)])
    write("psd_mode_cmyk_layered.psd", build(4, 8, layers=[cm], merged=solid_planes([255 - 200, 255 - 100, 255 - 50, 255]), channels=4))
    write("psd_mode_lab.psd", build(9, 8, merged=solid_planes([128, 190, 90]), channels=3))
    write("psd_mode_multichannel.psd", build(7, 8, merged=solid_planes([50, 120, 200]), channels=3))
    duo = struct.pack(">H", 1) + b"\0" * 10
    write("psd_mode_duotone.psd", build(8, 8, colordata=b"\0\1" + b"\0" * 20, merged=[gradient_plane()], channels=1))


def make_layered():
    rect = (4, 4, 20, 28)
    red = Layer("Red box", rect, (220, 30, 30))
    mrect = (2, 2, 14, 14)
    maskplane = np.zeros((12, 12), np.uint8)
    maskplane[:, :6] = 255
    masked = Layer("Masked", mrect, (30, 200, 60), mask=maskplane)
    vm = Layer("Vector masked", (0, 0, H, W), (30, 60, 220), blocks=[("vmsk", vmsk_rect(4, 4, 20, 16))])
    vm_inv = Layer("Vector inverted", (0, 0, H, W), (230, 200, 20), blocks=[("vmsk", vmsk_rect(10, 10, 18, 18, invert=True))])
    shape_alpha = np.zeros((H, W), np.uint8)
    shape_alpha[2:10, 22:30] = 255
    shape = Layer("Shape 1", (0, 0, H, W), pixels=solid_planes([10, 150, 200]) + [shape_alpha], blocks=[("SoCo", descriptor("null", [("Clr ", rgbc(10, 150, 200))])), ("vmsk", vmsk_rect(22, 2, 30, 10))])
    shadows = d_list([d_objc("DrSh", [("enab", d_bool(True)), ("Md  ", d_enum("BlnM", "Mltp")), ("Clr ", rgbc(0, 0, 0)), ("Opct", d_untf("#Prc", 60 + 10 * i)), ("uglg", d_bool(False)), ("lagl", d_untf("#Ang", 90 + 30 * i)), ("Dstn", d_untf("#Pxl", 3 + i)), ("Ckmt", d_untf("#Pxl", 0)), ("blur", d_untf("#Pxl", 4)), ("Nose", d_untf("#Prc", 0)), ("AntA", d_bool(False))]) for i in range(3)])
    strokes = d_list([d_objc("FrFX", [("enab", d_bool(True)), ("Styl", d_enum("FStl", "OutF")), ("PntT", d_enum("FrFl", "SClr")), ("Md  ", d_enum("BlnM", "Nrml")), ("Opct", d_untf("#Prc", 100 - 20 * i)), ("Sz  ", d_untf("#Pxl", 2 + i)), ("Clr ", rgbc(255 * i, 0, 255 - 255 * i))]) for i in range(2)])
    overlays = d_list([d_objc("SoFi", [("enab", d_bool(True)), ("Md  ", d_enum("BlnM", "Nrml")), ("Opct", d_untf("#Prc", 50 + 20 * i)), ("Clr ", rgbc(10 + 100 * i, 200, 30))]) for i in range(2)])
    lfx = u32(0) + descriptor("null", [("Scl ", d_untf("#Prc", 100)), ("masterFXSwitch", d_bool(True)), ("dropShadowMulti", shadows), ("frameFXMulti", strokes), ("solidFillMulti", overlays)])
    styled = Layer("Three shadows", (20, 22, 24, 32), (240, 240, 240), blocks=[("lfx2", lfx)])
    ranges = u32(8) + bytes([0, 40, 0, 60, 255, 255, 255, 255]) + u32(0) * 0
    ranges = bytes([0, 40, 0, 60, 255, 255, 255, 255]) + bytes([0, 0, 0, 0, 255, 255, 255, 255])
    ranges = u32(8) + ranges[:8]
    blendif = Layer("Blend if", (0, 0, 12, 12), (90, 90, 90), ranges=u32(0)[:0] + bytes([0]) * 0)
    blendif.ranges = bytes([0, 40, 0, 60, 255, 255, 255, 255])
    big = Layer("Larger than canvas", (-40, -40, 80, 80), (180, 90, 200), pixels=[np.full((120, 120), v, np.uint8) for v in (180, 90, 200, 255)])
    unknown = Layer("Unknown mode", (0, 0, 6, 6), (20, 20, 20), blend=b"dkCl")
    pat_layer = Layer("Pattern fill", (0, 0, H, W), (128, 128, 128))
    note = struct.pack(">HHI", 2, 1, 1)
    text = "Check this edge".encode("utf-16-be")
    ann = struct.pack(">I", 0) + b"txtA" + bytes([1, 28]) + u16(0) + struct.pack(">iiii", 2, 2, 10, 10) + struct.pack(">iiii", 2, 12, 20, 30) + u16(0) + u16(65535) + u16(0) + u16(0) + u16(0)
    ann += pascal("Tester", 2) + pascal("Note A", 2) + pascal("2026-10-21", 2)
    payload = b"\xfe\xff" + text
    ann += u32(8 + len(payload)) + b"txtC" + u32(len(payload)) + payload
    ann = struct.pack(">I", len(ann)) + ann[4:]
    anno = note + ann[0:0]
    note = struct.pack(">HHI", 2, 1, 1) + ann
    layers = [big, red, vm, vm_inv, masked, shape, styled, blendif]
    colour_alpha = [np.full((H, W), v, np.uint8) for v in (255, 255, 255)]
    alpha_ch = np.zeros((H, W), np.uint8)
    alpha_ch[:, 16:] = 255
    res = guides_resource() + resource(1006, pascal("Edge mask", 1)) + resource(1077, struct.pack(">H", 0) + struct.pack(">4H", 0, 0, 0, 0) + u16(50) + bytes([1, 0]))
    res = guides_resource() + resource(1006, pascal("Edge mask", 1))
    merged = colour_alpha + [alpha_ch]
    write("psd_layers.psd", build(3, 8, layers=layers, resources=res, merged=merged, channels=4, globals_=b"8BIM" + b"Anno" + u32(len(pad(note, 4))) + pad(note, 4)))
    ends, start = group_markers("Group A", collapsed=True, blend=b"mul ")
    write("psd_unknown_blend.psd", build(3, 8, layers=[Layer("Base", (0, 0, H, W), (240, 240, 240)), unknown], merged=solid_planes([255, 255, 255]), channels=3))
    write("psd_group.psd", build(3, 8, layers=[Layer("In group", (0, 0, 8, 8), (50, 200, 90)), ends, start], merged=solid_planes([255, 255, 255]), channels=3))
    ab_end, ab_start = group_markers("Artboard 1", blocks=[("artb", descriptor("artboard", [("artboardRect", d_objc("classFloatRect", [("Top ", d_doub(0)), ("Left", d_doub(0)), ("Btom", d_doub(H)), ("Rght", d_doub(W))])), ("guideIndeces", d_list([])), ("artboardPresetName", d_text("Custom")), ("Clr ", rgbc(255, 255, 255)), ("artboardBackgroundType", d_long(1))]))])
    write("psd_artboard.psd", build(3, 8, layers=[Layer("On artboard", (2, 2, 10, 10), (200, 100, 20)), ab_end, ab_start], merged=solid_planes([255, 255, 255]), channels=3))
    good = (OUT / "psd_layers.psd").read_bytes()
    write("psd_damaged_truncated.psd", good[: len(good) * 2 // 3])
    write("psd_damaged_layers_cut.psd", good[:280] + good[:0])


def make_psb():
    write("psd_plain.psb", build(3, 8, version=2, layers=None, merged=solid_planes([10, 200, 90]), channels=3))


def make_exr():
    import OpenEXR
    import Imath
    for name, parts in (("exr_single.exr", None),):
        pass
    h, w = 16, 24
    r = np.tile(np.linspace(0, 4, w, dtype=np.float32), (h, 1))
    g = np.full((h, w), 0.5, np.float32)
    b = np.full((h, w), 0.25, np.float32)
    a = np.ones((h, w), np.float32)
    hdr = {"compression": OpenEXR.ZIP_COMPRESSION, "type": OpenEXR.scanlineimage}
    with OpenEXR.File(hdr, {"RGBA": np.stack([r, g, b, a], -1)}) as f:
        f.write(str(OUT / "exr_single.exr"))
    parts = []
    beauty = np.stack([r, g, b, a], -1)
    parts.append(OpenEXR.Part({"name": "beauty", "type": OpenEXR.scanlineimage, "compression": OpenEXR.ZIP_COMPRESSION}, {"RGBA": beauty}))
    parts.append(OpenEXR.Part({"name": "depth", "type": OpenEXR.scanlineimage, "compression": OpenEXR.ZIP_COMPRESSION}, {"Z": np.tile(np.linspace(1, 9, h, dtype=np.float32)[:, None], (1, w))}))
    parts.append(OpenEXR.Part({"name": "normals", "type": OpenEXR.scanlineimage, "compression": OpenEXR.ZIP_COMPRESSION}, {"N": np.stack([np.full((h, w), 0.0, np.float32), np.full((h, w), 1.0, np.float32), np.full((h, w), 0.0, np.float32)], -1)}))
    with OpenEXR.File(parts) as f:
        f.write(str(OUT / "exr_multipart.exr"))
    ch = {}
    for i in range(2):
        ch[f"crypto00.{'RGBA'[i*2]}"] = np.zeros((h, w), np.float32)
    ids = np.zeros((h, w), np.float32)
    ids[:, : w // 2] = np.frombuffer(struct.pack("<I", 0x3F800001), np.float32)[0]
    ids[:, w // 2 :] = np.frombuffer(struct.pack("<I", 0x3F800002), np.float32)[0]
    cov = np.ones((h, w), np.float32)
    ch = {"crypto_object00.R": ids, "crypto_object00.G": cov, "crypto_object00.B": np.zeros((h, w), np.float32), "crypto_object00.A": np.zeros((h, w), np.float32)}
    hdr = {"compression": OpenEXR.ZIP_COMPRESSION, "type": OpenEXR.scanlineimage,
           "cryptomatte/abc123/name": "crypto_object", "cryptomatte/abc123/hash": "MurmurHash3_32", "cryptomatte/abc123/conversion": "uint32_to_float32",
           "cryptomatte/abc123/manifest": '{"left":"3f800001","right":"3f800002"}'}
    with OpenEXR.File(hdr, ch) as f:
        f.write(str(OUT / "exr_cryptomatte.exr"))
    ch = {"R": r, "G": g, "B": b, "diffuse.R": np.full((h, w), 0.1, np.float32), "diffuse.G": np.full((h, w), 0.2, np.float32), "diffuse.B": np.full((h, w), 0.3, np.float32)}
    with OpenEXR.File({"compression": OpenEXR.ZIP_COMPRESSION, "type": OpenEXR.scanlineimage}, ch) as f:
        f.write(str(OUT / "exr_aov_groups.exr"))


def make_cineon():
    w, h = 24, 16
    hdr = bytearray(2048)
    struct.pack_into(">I", hdr, 0, 0x802A5FD7)
    struct.pack_into(">I", hdr, 4, 2048)
    struct.pack_into(">I", hdr, 8, 1024)
    struct.pack_into(">I", hdr, 12, 1024)
    hdr[24:28] = b"V4.5"
    hdr[192] = 0
    hdr[193] = 3
    for i in range(3):
        o = 196 + i * 28
        hdr[o] = 0
        hdr[o + 1] = i + 1
        hdr[o + 2] = 10
        struct.pack_into(">II", hdr, o + 4, w, h)
        struct.pack_into(">f", hdr, o + 12, 0.0)
        struct.pack_into(">f", hdr, o + 16, 0.0)
        struct.pack_into(">f", hdr, o + 20, 1023.0)
        struct.pack_into(">f", hdr, o + 24, 2.048)
    hdr[680] = 0
    hdr[681] = 5
    px = bytearray()
    for y in range(h):
        for x in range(w):
            r, g, b = int(x / (w - 1) * 1023), int(y / (h - 1) * 1023), 512
            px += struct.pack(">I", (r << 22) | (g << 12) | (b << 2))
    struct.pack_into(">I", hdr, 20, 2048 + len(px))
    (OUT / "cineon_10bit.cin").write_bytes(bytes(hdr) + bytes(px))


def make_icc():
    srgb = ImageCms.createProfile("sRGB")
    lab = ImageCms.createProfile("LAB")
    (OUT / "icc_lab.icc").write_bytes(ImageCms.ImageCmsProfile(lab).tobytes())
    (OUT / "icc_srgb.icc").write_bytes(ImageCms.ImageCmsProfile(srgb).tobytes())
    gray = ImageCms.ImageCmsProfile(srgb)
    from PIL import ImageCms as C
    img = Image.new("RGB", (W, H), (200, 120, 40))
    for x in range(W):
        for y in range(H):
            img.putpixel((x, y), (x * 8, y * 10, 128))
    adobe_like = ImageCms.createProfile("LAB")
    img.save(OUT / "icc_srgb_tagged.png", icc_profile=ImageCms.ImageCmsProfile(srgb).tobytes())
    img.save(OUT / "icc_srgb_tagged.jpg", quality=90, icc_profile=ImageCms.ImageCmsProfile(srgb).tobytes())
    exif = Image.Exif()
    exif[0x8769] = {0xA001: 1}
    img.save(OUT / "exif_colorspace_srgb.jpg", quality=90, exif=exif)
    exif2 = Image.Exif()
    exif2[0x8769] = {0xA001: 65535}
    img.save(OUT / "exif_colorspace_uncalibrated.jpg", quality=90, exif=exif2)
    img.save(OUT / "exif_colorspace_none.jpg", quality=90)
    img.save(OUT / "icc_tagged.tif", icc_profile=ImageCms.ImageCmsProfile(srgb).tobytes())
    g = Image.new("L", (W, H))
    g.putdata([(x * 8) % 256 for y in range(H) for x in range(W)])
    g.save(OUT / "gray.png")


if __name__ == "__main__":
    for fn in (make_modes, make_layered, make_psb, make_exr, make_cineon, make_icc):
        try:
            fn()
        except Exception as e:
            print("FAILED", fn.__name__, repr(e), file=sys.stderr)
            raise
    for p in sorted(OUT.iterdir()):
        print(p.name, p.stat().st_size)
