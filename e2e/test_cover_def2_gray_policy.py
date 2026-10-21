# D37 (gray half): opening an 8-bit gray picture with an embedded gray profile obeys the Gray policy in Color Settings:
# Preserve keeps the numbers, Convert to Working Space moves them to the working gray, so the same file opens with different pixel values.
import base64

from PIL import Image

LIST = """async () => { const j = await (await fetch('/api/color/profiles')).json(); return JSON.stringify(j).slice(0, 4000); }"""
PROFILE = """async (id) => { const b = new Uint8Array(await (await fetch('/api/color/profiles/' +encodeURIComponent(id))).arrayBuffer()); let s = ''; b.forEach((x) => { s += String.fromCharCode(x); }); return btoa(s); }"""
SET = """async (policy) => { const P = await import('/src/ui/prefs.ts'); P.updatePrefs({ colour: { ...P.loadPrefs().colour, grayPolicy: policy, askMismatch: false, askMissing: false } }); }"""
READ = """() => { const e = window.formvis.engine, d = e.current.doc, l = d.layers.find((x) => x.raster || x.channels) || d.layers[0];
  if (l.raster) return { mode: d.mode, v: l.raster.ctx.getImageData(2, 2, 1, 1).data[0] };
  return { mode: d.mode, v: l.channels.data[0] }; }"""


def open_gray(page, tmp_path, name, icc):
    f = tmp_path / name
    Image.new("L", (16, 16), 128).save(f, "PNG", icc_profile=icc)
    count = page.evaluate("window.formvis.engine.projects.length")
    page.set_input_files("input[data-role='open-files']", str(f))
    page.wait_for_function(f"window.formvis.engine.projects.length > {count}", timeout=30000)
    page.wait_for_function("window.formvis.engine.current && window.formvis.engine.current.doc.layers.length > 0", timeout=30000)
    page.wait_for_timeout(500)
    return page.evaluate(READ)


def test_gray_policy_preserve_and_convert_open_the_same_file_with_different_numbers(page, tmp_path):
    ids = page.evaluate(LIST)
    import json
    listing = json.loads(ids)
    items = listing.get("profiles", listing) if isinstance(listing, dict) else listing
    gray = [p for p in items if "gray" in json.dumps(p).lower() and "g22" not in json.dumps(p).lower()]
    assert gray, ids
    pid = gray[0]["id"]
    icc = base64.b64decode(page.evaluate(PROFILE, pid))
    page.evaluate(SET, "preserve")
    kept = open_gray(page, tmp_path, "g1.png", icc)
    page.evaluate(SET, "convert")
    moved = open_gray(page, tmp_path, "g2.png", icc)
    assert kept["v"] != moved["v"]
