SETUP = """async () => { const E = await import('/src/engine/index.ts'), e = window.formvis.engine; e.newDocument(300, 200, 'M', 'transparent'); e.deselect();
  const box = (x, y, w, h, r, g, bl, name) => { e.addLayer({ name }); e.fg = { r, g, b: bl }; e.applySelection(E.SelectionMask.cropped(x, y, w, h, new Uint8Array(w * h).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect(); };
  box(20, 20, 60, 60, 255, 0, 0, 'Red'); box(120, 20, 60, 60, 0, 255, 0, 'Green'); box(220, 120, 60, 60, 0, 0, 255, 'Blue');
  window.formvis.engine.setTool('move'); window.formvis.engine.autoSelect = true; }"""
SEL = "[...window.formvis.engine.current.selectedIds].map(i => window.formvis.engine.current.doc.layers.find(l => l.id === i).name).sort()"


def scr(page, x, y):
    return page.evaluate("([x, y]) => { const v = window.formvis.engine.current.viewport, s = document.querySelector('.cv-stage').getBoundingClientRect(), q = v.toScreen(x, y); return [s.left + q.x, s.top + q.y]; }", [x, y])


def drag(page, a, b):
    page.mouse.move(*scr(page, *a))
    page.mouse.down()
    page.mouse.move(*scr(page, *b), steps=10)
    page.mouse.up()
    page.wait_for_timeout(300)


def test_move_tool_marquee_selects_the_layers_with_pixels_in_it_and_shift_adds_more(page):
    # PC-EN-0053
    page.evaluate(SETUP)
    drag(page, (5, 5), (200, 100))
    assert page.evaluate(SEL) == ["Green", "Red"]
    page.keyboard.down("Shift")
    drag(page, (210, 110), (295, 195))
    page.keyboard.up("Shift")
    assert page.evaluate(SEL) == ["Blue", "Green", "Red"]


def test_exported_png_and_jpeg_carry_the_document_resolution(page):
    # CO-0019
    got = page.evaluate("""async () => {
      const e = window.formvis.engine; e.newDocument(40, 30, 'R', 'white', 300);
      const u = new Uint8Array(await (await e.exportBlob('image/png')).arrayBuffer()), v = new DataView(u.buffer); let pos = 8, phys = null;
      while (pos + 8 <= u.length) { const len = v.getUint32(pos), t = String.fromCharCode(...u.subarray(pos + 4, pos + 8)); if (t === 'pHYs') { phys = [v.getUint32(pos + 8), v.getUint32(pos + 12), u[pos + 16]]; break; } pos += 12 + len; }
      const j = new Uint8Array(await (await e.exportBlob('image/jpeg')).arrayBuffer());
      return [e.current.doc.resolution, phys, j[13], (j[14] << 8) | j[15], (j[16] << 8) | j[17]]; }""")
    assert got == [300, [11811, 11811, 1], 1, 300, 300]
