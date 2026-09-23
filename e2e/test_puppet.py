SCENE = """async () => {
  const e = window.sonny.engine, E = await import('/src/engine/index.ts');
  e.newDocument(210, 150, 'P', 'transparent');
  e.addLayer(); e.fg = { r: 0, g: 0, b: 0 };
  e.applySelection(E.SelectionMask.cropped(95, 0, 20, 150, new Uint8Array(3000).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect();
  window.sonny.commands.run('puppet-warp');
  const v = e.current.viewport, r = document.querySelector('.cv-stage').getBoundingClientRect();
  return { ox: r.left + v.panX, oy: r.top + v.panY, z: v.zoom, on: !!e.puppetEdit };
}"""
CENTRE = "(y) => { const l = window.sonny.engine.current.activeLayer, c = window.sonny.engine.flattened().getContext('2d').getImageData(0, y, 210, 1).data, xs = []; for (let x = 0; x < 210; x++) if (c[x * 4 + 3] > 128) xs.push(x); return xs.length ? (xs[0] + xs[xs.length - 1] + 1) / 2 : null; }"


def at(s, x, y):
    return s["ox"] + x * s["z"], s["oy"] + y * s["z"]


def test_pinned_top_stays_and_dragged_bottom_follows(page):
    s = page.evaluate(SCENE)
    assert s["on"]
    page.mouse.click(*at(s, 105, 10))
    page.mouse.move(*at(s, 105, 140))
    page.mouse.down()
    for k in range(1, 7):
        page.mouse.move(*at(s, 105 + 40 * k / 6, 140))
    page.mouse.up()
    assert page.evaluate("window.sonny.engine.puppetEdit.to.length") == 2
    page.keyboard.press("Enter")
    page.wait_for_timeout(400)
    assert page.evaluate("window.sonny.engine.historySteps.names.slice(-1)[0]") == "Puppet Warp"
    assert abs(page.evaluate(CENTRE, 10) - 105) <= 2
    assert abs(page.evaluate(CENTRE, 140) - 145) <= 3
    mid = page.evaluate(CENTRE, 75)
    assert 108 < mid < 142
    page.evaluate("window.sonny.engine.undo()")
    assert page.evaluate(CENTRE, 140) == 105


def test_alt_click_removes_a_pin_and_escape_cancels(page):
    s = page.evaluate(SCENE)
    page.mouse.click(*at(s, 105, 30))
    page.mouse.click(*at(s, 105, 100))
    page.keyboard.down("Alt")
    page.mouse.click(*at(s, 105, 30))
    page.keyboard.up("Alt")
    assert page.evaluate("window.sonny.engine.puppetEdit.to.map((p) => Math.round(p[1]))") == [100]
    page.keyboard.press("Escape")
    page.wait_for_timeout(200)
    assert page.evaluate("window.sonny.engine.puppetEdit") is None
    assert "Puppet Warp" not in page.evaluate("window.sonny.engine.historySteps.names")
