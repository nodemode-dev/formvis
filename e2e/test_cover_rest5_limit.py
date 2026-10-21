D = ".cv-scrim:not([hidden]) .cv-dialog"
SET = """([label, v]) => { const d = [...document.querySelectorAll('.cv-scrim:not([hidden]) .cv-dialog')].pop();
  const i = [...d.querySelectorAll('input')].find((n) => n.getAttribute('aria-label') === label && n.getClientRects().length);
  if (!i) throw new Error('no control ' + label + ' in ' + [...d.querySelectorAll('input')].map((n) => n.getAttribute('aria-label')).join('|'));
  i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); }"""
PX = "([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data).slice(0, 3)"


def test_limit_by_luminosity_confines_a_filter_layer_to_the_bright_half_and_show_the_effect_views_the_matte(page):
    page.evaluate("""() => { const e = window.formvis.engine; e.newDocument(100, 40, 'Lim', 'white'); e.fg = { r: 0, g: 0, b: 0 }; e.selectAll(); e.fill('fg'); e.deselect();
      e.fg = { r: 255, g: 255, b: 255 }; e.setSelectionRect ? 0 : 0; }""")
    page.evaluate("""async () => { const e = window.formvis.engine, E = await import('/src/engine/index.ts');
      e.applySelection(E.SelectionMask.cropped(50, 0, 50, 40, new Uint8Array(2000).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect();
      e.fg = { r: 90, g: 90, b: 90 }; e.addAdjustmentLayer('exposure'); }""")
    page.evaluate("window.formvis.commands.run('edit-adjustment')")
    page.locator(D).last.wait_for()
    page.wait_for_timeout(800)
    sel = page.locator(f"{D} select").filter(has=page.locator("option", has_text="Color range")).last
    sel.select_option(label="Luminosity", force=True)
    page.wait_for_timeout(300)
    page.evaluate(SET, ["From (%)", 60])
    page.wait_for_timeout(300)
    lim = page.evaluate("window.formvis.engine.current.activeLayer.adjustment.data.limit")
    assert lim["mode"] == "luminosity" and lim["lo"] == 60
    page.locator(f"{D} label:has-text('Show the effect') input").last.check()
    page.wait_for_timeout(600)
    assert page.evaluate("window.formvis.engine.limitViewId") == page.evaluate("window.formvis.engine.current.activeLayer.id")
    left, right = page.evaluate(PX, [20, 20]), page.evaluate(PX, [80, 20])
    assert right[0] > 200 and left[0] < 50, (left, right)
    page.locator(f"{D} label:has-text('Show the effect') input").last.uncheck()
    page.wait_for_timeout(400)
    assert page.evaluate("window.formvis.engine.limitViewId") is None
