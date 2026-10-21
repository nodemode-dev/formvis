def test_a_defined_pattern_can_be_given_a_group_that_shows_as_a_heading_in_the_patterns_panel(page):
    page.evaluate("""async () => { const e = window.formvis.engine, E = await import('/src/engine/index.ts'); e.newDocument(60, 60, 'Pat', 'white'); e.fg = { r: 0, g: 0, b: 255 };
      e.applySelection(E.SelectionMask.cropped(0, 0, 16, 16, new Uint8Array(256).fill(255)), 'replace', 's'); e.fill('fg');
      await window.formvis.commands.run('define-pattern'); }""")
    page.wait_for_timeout(800)
    dialog = page.locator(".cv-scrim:not([hidden]) .cv-dialog")
    if dialog.count():
        dialog.last.locator(".cv-dialog-foot button", has_text="OK").last.click()
        page.wait_for_timeout(500)
    page.evaluate("window.formvis.commands.run('panel-patterns')")
    page.wait_for_timeout(800)
    section = page.locator(".cv-preset-group:visible").first
    items = page.evaluate("[...document.querySelectorAll('[data-pattern], .cv-preset-item, .cv-sw')].length")
    custom = page.evaluate("() => import('/src/engine/patterns.ts').then((m) => m.allPatterns().filter((p) => !p.builtin).map((p) => p.id))")
    assert len(custom) == 1
    page.evaluate("(id) => { const b = [...document.querySelectorAll('button, [role=option], .cv-sw')].find((n) => n.dataset && (n.dataset.id === id || n.dataset.pattern === id)); if (b) b.click(); }", custom[0])
    page.wait_for_timeout(300)
    box = page.locator('input[aria-label="Group of the selected item"]:visible').first
    box.wait_for(timeout=3000)
    box.fill("Stripes")
    box.press("Enter")
    page.wait_for_timeout(500)
    assert page.evaluate("() => import('/src/engine/patterns.ts').then((m) => m.allPatterns().filter((p) => !p.builtin).map((p) => p.group))") == ["Stripes"]
    assert page.locator(".cv-sw-group", has_text="Stripes").count() >= 1
