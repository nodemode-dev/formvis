# Home > Start > Demos and Help > Demos open the three repository demos in the real window as new, unsaved documents.
HOME = "(() => { const h = document.querySelector('.cv-home'); return !!h && !h.hidden; })()"
DEMOS = {
    "paint": ["dawn-over-the-range", "above-the-clouds", "oeschinensee-lake", "autumn-larches", "ocean-waves", "desert-dunes", "snowy-mountain"],
    "retouch": ["golden-portrait", "golden-chain"],
    "design": ["lantern-night-kit"],
}
NAMES = "window.formvis.engine.projects.map((p) => p.name)"


def test_each_demo_opens_from_start_as_new_documents(page):
    page.evaluate("window.formvis.engine.newDocument(64, 48, 'mine', 'white')")
    for demo, names in DEMOS.items():
        page.locator(".cv-brand").click()
        assert page.evaluate(HOME)
        card = page.locator(f'[data-demo-open="{demo}"]')
        assert card.count() == 1 and card.locator("img").count() == 1
        card.click()
        page.wait_for_function(f"!document.querySelector('[data-demo-open=\"{demo}\"]').matches('[aria-busy=\"true\"]') && {NAMES}.includes('{names[0]}')", timeout=120000)
        page.wait_for_function(f"!({HOME})", timeout=10000)
        opened = page.evaluate(NAMES)
        for n in names:
            assert n in opened
        assert "mine" in opened                                   # nothing of the person's was replaced
        assert page.evaluate("window.formvis.engine.current.name") == names[0]


def test_help_menu_lists_the_demos_and_opens_one(page):
    items = page.evaluate("window.formvis.commands.all().filter((c) => c.id.startsWith('demo-')).map((c) => c.id)")
    assert {"demo-paint", "demo-retouch", "demo-design", "demo-open"} <= set(items)
    page.locator(".cv-menubar .cv-menu-btn", has_text="Help").first.click()
    page.locator(".cv-menu:not([hidden]) .cv-menu-item.cv-menu-sub", has_text="Demos").first.hover()
    page.locator(".cv-menu:not([hidden]) .cv-menu-item", has_text="Selections and retouching").first.click()
    page.wait_for_function(f"{NAMES}.includes('golden-chain') && !({HOME})", timeout=120000)
    assert page.evaluate("window.formvis.engine.current.name") == "golden-portrait"
