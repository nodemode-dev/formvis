# Help > System Info and Report an Issue, Help > GitHub, Reset Tool and Reset All Tools, Measurement Log.
RUN = "(id) => window.formvis.commands.run(id)"
DIALOGS = "[...document.querySelectorAll('.cv-dialog')].filter((d) => d.offsetParent).map((d) => d.textContent)"


def test_system_info_returns_the_version_system_graphics_and_engine_lines(page):
    text = page.evaluate("window.formvis.commands.get('system-info').run({ show: false })")
    assert text.startswith("formvis ") and "engine" in text.splitlines()[0]
    for key in ("System:", "Browser:", "Graphics:", "Monitor:", "Engine memory:"):
        assert key in text


def test_system_info_window_shows_the_same_text(page):
    page.evaluate("window.formvis.commands.run('system-info')")
    page.wait_for_function("[...document.querySelectorAll('.cv-dialog')].some((d) => d.offsetParent && d.textContent.includes('Engine memory:'))", timeout=10000)


def test_report_issue_dialog_opens_with_the_diagnostics(page):
    page.evaluate("window.formvis.commands.run('report-issue')")
    page.wait_for_function("[...document.querySelectorAll('.cv-dialog')].some((d) => d.offsetParent && (d.textContent.includes('Engine memory:') || [...d.querySelectorAll('textarea')].some((t) => t.value.includes('Engine memory:'))))", timeout=10000)


def test_reset_tool_puts_the_current_tool_options_back_and_reset_all_does_every_tool(page):
    page.evaluate("window.formvis.engine.newDocument(100, 100, 'R', 'white'); window.formvis.engine.setTool('brush')")
    assert page.evaluate("window.formvis.engine.brush.diameter") == 40
    page.evaluate("window.formvis.engine.brush.diameter = 77; window.formvis.engine.brush.hardness = 0.3")
    page.wait_for_timeout(300)
    page.evaluate(RUN, "reset-tool")
    page.wait_for_function("window.formvis.engine.brush.diameter === 40 && window.formvis.engine.brush.hardness === 1", timeout=5000)
    page.evaluate("window.formvis.engine.setTool('gradient'); window.formvis.engine.gradientSettings.opacity = 0.4")
    page.wait_for_timeout(300)
    page.evaluate(RUN, "reset-all-tools")
    page.wait_for_function("window.formvis.engine.gradientSettings.opacity === 1", timeout=5000)


def test_measurement_log_records_a_selection_lists_it_and_clear_empties_it(page):
    page.evaluate("""async () => { const e = window.formvis.engine, E = await import('/src/engine/index.ts');
      e.newDocument(100, 100, 'M', 'white'); e.applySelection(E.SelectionMask.cropped(10, 10, 20, 10, new Uint8Array(200).fill(255)), 'replace', 's'); }""")
    page.evaluate(RUN, "measure-log")
    dlg = page.locator(".cv-dialog:visible", has_text="Measurement Log")
    dlg.get_by_role("button", name="Record").click()
    assert dlg.locator("tbody tr").count() == 1
    assert "200" in dlg.locator("tbody tr").first.inner_text()
    assert "1 record" in dlg.inner_text()
    dlg.get_by_role("button", name="Record").click()
    assert dlg.locator("tbody tr").count() == 2
    dlg.locator("tbody tr").first.click()
    dlg.get_by_role("button", name="Delete Selected").click()
    assert dlg.locator("tbody tr").count() == 1
    dlg.get_by_role("button", name="Clear").click()
    assert dlg.locator("tbody tr").count() == 0 and "No records yet" in dlg.inner_text()


def test_measurement_scale_converts_the_recorded_area(page):
    page.evaluate("""async () => { const e = window.formvis.engine, E = await import('/src/engine/index.ts');
      e.newDocument(100, 100, 'M', 'white'); e.applySelection(E.SelectionMask.cropped(0, 0, 20, 10, new Uint8Array(200).fill(255)), 'replace', 's'); }""")
    page.evaluate("window.formvis.commands.run('measure-scale', { pixels: 10, length: 1, units: 'cm' })")
    page.evaluate(RUN, "measure-record")
    m = page.evaluate("window.formvis.engine.current.doc.measurements[0]")
    assert m["units"] == "cm" and abs(m["area"] - 2.0) < 0.01
