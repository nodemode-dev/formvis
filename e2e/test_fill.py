BASE = """() => {
  const e = window.formvis.engine;
  e.newDocument(100, 80, 'F', 'white');
  e.fg = { r: 128, g: 128, b: 128 }; e.fill('fg');
}"""
PX = "([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data)"


def test_colour_opacity_and_blend(page):
    page.evaluate(BASE)
    page.evaluate("window.formvis.engine.fillWith({ color: { r: 255, g: 0, b: 0 } }, 'normal', 0.5, false)")
    assert all(abs(a - b) <= 1 for a, b in zip(page.evaluate(PX, [10, 10]), [192, 64, 64, 255]))
    page.evaluate(BASE)
    page.evaluate("window.formvis.engine.fillWith({ color: { r: 255, g: 0, b: 0 } }, 'multiply', 1, false)")
    assert page.evaluate(PX, [10, 10]) == [128, 0, 0, 255]
    assert page.evaluate("window.formvis.engine.historySteps.names.slice(-1)[0]") == "Fill"


def test_preserve_transparency_keeps_empty_pixels_empty(page):
    r = page.evaluate("""async () => {
      const e = window.formvis.engine, E = await import('/src/engine/index.ts');
      e.newDocument(100, 80, 'F', 'transparent');
      e.addLayer(); e.fg = { r: 0, g: 0, b: 0 };
      e.applySelection(E.SelectionMask.cropped(10, 10, 10, 10, new Uint8Array(100).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect();
      e.fillWith({ color: { r: 0, g: 200, b: 0 } }, 'normal', 1, true);
      const l = e.current.activeLayer, at = (x, y) => Array.from(l.raster.read(x - l.transform.x, y - l.transform.y, 1, 1).data);
      return [at(15, 15), at(50, 50)];
    }""")
    assert r[0] == [0, 200, 0, 255] and r[1][3] == 0, r


def test_pattern_fill_tiles_a_pattern(page):
    page.evaluate(BASE)
    r = page.evaluate("""async () => {
      const e = window.formvis.engine, E = await import('/src/engine/index.ts');
      e.fillWith({ patternId: E.allPatterns()[0].id }, 'normal', 1, false);
      const d = e.flattened().getContext('2d').getImageData(0, 0, 100, 80).data, seen = new Set();
      for (let i = 0; i < d.length; i += 4) seen.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]);
      return seen.size;
    }""")
    assert r > 1


def test_fill_dialog_black_and_disabled_rows(page):
    page.evaluate(BASE)
    page.evaluate("window.formvis.commands.run('fill-dialog')")
    page.wait_for_timeout(300)
    dlg = page.locator(".cv-scrim:not([hidden]) .cv-dialog")
    assert dlg.locator("input[type=color]").is_disabled()
    dlg.locator("select").first.select_option("black")
    dlg.locator(".cv-dialog-foot button", has_text="OK").click()
    page.wait_for_timeout(300)
    assert page.evaluate(PX, [50, 40]) == [0, 0, 0, 255]
