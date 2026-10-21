OPTION = """async () => { const R = await import('/src/extensions/registry.ts'), e = window.formvis.engine;
  const o = R.getTool('move').options(e).find((x) => x.kind === 'toggle' && x.label === 'Auto-Select'); return [o.get(), e.tool]; }"""
FLIP = """async () => { const R = await import('/src/extensions/registry.ts'), e = window.formvis.engine; e.setTool('move');
  const o = R.getTool('move').options(e).find((x) => x.kind === 'toggle' && x.label === 'Auto-Select'); o.set(!o.get()); return o.get(); }"""


def test_a_changed_tool_option_and_the_selected_tool_come_back_after_a_reload(page):
    start = page.evaluate(OPTION)[0]
    assert page.evaluate(FLIP) is (not start)
    page.wait_for_function("JSON.parse(localStorage.getItem('formvis.prefs') || '{}').toolOptions", timeout=4000)
    page.reload()
    page.wait_for_function("window.formvis && window.formvis.engine", timeout=60000)
    page.wait_for_timeout(2000)
    value, tool = page.evaluate(OPTION)
    assert value is (not start) and tool == "move"
