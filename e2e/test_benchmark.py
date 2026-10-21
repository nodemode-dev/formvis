DLG = ".cv-scrim:not([hidden]) .cv-dialog"


def test_the_benchmark_dialog_opens_from_help(page):
    assert page.evaluate("window.formvis.commands.run('benchmark')")
    assert page.locator(DLG + " .cv-dialog-head").inner_text().startswith("Performance Benchmark")
    for name in ("Run", "Copy"):
        assert page.locator(DLG + " .cv-dialog-foot button", has_text=name).count() == 1
    page.keyboard.press("Escape")


def test_the_benchmark_times_every_test_and_restores_the_document(page):
    r = page.evaluate("""async () => {
      const B = await import('/src/gpu/bench.ts'), e = window.formvis.engine;
      e.newDocument(300, 200, 'Mine', 'white'); const mine = e.current.id, count = e.projects.length;
      const res = await B.runBenchmark(e, 1, 0);
      return { rows: res.rows.map((x) => x.test + ' | ' + x.path), restored: e.current.id === mine, closed: e.projects.length === count,
        text: B.benchText(res, 'test'), notes: res.notes };
    }""")
    assert r["restored"] and r["closed"], r
    tests = {row.split(" | ")[0] for row in r["rows"]}
    assert tests == {"Pan: blended and masked layers", "Pan: with Levels and Hue/Saturation layers", "Paint: a dab per frame"}, tests
    paths = {row.split(" | ")[1] for row in r["rows"]}
    assert {"CPU", "CPU (region redraw)"} <= paths, paths      # both GPU displays are listed, timed or skipped with a reason
    assert any(p.startswith("WebGPU") for p in paths) and any(p.startswith("WebGL2") for p in paths), paths
    assert not [n for n in r["notes"] if "draws on the CPU" in n], r["notes"]      # the test document stays on the GPU
    assert "P50 ms" in r["text"] and "P95 ms" in r["text"]


def test_each_gpu_path_draws_what_the_cpu_draws(page):
    # 1.61.7, the register's H4: Automatic picks the fastest *correct* path, so ./formvis bench checks each path too.
    r = page.evaluate("""async () => {
      const B = await import('/src/gpu/bench.ts'), e = window.formvis.engine;
      e.newDocument(300, 200, 'Mine', 'white'); const mine = e.current.id, count = e.projects.length;
      const checks = await B.checkPaths(e);
      return { checks, restored: e.current.id === mine, closed: e.projects.length === count };
    }""")
    assert r["restored"] and r["closed"], r
    paths = {c["path"]: c for c in r["checks"]}
    assert set(paths) == {"WebGPU", "WebGL2"}, paths      # both GPU displays checked here
    # The bar of test_gpu_adjust (the document has Levels and Hue/Saturation layers): 99% of values within 4 levels.
    assert all(c["share"] >= 0.99 and c["maxDiff"] <= 8 for c in paths.values()), paths
