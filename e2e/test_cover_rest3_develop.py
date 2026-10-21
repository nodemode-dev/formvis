PX = "([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data)"
HALVES = """() => { const e = window.formvis.engine; e.newDocument(100, 60, 'F', 'white'); const k = e.activeLayer.raster.ctx;
  k.fillStyle = 'rgb(40,80,200)'; k.fillRect(0, 0, 50, 60); k.fillStyle = 'rgb(128,128,128)'; k.fillRect(50, 0, 50, 60); e.activeLayer.raster.touch(); e.refresh(); }"""
GREY = """() => { const e = window.formvis.engine; e.newDocument(100, 60, 'F', 'white'); const k = e.activeLayer.raster.ctx;
  k.fillStyle = 'rgb(128,128,128)'; k.fillRect(0, 0, 100, 60); e.activeLayer.raster.touch(); e.refresh(); }"""
AFTER_GROUP = """([label, group, value]) => { const g = document.querySelector(`[role=group][aria-label=${group}]`); let n = g, r = null;
  while ((n = n.nextElementSibling)) { const c = n.querySelector && n.querySelector('input[type=range]'); if (c && c.getAttribute('aria-label') === label) { r = c; break; } }
  if (value !== null) { r.value = value; r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true })); }
  return r.value; }"""
AFTER_WHEEL = """(label) => { let n = document.querySelector('canvas[aria-label="Colour grading wheel"]').parentElement;
  while ((n = n.nextElementSibling)) { const c = n.querySelector && n.querySelector('input[type=range]'); if (c && c.getAttribute('aria-label') === label) return c.value; } return null; }"""


def open_develop(page):
    assert page.evaluate("window.formvis.commands.run('filter-develop')")
    page.wait_for_selector("canvas[aria-label='Colour grading wheel']", state="attached", timeout=8000)
    page.wait_for_timeout(1500)


def ok(page):
    page.locator("button:has-text('OK')").last.click()
    page.wait_for_timeout(2500)


def test_colour_mixer_blues_swatch_desaturates_only_the_blue_pixels(page):
    page.evaluate(HALVES)
    open_develop(page)
    assert page.evaluate(PX, [10, 30])[:3] == [40, 80, 200]
    page.locator("button[aria-label=Blues]:visible").first.click()
    page.wait_for_timeout(300)
    assert page.evaluate(AFTER_GROUP, ["Saturation", "Colours", -100]) == "-100"
    page.wait_for_timeout(2000)
    ok(page)
    r, g, b, _ = page.evaluate(PX, [10, 30])
    assert max(r, g, b) - min(r, g, b) <= 6, (r, g, b)
    assert page.evaluate(PX, [80, 30])[:3] == [128, 128, 128]


def test_colour_mixer_has_a_swatch_for_each_of_eight_colours_and_all_colours(page):
    page.evaluate(HALVES)
    open_develop(page)
    names = page.evaluate("[...document.querySelectorAll('[role=group][aria-label=Colours] button')].map((b) => b.getAttribute('aria-label'))")
    assert names == ["All colours", "Reds", "Oranges", "Yellows", "Greens", "Aquas", "Blues", "Purples", "Magentas"], names


def test_clicking_the_grading_wheel_toward_red_tints_grey_and_double_click_resets_it(page):
    page.evaluate(GREY)
    open_develop(page)
    wheel = page.locator("canvas[aria-label='Colour grading wheel']:visible").first
    wheel.scroll_into_view_if_needed()
    wheel.click(position={"x": 90, "y": 48})
    page.wait_for_timeout(1500)
    assert int(page.evaluate(AFTER_WHEEL, "Saturation")) >= 80
    wheel.dblclick(position={"x": 48, "y": 48})
    page.wait_for_timeout(800)
    assert page.evaluate(AFTER_WHEEL, "Saturation") == "0" and page.evaluate(AFTER_WHEEL, "Hue") == "0"
    wheel.click(position={"x": 90, "y": 48})
    page.wait_for_timeout(1500)
    ok(page)
    r, g, b, _ = page.evaluate(PX, [10, 30])
    assert r > g + 30 and abs(g - b) <= 4, (r, g, b)
