MAKE = """async ([from, to, content, offset]) => {
  const T = await import('/src/engine/text.ts'), P = await import('/src/engine/paths.ts'), e = window.formvis.engine;
  e.newDocument(400, 300, 'P', 'white');
  e.textSettings = { ...T.defaultText(), size: 32, family: 'sans-serif' };
  e.setWorkPath({ subpaths: [{ anchors: [P.cornerAt(from), P.cornerAt(to)], closed: false }] });
  const ok = await e.createTextOnPath(content, offset);
  const l = e.current.activeLayer, r = l.raster, d = r.ctx.getImageData(0, 0, r.width, r.height).data;
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < r.height; y++) for (let x = 0; x < r.width; x++) if (d[(y * r.width + x) * 4 + 3] > 128) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const t = l.transform;
  return { ok, onPath: !!l.text?.onPath, left: t.x + x0, right: t.x + x1, top: t.y + y0, bottom: t.y + y1, x: t.x, y: t.y };
}"""


def make(page, frm, to, content="PATH TEXT", offset=0):
    return page.evaluate(MAKE, [frm, to, content, offset])


def test_type_sits_on_a_horizontal_path(page):
    r = make(page, {"x": 50, "y": 150}, {"x": 350, "y": 150})
    assert r["ok"] and r["onPath"], r
    assert abs(r["bottom"] - 150) <= 2 and 140 >= r["top"] >= 110 and abs(r["left"] - 50) <= 4, r   # capitals on the baseline


def test_type_follows_a_vertical_path(page):
    r = make(page, {"x": 200, "y": 30}, {"x": 200, "y": 280})
    assert r["bottom"] - r["top"] > (r["right"] - r["left"]) * 3, r                            # runs down the path


def test_start_offset_moves_the_type_along_the_path(page):
    start, half = make(page, {"x": 50, "y": 150}, {"x": 350, "y": 150}, "AB", 0), make(page, {"x": 50, "y": 150}, {"x": 350, "y": 150}, "AB", 50)
    assert abs((half["left"] - start["left"]) - 150) <= 4, (start, half)


def test_type_past_the_path_end_is_not_drawn(page):
    r = make(page, {"x": 50, "y": 150}, {"x": 150, "y": 150}, "A LONG LINE OF TYPE ON A SHORT PATH")
    assert r["right"] <= 152, r


def test_edit_type_keeps_the_type_on_its_path(page):
    make(page, {"x": 50, "y": 150}, {"x": 350, "y": 150})
    before = page.evaluate("(() => { const t = window.formvis.engine.current.activeLayer.transform; return [t.x, t.y]; })()")
    page.evaluate("""async () => { const e = window.formvis.engine, l = e.current.activeLayer; await e.updateTextLayer(l.id, { ...l.text, content: 'EDITED' }); }""")
    after = page.evaluate("(() => { const l = window.formvis.engine.current.activeLayer; return [l.transform.x, l.transform.y, !!l.text.onPath, l.text.content]; })()")
    assert after[:2] == before and after[2] and after[3] == "EDITED", (before, after)


def test_a_saved_path_reads_back_and_a_bad_one_is_none(page):
    r = page.evaluate("""async () => { const T = await import('/src/engine/text.ts'), E = await import('/src/engine/index.ts'), ras = new E.Raster(4, 4);
      const good = T.textFromData({ content: 'Hi', onPath: { points: [{ x: 1, y: 2 }, { x: 30, y: 2 }], offset: 140, frame: { w: 60, h: 40 } } }, ras).onPath;
      const bad = T.textFromData({ content: 'Hi', onPath: { points: [{ x: 1, y: 2 }], frame: { w: 60, h: 40 } } }, ras).onPath;
      return { good, bad }; }""")
    assert r["good"] == {"points": [{"x": 1, "y": 2}, {"x": 30, "y": 2}], "offset": 100, "frame": {"w": 60, "h": 40}}, r
    assert r["bad"] is None, r


def test_type_on_path_from_the_menu(page):
    page.evaluate("window.formvis.engine.newDocument(400, 300, 'P', 'white'); window.formvis.engine.setWorkPath(null)")
    assert page.evaluate("window.formvis.commands.run('type-on-path')") is False           # no path, nothing to set type on
    page.evaluate("""async () => { const P = await import('/src/engine/paths.ts');
      window.formvis.engine.setWorkPath({ subpaths: [{ anchors: [P.cornerAt({ x: 60, y: 200 }), P.cornerAt({ x: 340, y: 120 })], closed: false }] }); }""")
    assert page.evaluate("window.formvis.commands.run('type-on-path')")
    dlg = page.locator(".cv-scrim:not([hidden]) .cv-dialog")
    dlg.locator("input[type=text]").fill("Along the line")
    dlg.locator(".cv-dialog-foot button", has_text="OK").click()
    page.wait_for_function("window.formvis.engine.current.activeLayer?.text?.onPath && window.formvis.engine.current.activeLayer.text.content === 'Along the line'")
