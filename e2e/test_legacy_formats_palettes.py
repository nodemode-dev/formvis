import functools
import io
import struct

from PIL import Image
from playwright.sync_api import Error as PlaywrightError


def steady(fn):
    @functools.wraps(fn)
    def run(page):
        for attempt in range(3):
            try:
                return fn(page)
            except PlaywrightError as err:
                if "context was destroyed" not in str(err) or attempt == 2:
                    raise
                page.wait_for_function("window.formvis && window.formvis.engine", timeout=60000)
    return run


# Palette-style and small-raster files: the page writes the bytes, a hand parser (or Pillow) reads them, and the page's own
# reader reads them back.
RT = """async ([mod, write, read, arg]) => {
  const m = await import('/src/io/' + mod + '.ts');
  const bytes = m[write](...arg);
  const b = bytes instanceof Uint8Array ? bytes : bytes.bytes;
  const copy = new Uint8Array(b);
  return { bytes: Array.from(copy), back: read ? await m[read](copy.buffer) : null };
}"""


def be16(b, o):
    return struct.unpack(">H", b[o:o + 2])[0]


def be32(b, o):
    return struct.unpack(">I", b[o:o + 4])[0]


@steady
def test_shc_contours_are_laid_out_as_documented_and_read_back(page):
    pts = [{"x": 0, "y": 0}, {"x": 0.5, "y": 0.25}, {"x": 1, "y": 1}]
    r = page.evaluate(RT, ["shc", "writeShc", "readShc", [[{"name": "Soft", "points": pts}, {"name": "Flat", "points": [{"x": 0, "y": 0.5}, {"x": 1, "y": 0.5}]}]]])
    b = bytes(r["bytes"])
    assert b[:4] == b"8BFS" and be16(b, 4) == 1 and be32(b, 6) == 2
    assert be32(b, 10) == 2
    n = be32(b, 14)
    assert n == len("Soft") + 1
    assert b[18:18 + 8].decode("utf-16-be") == "Soft"
    o = 18 + 2 * n
    assert be16(b, o) == 2 and be16(b, o + 2) == 3
    o += 4
    assert [(be16(b, o + i * 4), be16(b, o + i * 4 + 2)) for i in range(3)] == [(0, 0), (64, 128), (255, 255)]
    assert list(b[o + 12:o + 15]) == [1, 1, 1] and be32(b, o + 15) == 0 and be32(b, o + 19) == 0
    back = r["back"]
    assert back["skipped"] == 0 and [c["name"] for c in back["contours"]] == ["Soft", "Flat"]
    assert [round(p["y"] * 255) for p in back["contours"][0]["points"]] == [0, 64, 255]
    assert [round(p["x"] * 255) for p in back["contours"][0]["points"]] == [0, 128, 255]


@steady
def test_shc_reader_refuses_other_files_and_stops_at_a_cut_contour(page):
    r = page.evaluate("""async () => {
      const m = await import('/src/io/shc.ts');
      let err = '';
      try { m.readShc(new Uint8Array([0, 40, 0, 1, 0, 0, 0, 0, 0, 0]).buffer); } catch (e) { err = String(e.message); }
      const good = m.writeShc([{ name: 'A', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }, { name: 'B', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }]);
      const cut = m.readShc(good.slice(0, good.length - 8).buffer);
      return { err, names: cut.contours.map((c) => c.name), skipped: cut.skipped };
    }""")
    assert "shc" in r["err"].lower()
    assert r["names"] == ["A"] and r["skipped"] >= 1


GRADS = [{"id": "g1", "label": "Sunset", "stops": [{"at": 0, "color": {"r": 255, "g": 0, "b": 0}, "alpha": 1}, {"at": 0.5, "color": {"r": 255, "g": 200, "b": 0}, "alpha": 0.5}, {"at": 1, "color": "bg", "alpha": 1}]},
         {"id": "g2", "label": "Two", "stops": [{"at": 0, "color": "fg", "alpha": 1}, {"at": 1, "color": {"r": 0, "g": 0, "b": 255}, "alpha": 1}]}]


