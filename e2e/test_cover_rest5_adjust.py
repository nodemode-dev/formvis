D = ".cv-scrim:not([hidden]) .cv-dialog"


def scr(page, x, y):
    return page.evaluate("([x, y]) => { const v = window.formvis.engine.current.viewport, s = document.querySelector('.cv-overlay-canvas').getBoundingClientRect(), q = v.toScreen(x, y); return [s.left + q.x - (v.panX - v.panX), s.top + q.y]; }", [x, y])


def test_curves_black_gray_and_white_point_eyedroppers_set_a_point_on_each_colour_curve_from_the_clicked_pixel(page):
    for mode, want_y in (("Black point", 0), ("White point", 255), ("Gray point", 128)):
        page.evaluate("""() => { const e = window.formvis.engine; e.newDocument(200, 120, 'C', 'white'); e.fg = { r: 100, g: 110, b: 120 }; e.selectAll(); e.fill('fg'); e.deselect(); e.addAdjustmentLayer('curves'); }""")
        page.evaluate("window.formvis.commands.run('edit-adjustment')")
        page.locator(D).last.wait_for()
        page.wait_for_timeout(800)
        info = page.evaluate("""() => { const d = [...document.querySelectorAll('.cv-scrim:not([hidden]) .cv-dialog')].pop();
          return [...d.querySelectorAll('select')].map((s, i) => [i, [...s.options].map((o) => o.textContent).join('/'), s.getClientRects().length > 0]); }""")
        idx = [i for i, opts, vis in info if "Black point" in opts and vis]
        assert idx, info
        page.locator(f"{D} select").nth(idx[-1]).select_option(label=mode, force=True)
        page.wait_for_timeout(300)
        x, y = page.evaluate("""() => { const v = window.formvis.engine.current.viewport, s = document.querySelector('.cv-overlay-canvas').getBoundingClientRect(); return [s.left + v.panX + 100 * v.zoom, s.top + v.panY + 60 * v.zoom]; }""")
        page.mouse.click(x, y)
        page.wait_for_timeout(500)
        pts = page.evaluate("(() => { const a = window.formvis.engine.current.activeLayer.adjustment; const c = (a.data || a).curves; return c.channels.slice(1, 4).map((ch) => ch.map((p) => [p.x, p.y])); })()")
        for ch, level in zip(pts, (100, 110, 120)):
            assert [level, want_y] in ch, (mode, pts)
        page.keyboard.press("Escape")
        page.wait_for_timeout(300)
        page.locator(f"{D}-foot button", has_text="OK").last.click(timeout=2000) if page.locator(f"{D}-foot button", has_text="OK").count() else None
        page.wait_for_timeout(300)
