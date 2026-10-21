# PC-UI-0803: a tool option that differs from its default and the selected tool are kept and restored when the page starts again;
# tools that need a gesture (crop) are not resumed.
READY = "window.formvis && window.formvis.engine && window.formvis.engine.tool !== undefined"


def settle(page):
    page.wait_for_function(READY, timeout=90000)
    page.wait_for_timeout(2000)


def test_selected_tool_and_a_changed_option_come_back_after_a_reload(page):
    settle(page)
    page.evaluate("""async () => { const e = window.formvis.engine; e.newDocument(100, 100, 'a', 'white'); e.setTool('eraser'); e.brushFlow = 0.37; e.emit('options', null);
      await new Promise((r) => setTimeout(r, 800)); }""")
    kept = page.evaluate("JSON.parse(localStorage.getItem('formvis.prefs') || '{}').toolOptions")
    assert "eraser.Flow" in kept
    page.reload(wait_until="load")
    settle(page)
    got = page.evaluate("({ tool: window.formvis.engine.tool, flow: window.formvis.engine.brushFlow })")
    assert got["tool"] == "eraser"
    assert abs(got["flow"] - 0.37) < 0.02


def test_a_tool_that_needs_a_gesture_is_not_resumed(page):
    settle(page)
    page.evaluate("""async () => { const e = window.formvis.engine; e.newDocument(100, 100, 'a', 'white'); e.setTool('crop');
      await new Promise((r) => setTimeout(r, 800)); }""")
    page.reload(wait_until="load")
    settle(page)
    assert page.evaluate("window.formvis.engine.tool") != "crop"