@steady
def test_grd_header_and_stops_are_correct_and_the_page_reader_returns_them(page):
    r = page.evaluate(RT, ["grd", "writeGrd", "readGrd", [GRADS]])
    b = bytes(r["bytes"])
    assert b[:4] == b"8BGR" and be16(b, 4) == 5 and be32(b, 6) == 16
    assert b.count(b"Objc") >= 2 and b.count(b"Grdn") >= 4
    assert "Sunset".encode("utf-16-be") in b and "Two".encode("utf-16-be") in b
    back = r["back"]
    assert back["skipped"] == 0 and back["approximated"] == 0
    g0, g1 = back["gradients"]
    assert [g0["label"], g1["label"]] == ["Sunset", "Two"]
    assert [round(s["at"], 3) for s in g0["stops"]] == [0, 0.5, 1]
    assert g0["stops"][0]["color"] == {"r": 255, "g": 0, "b": 0} and g0["stops"][1]["color"] == {"r": 255, "g": 200, "b": 0}
    assert g0["stops"][2]["color"] == "bg" and g1["stops"][0]["color"] == "fg"
    assert round(g0["stops"][1]["alpha"], 2) == 0.5


@steady
def test_grd_reader_rejects_a_wrong_signature_and_version(page):
    r = page.evaluate("""async () => {
      const m = await import('/src/io/grd.ts');
      const out = [];
      for (const bytes of [new Uint8Array(20), (() => { const b = m.writeGrd([]); b[5] = 3; return b; })()]) {
        try { m.readGrd(bytes.buffer); out.push('ok'); } catch (e) { out.push(String(e.message)); }
      }
      return out;
    }""")
    assert "Not a .grd" in r[0] and "version 3" in r[1]


@steady
def test_ggr_gradient_text_becomes_stops(page):
    text = "GIMP Gradient\nName: Warm\n1\n0.000000 0.500000 1.000000 1.000000 0.000000 0.000000 1.000000 0.000000 0.000000 1.000000 1.000000 0 0 0 0\n"
    r = page.evaluate("""async (t) => { const m = await import('/src/io/grd.ts'); return m.readGgr(t); }""", text)
    assert r[0]["label"] == "Warm" and len(r[0]["stops"]) >= 2
    assert r[0]["stops"][0]["color"] == {"r": 255, "g": 0, "b": 0} and r[0]["stops"][-1]["color"] == {"r": 0, "g": 0, "b": 255}


PAT = [{"name": "Checker", "width": 4, "height": 2, "rgba": [255, 0, 0, 255] * 4 + [0, 0, 255, 255, 10, 20, 30, 255, 0, 0, 255, 255, 10, 20, 30, 255]},
       {"name": "Glass", "width": 2, "height": 2, "rgba": [0, 255, 0, 128] * 4}]


@steady
def test_pat_file_has_the_8bpt_layout_and_reads_back_every_pixel(page):
    r = page.evaluate("""async (p) => {
      const m = await import('/src/io/pat.ts');
      const bytes = m.writePat(p.map((x) => ({ ...x, rgba: new Uint8ClampedArray(x.rgba) })));
      const back = m.readPat(bytes);
      return { bytes: Array.from(bytes), back: back.map((x) => ({ name: x.name, width: x.width, height: x.height, rgba: Array.from(x.rgba) })) };
    }""", PAT)
    b = bytes(r["bytes"])
    assert b[:4] == b"8BPT" and be16(b, 4) == 1 and be32(b, 6) == 2
    assert be32(b, 10) == 1 and be32(b, 14) == 3 and be16(b, 18) == 2 and be16(b, 20) == 4
    assert [(x["name"], x["width"], x["height"]) for x in r["back"]] == [("Checker", 4, 2), ("Glass", 2, 2)]
    assert r["back"][0]["rgba"] == PAT[0]["rgba"] and r["back"][1]["rgba"] == PAT[1]["rgba"]


@steady
def test_pat_reader_rejects_a_file_that_is_not_a_pattern_file(page):
    err = page.evaluate("""async () => { const m = await import('/src/io/pat.ts'); try { m.readPat(new Uint8Array(40)); return ''; } catch (e) { return String(e.message); } }""")
    assert err


ACTIONS = [
    {"name": "Soften", "set": "Mine", "colour": "blue", "key": "Shift+F5", "steps": [
        {"kind": "command", "id": "new-layer", "label": "Make layer"},
        {"kind": "layerProps", "label": "Set layer", "name": "Haze", "opacity": 40, "blend": "multiply"},
        {"kind": "filter", "filter": "gaussianBlur", "label": "Gaussian Blur", "settings": {"radius": 7.5}},
        {"kind": "stop", "label": "Stop", "message": "Check the haze", "allowContinue": True},
    ]},
    {"name": "Second", "steps": [{"kind": "command", "id": "select-all", "label": "Select All"}]},
]


