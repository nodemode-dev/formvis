DLG = ".cv-scrim:not([hidden]) .cv-dialog"


def test_the_benchmark_dialog_opens_from_help(page):
    assert page.evaluate("window.sonny.commands.run('benchmark')")
    assert page.locator(DLG + " .cv-dialog-head").inner_text().startswith("Performance Benchmark")
    for name in ("Run", "Copy"):
        assert page.locator(DLG + " .cv-dialog-foot button", has_text=name).count() == 1
    page.keyboard.press("Escape")


def test_the_benchmark_times_every_test_and_restores_the_document(page):
    r = page.evaluate("""async () => {
      const B = await import('/src/gpu/bench.ts'), e = window.sonny.engine;
      e.newDocument(300, 200, 'Mine', 'white'); const mine = e.current.id, count = e.projects.length;
      const res = await B.runBenchmark(e, 1, 0);
      return { rows: res.rows.map((x) => x.test + ' | ' + x.path), restored: e.current.id === mine, closed: e.projects.length === count,
        text: B.benchText(res, 'test'), notes: res.notes };
    }""")
    assert r["restored"] and r["closed"], r
    tests = {row.split(" | ")[0] for row in r["rows"]}
    assert tests == {"Pan: blended and masked layers", "Pan: with Levels and Hue/Saturation layers", "Paint: a dab per frame"}, tests
    paths = {row.split(" | ")[1] for row in r["rows"]}
    assert {"CPU", "CPU (region redraw)", "WebGPU", "WebGL2"} <= paths, paths      # both GPU displays timed here
    assert not [n for n in r["notes"] if "draws on the CPU" in n], r["notes"]      # the test document stays on the GPU
    assert "Median ms" in r["text"]
