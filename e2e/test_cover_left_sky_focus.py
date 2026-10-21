import re

SKY = """() => { const e = window.formvis.engine; e.newDocument(200, 200, 'K', 'white'); e.deselect(); const c = e.activeLayer.raster.ctx;
  const g = c.createLinearGradient(0, 0, 0, 100); g.addColorStop(0, 'rgb(70,130,220)'); g.addColorStop(1, 'rgb(170,205,245)'); c.fillStyle = g; c.fillRect(0, 0, 200, 100);
  c.fillStyle = 'rgb(60,90,40)'; c.fillRect(0, 100, 200, 100);
  for (let i = 0; i < 400; i++) { c.fillStyle = 'rgb(' + (30 + i % 90) + ',' + (60 + (i * 7) % 80) + ',30)'; c.fillRect((i * 37) % 200, 100 + (i * 13) % 100, 6, 6); }
  e.activeLayer.raster.touch(); }"""
FOCUS = """() => { const e = window.formvis.engine; e.newDocument(200, 200, 'F', 'rgb(128,128,128)'); e.deselect(); const c = e.activeLayer.raster.ctx;
  c.fillStyle = 'rgb(128,128,128)'; c.fillRect(0, 0, 200, 200);
  for (let y = 0; y < 100; y += 4) for (let x = 0; x < 100; x += 4) { c.fillStyle = ((x + y) / 4) % 2 ? 'rgb(240,240,240)' : 'rgb(20,20,20)'; c.fillRect(x, y, 4, 4); }
  e.activeLayer.raster.touch(); }"""
VAL = "([x, y]) => window.formvis.engine.current.selection.valueAt(x, y)"
LAST = "window.formvis.engine.historySteps.names.slice(-1)[0]"


def menu(page, *path):
    page.locator(".cv-menu-btn", has_text=path[0]).first.click()
    for i, label in enumerate(path[1:]):
        item = page.locator(".cv-menu:not([hidden]) > *", has_text=re.compile("^" + re.escape(label) + "(?![A-Za-z ])")).first
        item.hover() if i < len(path) - 2 else item.click()


def test_select_sky_quick_method_selects_the_sky_and_not_the_ground(page):
    # PC-EN-0127, PC-UI-0409
    page.evaluate(SKY)
    menu(page, "Select", "Sky")
    page.wait_for_function(f"{LAST} === 'Select Sky'", timeout=30000)
    assert page.evaluate(VAL, [100, 20]) > 200 and page.evaluate(VAL, [5, 5]) > 200
    assert page.evaluate(VAL, [100, 180]) == 0
    page.evaluate("window.formvis.engine.undo()")
    assert page.evaluate("window.formvis.engine.current.selection") is None


def test_select_focus_area_dialog_selects_the_sharp_block_and_not_the_flat_area(page):
    # PC-UI-0407
    page.evaluate(FOCUS)
    menu(page, "Select", "Focus Area...")
    d = page.locator(".cv-scrim:not([hidden]) .cv-dialog")
    d.wait_for()
    page.wait_for_function("document.querySelector('.cv-scrim:not([hidden]) .cv-dialog-note').textContent.includes('In focus')")
    d.locator(".cv-dialog-foot button", has_text="OK").click()
    page.wait_for_function(f"{LAST} === 'Focus Area'", timeout=10000)
    assert page.evaluate(VAL, [50, 50]) > 200
    assert page.evaluate(VAL, [150, 150]) == 0
    page.evaluate("window.formvis.engine.undo()")
    assert page.evaluate("window.formvis.engine.current.selection") is None
