MAKE = """async ([extra]) => { const e = window.formvis.engine; e.newDocument(400, 200, 'T', 'white');
  await e.createTextLayer({ x: 10, y: 20 }, { ...e.textSettings, size: 32, color: { r: 0, g: 0, b: 0 }, direction: 'horizontal', ...extra }); return e.current.doc.layers.map((l) => l.name); }"""
INK = """([y0, y1]) => { const c = window.formvis.engine.flattened(), d = c.getContext('2d').getImageData(0, y0, c.width, y1 - y0).data; let lo = 1e9, hi = -1, red = 0, dark = 0;
  for (let i = 0; i < d.length; i += 4) { if (d[i] < 200 || d[i + 1] < 200) { const x = (i / 4) % c.width; lo = Math.min(lo, x); hi = Math.max(hi, x); if (d[i] > 150 && d[i + 1] < 90) red++; else dark++; } } return { lo, hi, red, dark }; }"""


def test_new_type_layer_makes_a_live_text_layer_with_the_given_content(page):
    # PC-UI-0691
    page.evaluate(MAKE, [{"content": "Hello", "box": None}])
    assert page.evaluate("() => { const l = window.formvis.engine.current.activeLayer; return [!!l.text, l.text && l.text.content]; }") == [True, "Hello"]
    ink = page.evaluate(INK, [0, 200])
    assert ink["dark"] > 100 and ink["lo"] >= 8, ink
    page.keyboard.press("Control+z")
    page.wait_for_function("window.formvis.engine.current.doc.layers.length === 1")


def test_paragraph_attributes_align_each_paragraph_on_its_own_and_indents_move_the_ink(page):
    # PC-EN-0402
    spec = {"content": "AAAA\nBBBB", "box": {"w": 300, "h": 120}, "align": "left", "paras": [{"align": "left"}, {"align": "right"}]}
    page.evaluate(MAKE, [spec])
    top = page.evaluate(INK, [20, 55])
    bottom = page.evaluate(INK, [58, 100])
    assert top["dark"] > 50 and bottom["dark"] > 50, (top, bottom)
    assert top["lo"] < 30 and bottom["lo"] > 150 and bottom["hi"] > 280, (top, bottom)
    spec2 = {"content": "AAAA\nBBBB", "box": {"w": 300, "h": 120}, "align": "left", "paras": [{"align": "left"}, {"align": "left", "indentLeft": 80}]}
    page.evaluate(MAKE, [spec2])
    a, b = page.evaluate(INK, [20, 55]), page.evaluate(INK, [58, 100])
    assert b["lo"] - a["lo"] >= 60, (a, b)


def test_a_character_run_colours_only_its_letters(page):
    # CO-0185, PC-EN-0395
    spec = {"content": "ABCDEFGH", "box": None, "runs": [{"start": 0, "end": 4, "on": [], "off": [], "color": {"r": 220, "g": 20, "b": 20}}]}
    page.evaluate(MAKE, [spec])
    ink = page.evaluate(INK, [0, 200])
    assert ink["red"] > 60 and ink["dark"] > 60, ink
    left = page.evaluate("""() => { const c = window.formvis.engine.flattened(), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let rx = 0, rn = 0, kx = 0, kn = 0;
      for (let i = 0; i < d.length; i += 4) { const x = (i / 4) % c.width; if (d[i] > 150 && d[i + 1] < 90) { rx += x; rn++; } else if (d[i] < 120 && d[i + 1] < 120) { kx += x; kn++; } } return [rx / rn, kx / kn]; }""")
    assert left[0] < left[1] - 20, left
