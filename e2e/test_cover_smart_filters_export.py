import functools

from playwright.sync_api import Error as PlaywrightError

SETUP = """async () => {
  const e = window.formvis.engine;
  e.newDocument(60, 20, 'F', 'white');
  const l = e.current.activeLayer, c = l.raster.ctx;
  c.fillStyle = '#000'; c.fillRect(0, 0, 30, 20); l.raster.touch(); e.refresh();
  window.formvis.commands.run('convert-smart');
}"""
AT = "(x) => window.formvis.engine.flattened().getContext('2d').getImageData(x, 10, 1, 1).data[0]"
FK = "() => window.formvis.engine.current.activeLayer.smart.filters.map((f) => [f.kind, f.blend || 'normal', f.opacity ?? 100])"
PATCH = "(p) => { const e = window.formvis.engine, l = e.current.activeLayer; e.setSmartFilters(l.id, l.smart.filters.map((f) => ({ ...f, ...p }))); }"


def steady(fn):
    @functools.wraps(fn)
    def run(page):
        for attempt in range(3):
            try:
                return fn(page)
            except PlaywrightError as err:
                if "context was destroyed" not in str(err) or attempt == 2:
                    raise
                page.wait_for_function("window.formvis && window.formvis.engine", timeout=60000)
    return run


def settle(page, ms=1500):
    page.wait_for_timeout(ms)


@steady
def test_smart_filter_opacity_and_blend_mode_change_the_result_live(page):
    page.evaluate(SETUP)
    page.evaluate("window.formvis.engine.addSmartFilter('gaussianBlur', { radius: 6 })")
    settle(page)
    full = page.evaluate(AT, 27)
    assert full > 60
    page.evaluate(PATCH, {"opacity": 50})
    settle(page)
    half = page.evaluate(AT, 27)
    assert 20 < half < full - 20 and page.evaluate(FK) == [["gaussianBlur", "normal", 50]]
    page.evaluate(PATCH, {"opacity": 100, "blend": "multiply"})
    settle(page)
    assert page.evaluate(AT, 27) < 5 and page.evaluate(FK) == [["gaussianBlur", "multiply", 100]]
    page.evaluate(PATCH, {"blend": "normal"})
    settle(page)
    assert abs(page.evaluate(AT, 27) - full) <= 2


@steady
def test_reordering_two_smart_filters_is_one_named_step(page):
    page.evaluate(SETUP)
    page.evaluate("(() => { const e = window.formvis.engine; e.addSmartFilter('gaussianBlur', { radius: 6 }); e.addSmartFilter('boxBlur', { radius: 2 }); })()")
    settle(page, 800)
    assert [f[0] for f in page.evaluate(FK)] == ["gaussianBlur", "boxBlur"]
    page.evaluate("(() => { const e = window.formvis.engine; e.reorderSmartFilter(e.current.activeLayer.id, 0, 1); })()")
    assert [f[0] for f in page.evaluate(FK)] == ["boxBlur", "gaussianBlur"]
    assert page.evaluate("window.formvis.engine.historySteps.names.slice(-1)[0]") == "Reorder Smart Filters"
    page.evaluate("window.formvis.engine.undo()")
    assert [f[0] for f in page.evaluate(FK)] == ["gaussianBlur", "boxBlur"]


def test_export_contents_writes_a_webp_by_its_name(browser):
    ctx = browser.new_context(viewport={"width": 1400, "height": 900}, accept_downloads=True)
    page = ctx.new_page()
    try:
        from e2e.conftest import URL
        page.goto(URL)
        page.wait_for_function("window.formvis && window.formvis.engine", timeout=60000)
        page.evaluate(SETUP)
        page.evaluate("window.formvis.commands.run('smart-export-contents')")
        dlg = page.locator(".cv-scrim:not([hidden]) .cv-dialog")
        dlg.wait_for(timeout=10000)
        assert "Export Contents" in dlg.inner_text()
        dlg.locator("input").first.fill("out.webp")
        with page.expect_download(timeout=20000) as d:
            dlg.locator(".cv-dialog-foot button", has_text="Export").click()
        data = open(d.value.path(), "rb").read()
        assert d.value.suggested_filename == "out.webp" and data[:4] == b"RIFF" and data[8:12] == b"WEBP"
    finally:
        ctx.close()
