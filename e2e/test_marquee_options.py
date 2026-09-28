SETUP = """() => { const e = window.formvis.engine; e.newDocument(200, 160, 'M', 'white'); e.setTool('marquee'); if (e.tool !== 'marquee') throw new Error('tool');
  const v = e.current.viewport, b = document.querySelector('.cv-stage').getBoundingClientRect(); return [b.left + v.panX, b.top + v.panY, v.zoom]; }"""
AT = "([x, y]) => window.formvis.engine.current.selection ? window.formvis.engine.current.selection.valueAt(x, y) : null"
BOUNDS = "(() => { const s = window.formvis.engine.current.selection; return [s.x, s.y, s.w, s.h]; })()"


def drag(page, s, a, b):
    at = lambda x, y: (s[0] + x * s[2], s[1] + y * s[2])
    page.mouse.move(*at(*a)); page.mouse.down(); page.mouse.move(*at(*b), steps=6); page.mouse.up()


def opt(page, label):
    return page.locator(".cv-opt-group:not([hidden]) .cv-opt", has_text=label)


def test_marquee_feather_style_and_anti_alias(page):
    s = page.evaluate(SETUP)
    assert not opt(page, "Anti-alias").is_visible()                       # rectangles only: no Anti-alias, as Photoshop
    page.evaluate("window.formvis.engine.update({ marqueeKind: 'ellipse' })")
    assert opt(page, "Anti-alias").is_visible()
    page.evaluate("window.formvis.engine.update({ marqueeKind: 'rectangle' })")
    # Feather 10: full in the middle, about half on the edge, some just outside
    f = opt(page, "Feather").locator("input[type=number]"); f.fill("10"); f.press("Tab")
    drag(page, s, (50, 40), (150, 120))
    mid, edge, out = page.evaluate(AT, [100, 80]), page.evaluate(AT, [50, 80]), page.evaluate(AT, [44, 80])
    assert mid == 255 and 90 < edge < 170 and 0 < out < 90, (mid, edge, out)
    f.fill("0"); f.press("Tab")
    # Fixed Ratio 2:1: an 80 px wide drag gives 80 by 40
    opt(page, "Style").locator("select").select_option("ratio")
    opt(page, "Width").first.locator("input").fill("2"); opt(page, "Width").first.locator("input").press("Tab")
    opt(page, "Height").first.locator("input").fill("1"); opt(page, "Height").first.locator("input").press("Tab")
    drag(page, s, (20, 20), (100, 30))
    assert page.evaluate(BOUNDS) == [20, 20, 80, 40], page.evaluate(BOUNDS)
    # Fixed Size 50 by 30: a click places that size at the pointer. The rows swap on the next frame, so the test waits
    # for Fixed Size's own rows (pixels, up to 30000) rather than taking whichever Width row is showing at that instant.
    opt(page, "Style").locator("select").select_option("size")
    size = page.locator(".cv-opt-group:not([hidden]) .cv-opt input[type=number][max='30000']")
    size.nth(0).wait_for(state="visible")
    size.nth(0).fill("50"); size.nth(0).press("Tab")
    size.nth(1).fill("30"); size.nth(1).press("Tab")
    drag(page, s, (60, 70), (60, 70))
    assert page.evaluate(BOUNDS) == [60, 70, 50, 30], page.evaluate(BOUNDS)
