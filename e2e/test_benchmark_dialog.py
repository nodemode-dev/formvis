"""PC-AU-0211: Run in the Benchmark dialog always finishes (each path has a time cap, an unavailable or too slow path is
skipped with its reason), reports P50 and P95 against a budget per path, the peak JS heap, and compares with a saved
baseline. Cancel stops it. On a software graphics processor a single frame can block for seconds, so the waits are long."""
DLG = ".cv-scrim:not([hidden]) .cv-dialog"
STATE = ".cv-bench-state"
SLOW = 170000


def open_dialog(page):
    page.evaluate("try { localStorage.removeItem('formvis.benchBaseline') } catch (e) {}")
    assert page.evaluate("window.formvis.commands.run('benchmark')")
    page.locator(DLG + " .cv-dialog-foot button", has_text="Run").wait_for()


def foot(page, name):
    return page.locator(DLG + " .cv-dialog-foot button", has_text=name)


def test_run_finishes_with_p50_p95_budget_marks_and_a_baseline(page):
    open_dialog(page)
    before = page.evaluate("window.formvis.engine.projects.length")
    foot(page, "Run").click()
    page.wait_for_function("document.querySelector('.cv-bench-state').textContent === 'Done.'", timeout=SLOW)
    head = page.locator(DLG + " .cv-bench-table thead").inner_text()
    assert "P50 ms" in head and "P95 ms" in head and "Budget ms" in head
    rows = page.locator(DLG + " .cv-bench-table tbody tr")
    assert rows.count() >= 6
    marks = [rows.nth(i).locator("td").nth(5).inner_text() for i in range(rows.count())]
    assert all(m.startswith(("within budget", "over budget", "skipped:")) for m in marks), marks
    assert any(not m.startswith("skipped:") for m in marks), "the CPU paths always measure"
    for i in range(rows.count()):
        cells = [c.inner_text() for c in rows.nth(i).locator("td").all()]
        if not cells[5].startswith("skipped:"):
            assert 0 <= float(cells[2]) <= float(cells[3]) and float(cells[4]) > 0, cells
        else:
            assert len(cells[5]) > len("skipped: "), "a skipped path says why"
    assert "Peak JS heap:" in page.locator(DLG + " .cv-bench-heap").inner_text()
    text = page.locator(DLG + " .cv-bench-out").evaluate("e => e.textContent")
    assert "P50 ms" in text and "P95 ms" in text and "Vs baseline" in text
    assert page.evaluate("window.formvis.engine.projects.length") == before, "the temporary document is closed again"
    foot(page, "Save as baseline").click()
    assert "baseline" in page.locator(DLG + " " + STATE).inner_text()
    saved = page.evaluate("JSON.parse(localStorage.getItem('formvis.benchBaseline'))")
    assert saved and all(v >= 0 for v in saved.values())
    cell = rows.first.locator("td").nth(6).inner_text()
    assert cell == "0%", cell
    page.keyboard.press("Escape")


def test_cancel_stops_the_run_and_keeps_what_was_measured(page):
    open_dialog(page)
    foot(page, "Run").click()
    page.wait_for_function("document.querySelectorAll('.cv-bench-table tbody tr').length >= 1", timeout=SLOW)
    foot(page, "Cancel").click(timeout=SLOW)
    page.wait_for_function("document.querySelector('.cv-bench-state').textContent.startsWith('Cancelled')", timeout=SLOW)
    assert foot(page, "Run").is_enabled() and foot(page, "Cancel").is_disabled()
    assert page.locator(DLG + " .cv-bench-table tbody tr").count() < 9, "the paths not reached are not listed"
    page.keyboard.press("Escape")
