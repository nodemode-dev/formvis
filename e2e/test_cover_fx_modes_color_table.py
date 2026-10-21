SET = """([label, v]) => {
  const i = [...document.querySelectorAll('.cv-scrim:not([hidden]) input, .cv-scrim:not([hidden]) select')].find((n) => n.getAttribute('aria-label') === label && n.getClientRects().length);
  if (!i) throw new Error('no control ' + label);
  if (i.type === 'checkbox') i.checked = !!v; else i.value = v;
  i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true }));
}"""
PX = "([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data)"
DISTINCT = """() => { const c = window.formvis.engine.flattened(), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; const s = new Set(); for (let i = 0; i < d.length; i += 4) s.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]); return s.size; }"""


def ramp(page):
    page.evaluate("""() => { const e = window.formvis.engine; e.newDocument(100, 60, 'F', 'white'); const k = e.activeLayer.raster.ctx; const g = k.createLinearGradient(0, 0, 100, 0);
      g.addColorStop(0, '#f00'); g.addColorStop(1, '#00f'); k.fillStyle = g; k.fillRect(0, 0, 100, 60); e.activeLayer.raster.touch(); e.refresh(); }""")


def ok(page):
    page.locator(".cv-scrim:not([hidden]) .cv-dialog-foot button", has_text="OK").last.click()
    page.wait_for_timeout(1200)


def test_indexed_colour_limits_a_ramp_to_the_chosen_palette_size_and_undo_restores_the_ramp(page):
    # PC-UI-0139
    ramp(page)
    before = page.evaluate(DISTINCT)
    assert before > 50
    assert page.evaluate("window.formvis.commands.run('mode-indexed')")
    page.wait_for_timeout(700)
    page.evaluate(SET, ["Colors", 4])
    page.wait_for_timeout(300)
    ok(page)
    assert page.evaluate(DISTINCT) <= 4
    page.keyboard.press("Control+z")
    page.wait_for_timeout(700)
    assert page.evaluate(DISTINCT) == before


def test_color_table_command_is_off_in_rgb_and_opens_for_an_indexed_picture(page):
    # PC-UI-0139, PC-EN-0382
    ramp(page)
    assert not page.evaluate("window.formvis.commands.run('color-table')")
    assert page.evaluate("window.formvis.commands.run('mode-indexed')")
    page.wait_for_timeout(700)
    page.evaluate(SET, ["Colors", 8])
    ok(page)
    assert page.evaluate("window.formvis.commands.run('color-table')")
    page.wait_for_timeout(800)
    n = page.evaluate("document.querySelectorAll('.cv-scrim:not([hidden]) .cv-dialog').length")
    assert n >= 1
    swatches = page.evaluate("[...document.querySelectorAll('.cv-scrim:not([hidden]) input[type=color], .cv-scrim:not([hidden]) [style*=background]')].length")
    assert swatches >= 4, swatches
