DLG = ".cv-scrim:not([hidden]) .cv-dialog"


def section(page, name):
    page.locator(f"{DLG} .cv-prefs-nav button", has_text=name).first.click()


def pick(page, label, value):
    page.locator(f"{DLG} label.cv-field", has_text=label).locator("select").select_option(value)


def tick(page, label, on=True):
    box = page.locator(f"{DLG} label", has_text=label).locator("input[type=checkbox]").first
    box.check() if on else box.uncheck()


def number(page, label, value):
    f = page.locator(f"{DLG} .cv-slider", has_text=label).locator("input[type=number]")
    f.fill(str(value)); f.press("Enter"); f.dispatch_event("change")


def test_the_usual_sections_each_act_on_something_real(page):
    try:
        page.evaluate("window.formvis.engine.newDocument(400, 300, 'P', 'transparent')")
        page.evaluate("window.formvis.commands.run('settings')")
        names = page.locator(f"{DLG} .cv-prefs-nav button").all_inner_texts()
        for n in ["General", "Interface", "Workspace", "Tools", "History & Cache", "File Handling", "Performance", "Cursors", "Transparency & Gamut", "Units & Rulers", "Guides & Grid"]:
            assert n in names, names
        section(page, "Transparency & Gamut"); pick(page, "Grid Size", "large"); pick(page, "Grid Colors", "dark")
        section(page, "Tools"); tick(page, "Zoom with Scroll Wheel")
        section(page, "Guides & Grid"); number(page, "Gridline Every", 50)
        section(page, "History & Cache"); tick(page, "Automatically Create First Snapshot", False)
        section(page, "Cursors"); pick(page, "Painting Cursors", "precise")
        section(page, "Units & Rulers"); pick(page, "Rulers", "in")
        section(page, "Workspace"); tick(page, "Lock Workspace")
        page.keyboard.press("Escape")
        # Their effects, not only their values:
        page.wait_for_timeout(300)
        row = page.evaluate("""(() => { const c = document.querySelector('.cv-stage .cv-scene'), v = window.formvis.engine.current.viewport, d = c.width / c.clientWidth, g = c.getContext('2d'), p = v.toScreen(0, 0);
          const out = []; for (let i = 0; i < 64; i += 2) out.push(g.getImageData(Math.round((p.x + 2 + i) * d), Math.round((p.y + 2) * d), 1, 1).data[0]); return out; })()""")
        assert set(row) == {102, 153}, row                                                     # the dark pair, drawn
        runs = [len(list(g)) for _, g in __import__('itertools').groupby(row)][1:-1]
        assert runs and all(r == 8 for r in runs), row                                          # 16 px squares (sampled every 2 px)
        z0 = page.evaluate("window.formvis.engine.current.viewport.zoom")
        b = page.locator(".cv-stage").bounding_box(); page.mouse.move(b["x"] + b["width"] / 3, b["y"] + b["height"] / 2); page.mouse.wheel(0, -200)
        page.wait_for_timeout(100)
        assert page.evaluate("window.formvis.engine.current.viewport.zoom") > z0                   # the wheel zooms
        assert page.evaluate("window.formvis.engine.view.gridSpacing") == 50
        assert page.evaluate("window.formvis.engine.cursorPrefs.paint") == "precise"
        assert page.evaluate("(async () => (await import('/src/ui/stage.ts')).Stage.prefs.rulerUnits)()") == "in"
        assert page.evaluate("localStorage.getItem('formvis.lock')") == "1"
        page.evaluate("window.formvis.engine.newDocument(100, 100, 'N', 'white')")
        assert page.evaluate("window.formvis.engine.snapshots.length") == 0                        # no first snapshot
        page.reload(); page.wait_for_function("window.formvis && window.formvis.engine")
        assert page.evaluate("window.formvis.engine.view.gridSpacing") == 50                        # kept
        # Reset All Preferences: everything back, formvis reloads.
        page.evaluate("window.formvis.commands.run('settings')")
        section(page, "General")
        page.locator(f"{DLG} button", has_text="Reset All Preferences").click()
        with page.expect_navigation():
            page.locator(".cv-scrim:not([hidden]) .cv-dialog-foot button", has_text="Reset").last.click()
        page.wait_for_function("window.formvis && window.formvis.engine")
        assert page.evaluate("[window.formvis.engine.view.gridSpacing, window.formvis.engine.cursorPrefs.paint]") == [100, "tip"]
        assert page.evaluate("localStorage.getItem('formvis.lock')") in (None, "0")                   # unlocked (written as 0 at start)
    finally:
        page.evaluate("for (const k of Object.keys(localStorage)) if (k.startsWith('formvis.')) localStorage.removeItem(k)")
        page.reload(); page.wait_for_function("window.formvis && window.formvis.engine")