@steady
def test_atn_set_header_actions_and_steps_round_trip(page):
    r = page.evaluate("""async (a) => {
      const m = await import('/src/io/atn.ts');
      const w = m.writeAtn(a, 'My Set');
      const back = m.parseAtn(w.bytes.buffer.slice(w.bytes.byteOffset, w.bytes.byteOffset + w.bytes.byteLength));
      return { bytes: Array.from(w.bytes), left: w.left, back };
    }""", ACTIONS)
    b = bytes(r["bytes"])
    assert be32(b, 0) == 16
    n = be32(b, 4)
    assert n == len("My Set") + 1 and b[8:8 + 2 * (n - 1)].decode("utf-16-be") == "My Set"
    o = 8 + 2 * n
    assert b[o] == 0 and be32(b, o + 1) == 2
    assert r["left"] == []
    back = r["back"]
    assert back["unsupported"] == [] and [a["name"] for a in back["actions"]] == ["Soften", "Second"]
    first = back["actions"][0]
    assert first["colour"] == "blue" and first["key"] == "Shift+F5"
    assert [s["kind"] for s in first["steps"]] == ["command", "layerProps", "filter", "stop"]
    props = first["steps"][1]
    assert props["name"] == "Haze" and props["opacity"] == 40 and props["blend"] == "multiply"
    assert first["steps"][2]["settings"]["radius"] == 7.5
    assert first["steps"][3]["message"] == "Check the haze" and first["steps"][3]["allowContinue"] is True


@steady
def test_atn_reports_steps_it_cannot_write(page):
    r = page.evaluate("""async () => {
      const m = await import('/src/io/atn.ts');
      return m.writeAtn([{ name: 'X', steps: [{ kind: 'command', id: 'no-such-thing-in-atn', label: 'Odd' }, { kind: 'command', id: 'select-all', label: 'All' }] }], 'S').left;
    }""")
    assert r == ["X: Odd"]


@steady
def test_asl_style_file_layout_and_effect_values_round_trip(page):
    r = page.evaluate("""async () => {
      const m = await import('/src/io/asl.ts'), T = await import('/src/engine/types.ts');
      const fx = T.defaultEffects();
      fx.dropShadow = { ...fx.dropShadow, enabled: true, color: { r: 10, g: 20, b: 30 }, opacity: 0.6, angle: 45, distance: 9, size: 13 };
      fx.stroke = { ...fx.stroke, enabled: true, size: 4, color: { r: 255, g: 0, b: 0 } };
      const bytes = m.writeAsl([{ name: 'Glow Edge', effects: fx }, { name: 'Plain', effects: T.defaultEffects() }]);
      const back = m.readAsl(new Uint8Array(bytes).buffer);
      return { bytes: Array.from(bytes), styles: back.styles.map((s) => ({ name: s.name, ds: s.effects.dropShadow, st: s.effects.stroke })), skipped: back.skipped };
    }""")
    b = bytes(r["bytes"])
    assert be16(b, 0) == 2 and b[2:6] == b"8BSL" and be16(b, 6) == 3 and be32(b, 8) == 0 and be32(b, 12) == 2
    first_len = be32(b, 16)
    assert first_len > 0 and (16 + 4 + first_len + (-first_len) % 4) < len(b)
    assert "Glow Edge".encode("utf-16-be") in b and b.count(b"DrSh") >= 2 and b.count(b"FrFX") >= 0
    assert r["skipped"] == 0 and [s["name"] for s in r["styles"]] == ["Glow Edge", "Plain"]
    ds = r["styles"][0]["ds"]
    assert ds["enabled"] is True and ds["color"] == {"r": 10, "g": 20, "b": 30} and abs(ds["opacity"] - 0.6) < 0.01
    assert round(ds["angle"]) == 45 and round(ds["distance"]) == 9 and round(ds["size"]) == 13
    assert r["styles"][0]["st"]["enabled"] is True and round(r["styles"][0]["st"]["size"]) == 4
    assert r["styles"][1]["ds"]["enabled"] is False


@steady
def test_asl_reader_rejects_other_files(page):
    err = page.evaluate("""async () => { const m = await import('/src/io/asl.ts'); try { m.readAsl(new Uint8Array(30).buffer); return ''; } catch (e) { return String(e.message); } }""")
    assert "asl" in err


IMG = """(w, h, fn) => { const d = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = fn(x, y); d.set(c, (y * w + x) * 4); } return { data: d, width: w, height: h }; }"""


