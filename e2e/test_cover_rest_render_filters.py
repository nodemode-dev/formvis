STAT = """() => { const c = window.formvis.engine.flattened(); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let n = 0, r = 0, g = 0, b = 0;
  for (let i = 0; i < d.length; i += 4) { if (d[i] < 250 || d[i + 1] < 250 || d[i + 2] < 250) { n++; r += d[i]; g += d[i + 1]; b += d[i + 2]; } }
  return [n, n ? r / n : 0, n ? g / n : 0, n ? b / n : 0]; }"""


def blank(page):
    page.evaluate("window.formvis.engine.newDocument(200, 200, 'R', 'white')")


def run_filter(page, command):
    assert page.evaluate(f"window.formvis.commands.run('{command}')")
    page.wait_for_timeout(1200)
    page.locator(".cv-scrim:not([hidden]) .cv-dialog-foot button", has_text="OK").last.click()
    page.wait_for_timeout(1200)


def test_flame_draws_orange_flames_on_a_blank_layer_in_one_step(page):
    # PC-EN-0294, PC-UI-0467
    blank(page)
    assert page.evaluate(STAT)[0] == 0
    run_filter(page, "filter-flame")
    n, r, g, b = page.evaluate(STAT)
    assert n > 5000
    assert r > g > b
    assert page.evaluate("window.formvis.engine.historySteps.names.slice(-1)[0]") == "Flame"
    page.evaluate("window.formvis.engine.undo()")
    page.wait_for_function(f"({STAT})()[0] === 0")


def test_tree_draws_green_foliage_and_brown_wood_on_a_blank_layer(page):
    # PC-EN-0299
    blank(page)
    run_filter(page, "filter-tree")
    n, r, g, b = page.evaluate(STAT)
    assert n > 2000
    assert g > r and g > b
    assert page.evaluate("window.formvis.engine.historySteps.names.slice(-1)[0]") == "Tree"
    page.evaluate("window.formvis.engine.undo()")
    page.wait_for_function(f"({STAT})()[0] === 0")
