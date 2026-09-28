PX = "([x, y]) => Array.from(window.sonny.engine.activeLayer.raster.ctx.getImageData(x, y, 1, 1).data).slice(0, 3)"
STEPS = "window.sonny.engine.current.history.past.length"


def scr(page, x, y):
    return page.evaluate("([x, y]) => { const v = window.sonny.engine.current.viewport, s = document.querySelector('.cv-stage').getBoundingClientRect(), q = v.toScreen(x, y); return [s.left + q.x, s.top + q.y]; }", [x, y])


def square(page, mode):
    page.evaluate("""async (mode) => { const E = await import('/src/engine/index.ts'), e = window.sonny.engine; e.newDocument(300, 140, 'C', 'white');
      e.fg = { r: 210, g: 30, b: 30 }; e.applySelection(E.SelectionMask.cropped(40, 40, 40, 40, new Uint8Array(1600).fill(255)), 'replace', 's'); e.fill('fg');
      e.applySelection(E.SelectionMask.cropped(34, 34, 52, 52, new Uint8Array(52 * 52).fill(255)), 'replace', 's');
      e.setTool('contentAwareMove'); const R = await import('/src/extensions/registry.ts'); R.getTool('contentAwareMove').options(e).find((o) => o.label === 'Mode').set(mode); }""", mode)
    n = page.evaluate(STEPS)
    a = scr(page, 60, 60); b = scr(page, 180, 60)
    page.mouse.move(*a); page.mouse.down(); page.mouse.move(*b, steps=10); page.mouse.up()
    return n


def test_content_aware_move_moves_and_fills_the_hole(page):
    n = square(page, 'move')
    assert page.evaluate(PX, [180, 60]) == [210, 30, 30]                                        # moved there
    old = page.evaluate(PX, [60, 60])
    assert min(old) > 200, old                                                                  # the hole filled from the white around
    assert page.evaluate("window.sonny.engine.current.selection.x") == 34 + 120                  # the selection went with it
    assert page.evaluate(STEPS) == n + 1
    page.keyboard.press("Control+z")
    assert page.evaluate(PX, [60, 60]) == [210, 30, 30] and page.evaluate(PX, [180, 60]) == [255, 255, 255]


def test_content_aware_extend_keeps_the_original(page):
    square(page, 'extend')
    assert page.evaluate(PX, [60, 60]) == [210, 30, 30] and page.evaluate(PX, [180, 60]) == [210, 30, 30]


def test_red_eye_darkens_the_pupil_only(page):
    page.evaluate("""async () => { const e = window.sonny.engine; e.newDocument(200, 120, 'R', 'white'); const c = e.activeLayer.raster.ctx;
      c.fillStyle = 'rgb(220, 180, 160)'; c.fillRect(0, 0, 200, 120); c.fillStyle = 'rgb(200, 30, 40)'; c.beginPath(); c.arc(100, 60, 10, 0, Math.PI * 2); c.fill(); e.activeLayer.raster.touch(); e.setTool('redEye'); }""")
    n = page.evaluate(STEPS)
    x, y = scr(page, 101, 61); page.mouse.click(x, y)
    px = page.evaluate(PX, [100, 60])
    assert px[0] == px[1] == px[2] and px[0] < 100, px                                           # a dark neutral
    assert page.evaluate(PX, [60, 60]) == [220, 180, 160]                                        # the skin untouched
    assert page.evaluate(STEPS) == n + 1
    x, y = scr(page, 30, 30); page.mouse.click(x, y)                                              # nothing red: no step
    assert page.evaluate(STEPS) == n + 1
    idx = page.evaluate("(async () => { const { toolGroups } = await import('/src/ui/tool-groups.ts'); return toolGroups().findIndex((g) => g.tools.some((t) => t.id === 'patch')); })()")
    page.locator(".cv-rail-tools .cv-tool").nth(idx).click(button="right")
    labels = page.locator(".cv-flyout:not([hidden]) .cv-flyout-label").all_inner_texts()
    assert "Content-Aware Move" in labels and "Red Eye" in labels, labels
    page.keyboard.press("Escape")
