SETUP = """(sub) => { const e = window.sonny.engine; e.newDocument(300, 140, 'S', 'white'); e.fg = { r: 0, g: 0, b: 0 }; e.setBrush({ diameter: 20, hardness: 1, opacity: 1 });
  e.setWorkPath({ subpaths: [sub] }); }"""
LINE = {"closed": False, "anchors": [{"x": 20, "y": 70, "inX": 20, "inY": 70, "outX": 20, "outY": 70}, {"x": 280, "y": 70, "inX": 280, "inY": 70, "outX": 280, "outY": 70}]}
TALL = "(x) => { const d = window.sonny.engine.flattened().getContext('2d').getImageData(x, 0, 1, 140).data; let n = 0; for (let i = 0; i < 140; i++) if (d[i * 4] < 128) n++; return n; }"
DLG = ".cv-scrim:not([hidden]) .cv-dialog"


def stroke(page, tool, pressure):
    assert page.evaluate("window.sonny.commands.run('stroke-path-dialog')") is True
    dlg = page.locator(DLG)
    dlg.locator(".cv-field", has_text="Tool").locator("select").select_option(tool)
    box = dlg.locator(".cv-field", has_text="Simulate Pressure").locator("input")
    if box.is_checked() != pressure: box.click()
    dlg.locator(".cv-dialog-foot button", has_text="OK").click()


def test_stroke_path_uses_the_tool_and_tapers_with_simulated_pressure(page):
    page.evaluate(SETUP, LINE)
    stroke(page, "brush", False)
    plain = [page.evaluate(TALL, x) for x in (30, 150)]
    assert all(18 <= h <= 22 for h in plain), plain
    assert page.evaluate("window.sonny.engine.historySteps.names.slice(-1)[0]") == "Stroke Path"
    page.evaluate("window.sonny.engine.undo()")
    assert page.evaluate(TALL, 150) == 0
    stroke(page, "brush", True)
    near_end, middle = page.evaluate(TALL, 30), page.evaluate(TALL, 150)
    assert near_end < 10 and middle >= 18, (near_end, middle)


def test_stroke_path_follows_the_curve(page):
    arc = {"closed": False, "anchors": [{"x": 40, "y": 110, "inX": 40, "inY": 110, "outX": 40, "outY": 10}, {"x": 260, "y": 110, "inX": 260, "inY": 10, "outX": 260, "outY": 110}]}
    page.evaluate(SETUP, arc)
    stroke(page, "brush", False)
    # the curve's apex is 75 px above the ends' line (3/4 of the handles' reach); a straight chord would leave it white
    dark = page.evaluate("(() => { const d = window.sonny.engine.flattened().getContext('2d').getImageData(150, 35, 1, 1).data; return d[0] < 128; })()")
    assert dark
