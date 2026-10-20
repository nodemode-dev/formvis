"""PC-AU-0211: the benchmark harness times the display paths and reports them. The dialog's Run runs 60 frames per test, which
takes minutes on a software graphics processor, so the harness is run here with two frames per test and the same text the
dialog shows is built from its result."""
from playwright.sync_api import Error

RUN = """async () => {
  const B = await import('/src/gpu/bench.ts'), e = window.formvis.engine;
  const res = await B.runBenchmark(e, 2, 0);
  return { rows: res.rows.map((x) => ({ test: x.test, path: x.path, frames: x.frames, med: x.medianMs, p90: x.p90Ms })), text: B.benchText(res, 'test adapter'), tabs: e.projects.length };
}"""


def run_once(page):
    try:
        return page.evaluate(RUN)
    except Error as err:
        if "context was destroyed" not in str(err):
            raise
        page.wait_for_function("window.formvis && window.formvis.engine", timeout=60000)
        return page.evaluate(RUN)


def test_the_dialog_offers_run_and_copy(page):
    assert page.evaluate("window.formvis.commands.run('benchmark')")
    dlg = ".cv-scrim:not([hidden]) .cv-dialog"
    assert page.locator(dlg + " .cv-dialog-head").inner_text().startswith("Performance Benchmark")
    assert "under a minute" in page.locator(dlg + " .cv-bench-state").inner_text()
    assert page.locator(dlg + " .cv-bench-out").is_hidden()
    page.keyboard.press("Escape")


def test_the_harness_reports_finite_timings_for_each_test_and_path(page):
    before = page.evaluate("window.formvis.engine.projects.length")
    r = run_once(page)
    assert r["tabs"] == before, "the temporary document is closed again"
    tests = {x["test"] for x in r["rows"]}
    assert tests == {"Pan: blended and masked layers", "Pan: with Levels and Hue/Saturation layers", "Paint: a dab per frame"}, tests
    assert len({x["path"] for x in r["rows"]}) >= 2, r["rows"]
    for x in r["rows"]:
        assert x["frames"] == 2 and 0 <= x["med"] <= x["p90"] < 60000, x
    assert "Median ms" in r["text"] and "test adapter" in r["text"] and "CPU" in r["text"], r["text"]
