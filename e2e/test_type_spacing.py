SETUP = "const T = await import('/src/engine/text.ts'); const base = { ...T.defaultText(), content: 'AVATAR WAVE', size: 40 };"


def test_tracking_adds_exactly_its_thousandths_of_an_em_per_character(page):
    r = page.evaluate("""async () => { %s
      const w = (o) => T.renderText({ ...base, family: 'sans-serif', ...o }).raster.width;
      return { w0: w({}), w200: w({ tracking: 200 }), wneg: w({ tracking: -50 }) }; }""" % SETUP)
    assert r["w200"] - r["w0"] == round(0.2 * 40 * 11), r        # 11 characters, 0.2 em each at 40 px
    assert r["w0"] - r["wneg"] == round(0.05 * 40 * 11), r


def test_kerning_zero_turns_off_the_fonts_pair_kerning(page):
    r = page.evaluate("""async () => { %s
      const w = (o) => T.renderText({ ...base, family: 'serif', ...o }).raster.width;
      return { metrics: w({}), none: w({ kerning: 'none' }) }; }""" % SETUP)
    assert r["none"] > r["metrics"], r                             # AV, VA, TA, WA: no longer tightened


def test_saved_text_reads_back_tracking_and_kerning_with_defaults_for_older_projects(page):
    r = page.evaluate("""async () => { const T = await import('/src/engine/text.ts'), E = await import('/src/engine/index.ts'), ras = new E.Raster(4, 4);
      return { old: T.textFromData({ content: 'Hi' }, ras), now: T.textFromData({ content: 'Hi', tracking: 99999, kerning: 'none' }, ras) }; }""")
    assert r["old"]["tracking"] == 0 and r["old"]["kerning"] == "metrics"
    assert r["now"]["tracking"] == 10000 and r["now"]["kerning"] == "none"      # clamped to the range


def test_the_font_menu_offers_this_machines_fonts_and_the_system_list(page):
    r = page.evaluate("""async () => {
      const F = await import('/src/ui/fonts.ts'), before = F.fontFamilies();
      window.queryLocalFonts = async () => [{ family: 'Zz Test Grotesk' }, { family: 'Zz Test Grotesk' }, { family: 'Zz Test Serif' }];
      const got = await F.loadSystemFonts();
      return { defaults: before.slice(0, 3), more: before.length > 12, got, after: F.fontFamilies() }; }""")
    assert r["defaults"] == ["Inter", "Lato", "Montserrat"] and r["more"], r
    assert r["got"] == ["Zz Test Grotesk", "Zz Test Serif"], r             # families once each
    assert "Zz Test Grotesk" in r["after"] and "Zz Test Serif" in r["after"], r


def test_the_type_options_show_tracking_and_kerning(page):
    page.evaluate("window.formvis.engine.newDocument(200, 120, 'T', 'white'); window.formvis.engine.setTool('type')")
    bar = page.locator(".cv-opt-group:not([hidden]), .cv-opt-pop")
    for label in ("Font", "Tracking", "Kerning"):
        assert bar.get_by_text(label, exact=True).count() >= 1, label
    page.evaluate("window.formvis.engine.textSettings = { ...window.formvis.engine.textSettings, tracking: 0 }")


def test_edit_type_keeps_a_font_outside_the_list_and_the_spacing(page):
    # Before 1.29.0 the dialog reset any font outside its fixed list to Inter each time it opened.
    page.evaluate("""async () => { const T = await import('/src/engine/text.ts'), e = window.formvis.engine;
      e.newDocument(300, 160, 'T', 'white');
      await e.createTextLayer({ x: 20, y: 80 }, { ...T.defaultText(), content: 'Kept', family: 'DejaVu Serif', size: 40, tracking: 150, kerning: 'none' }); }""")
    assert page.evaluate("window.formvis.commands.run('edit-text')")
    dlg = page.locator(".cv-scrim:not([hidden]) .cv-dialog")
    assert dlg.locator("select").first.input_value() == "DejaVu Serif"
    dlg.locator(".cv-dialog-foot button", has_text="OK").click()
    page.wait_for_function("!document.querySelector('.cv-scrim:not([hidden]) .cv-dialog')")
    t = page.evaluate("(() => { const t = window.formvis.engine.current.activeLayer.text; return { family: t.family, tracking: t.tracking, kerning: t.kerning }; })()")
    assert t == {"family": "DejaVu Serif", "tracking": 150, "kerning": "none"}, t