@steady
def test_png8_is_a_palette_png_pillow_reads_with_exact_colours(page):
    r = page.evaluate("""async (mk) => {
      const m = await import('/src/io/png8.ts'), img = eval('(' + mk + ')')(16, 8, (x) => (x < 8 ? [200, 20, 20, 255] : [20, 20, 200, 255]));
      return Array.from(await m.encodePng8(img, { colors: 4, dither: 'none', transparency: false }));
    }""", IMG)
    im = Image.open(io.BytesIO(bytes(r)))
    assert im.format == "PNG" and im.mode == "P" and im.size == (16, 8)
    rgb = im.convert("RGB")
    assert rgb.getpixel((2, 3)) == (200, 20, 20) and rgb.getpixel((12, 3)) == (20, 20, 200)
    assert len(im.getcolors()) == 2


@steady
def test_png8_transparency_becomes_a_trns_entry(page):
    r = page.evaluate("""async (mk) => {
      const m = await import('/src/io/png8.ts'), img = eval('(' + mk + ')')(8, 8, (x) => (x < 4 ? [0, 0, 0, 0] : [30, 160, 30, 255]));
      return Array.from(await m.encodePng8(img, { colors: 8, dither: 'none', transparency: true }));
    }""", IMG)
    im = Image.open(io.BytesIO(bytes(r)))
    assert im.mode == "P" and "transparency" in im.info
    rgba = im.convert("RGBA")
    assert rgba.getpixel((1, 1))[3] == 0 and rgba.getpixel((6, 1)) == (30, 160, 30, 255)


@steady
def test_png8_colour_limit_and_dither_are_honoured(page):
    r = page.evaluate("""async (mk) => {
      const m = await import('/src/io/png8.ts'), img = eval('(' + mk + ')')(32, 8, (x) => [x * 8, 255 - x * 8, 100, 255]);
      const out = {};
      for (const n of [2, 16, 64]) out[n] = Array.from(await m.encodePng8(img, { colors: n, dither: n === 16 ? 'diffusion' : 'none', transparency: false }));
      return out;
    }""", IMG)
    for n, data in r.items():
        im = Image.open(io.BytesIO(bytes(data)))
        assert im.mode == "P" and len(im.getcolors()) <= int(n), (n, len(im.getcolors()))
    assert len(Image.open(io.BytesIO(bytes(r["64"]))).getcolors()) > 16


@steady
def test_gif_frames_delays_loop_and_transparency_decode_in_pillow(page):
    r = page.evaluate("""async (mk) => {
      const m = await import('/src/io/gif.ts'), make = eval('(' + mk + ')');
      const frame = (c, d) => ({ data: make(10, 6, () => c), delayMs: d });
      const a = m.encodeGif([frame([255, 0, 0, 255], 100), frame([0, 255, 0, 255], 250), { data: make(10, 6, (x) => (x < 5 ? [0, 0, 0, 0] : [0, 0, 255, 255])), delayMs: 40 }], 10, 6, 0);
      const b = m.encodeGif([frame([255, 0, 0, 255], 100)], 10, 6, 3);
      const c = m.encodeGif([frame([255, 0, 0, 255], 100)], 10, 6, 1);
      const t = m.encodeGif([{ data: make(10, 6, (x) => (x < 5 ? [0, 0, 0, 0] : [0, 0, 255, 255])), delayMs: 40 }], 10, 6, 1);
      return [Array.from(a), Array.from(b), Array.from(c), Array.from(t)];
    }""", IMG)
    a, b, c, t = (bytes(x) for x in r)
    assert a[:6] == b"GIF89a"
    im = Image.open(io.BytesIO(a))
    assert im.size == (10, 6) and im.n_frames == 3 and im.info["loop"] == 0
    seen = []
    for i in range(3):
        im.seek(i)
        seen.append((im.info["duration"], im.convert("RGBA").getpixel((7, 3))))
    assert seen[0] == (100, (255, 0, 0, 255)) and seen[1] == (250, (0, 255, 0, 255)) and seen[2][0] == 40 and seen[2][1] == (0, 0, 255, 255)
    assert im.convert("RGBA").getpixel((1, 1)) == (0, 255, 0, 255)
    assert Image.open(io.BytesIO(b)).info["loop"] == 2
    assert "loop" not in Image.open(io.BytesIO(c)).info
    only = Image.open(io.BytesIO(t)).convert("RGBA")
    assert only.getpixel((1, 1))[3] == 0 and only.getpixel((8, 1)) == (0, 0, 255, 255)
