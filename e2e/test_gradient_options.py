SETUP = """(fill) => { const e = window.formvis.engine; e.newDocument(256, 60, 'G', 'white');
  e.fg = fill; e.fill('fg'); e.fg = { r: 0, g: 0, b: 0 }; e.bg = { r: 255, g: 255, b: 255 };
  e.setTool('gradient'); if (e.tool !== 'gradient') throw new Error('tool'); e.gradientSettings.style = 'background';
  const v = e.current.viewport, b = document.querySelector('.cv-stage').getBoundingClientRect(); return [b.left + v.panX, b.top + v.panY, v.zoom]; }"""
ROW = "(() => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(0, 30, 256, 1).data).filter((_, i) => i % 4 === 0))()"


def drag(page, s, a, b):
    at = lambda x, y: (s[0] + x * s[2], s[1] + y * s[2])
    page.mouse.move(*at(*a)); page.mouse.down(); page.mouse.move(*at(*b), steps=5); page.mouse.up()
    page.keyboard.press("Enter")                              # a drag leaves an adjustable gradient; Enter applies it


def opt(page, label):
    page.evaluate("document.querySelector('.cv-opt-more:not([hidden])[aria-expanded=false]')?.click()")
    return page.locator(".cv-opt-group:not([hidden]), .cv-opt-pop-sect[style*='contents']").locator(".cv-opt", has_text=label)


def test_gradient_mode_multiplies_over_the_layer(page):
    s = page.evaluate(SETUP, {"r": 128, "g": 128, "b": 128})
    opt(page, "Mode").locator("select").select_option("multiply")
    drag(page, s, (0, 30), (256, 30))
    row = page.evaluate(ROW)
    assert all(v <= 129 for v in row), max(row)             # multiply over grey can only darken it
    assert row[250] >= 120 and row[5] <= 10, (row[5], row[250])


def test_gradient_dither_breaks_up_bands_and_is_repeatable(page):
    # Chrome's canvas already dithers the gradients it draws (a plain linear gradient alternates levels), so banding is
    # measured on the diamond, which formvis computes itself: 40 levels over 128 px from the centre, bands a few px wide.
    s = page.evaluate(SETUP, {"r": 255, "g": 255, "b": 255})
    page.evaluate("(() => { const e = window.formvis.engine; e.fg = { r: 100, g: 100, b: 100 }; e.bg = { r: 140, g: 140, b: 140 }; e.gradientSettings.shape = 'diamond'; })()")
    drag(page, s, (128, 30), (256, 30))
    plain = page.evaluate(ROW)
    page.evaluate("window.formvis.engine.undo()")
    opt(page, "Dither").locator("input").check()
    drag(page, s, (128, 30), (256, 30))
    dithered = page.evaluate(ROW)
    changes = lambda r: sum(1 for i in range(1, len(r)) if r[i] != r[i - 1])
    assert changes(dithered) > 2 * changes(plain), (changes(plain), changes(dithered))
    page.evaluate("window.formvis.engine.undo()")
    drag(page, s, (128, 30), (256, 30))
    assert page.evaluate(ROW) == dithered                     # the same grain every time
