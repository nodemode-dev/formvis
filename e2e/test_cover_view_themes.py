TOKENS = """() => { const r = document.documentElement, cs = getComputedStyle(r);
  return { mode: r.dataset.theme, bg: cs.getPropertyValue('--bg-primary').trim(), body: getComputedStyle(document.body).backgroundColor }; }"""

DARK = ["studio", "nodemode-dark", "github-dark", "midnight", "forest", "ember", "violet", "slate", "mono", "ocean", "rose",
        "terminal", "contrast", "pro-dark", "pro-medium-grey", "solarized-dark", "adwaita-dark", "breeze-dark", "soft-dark"]
LIGHT = ["light", "sand", "nineties", "duck", "pro-light-grey", "pro-light", "classic", "adwaita-light", "soft-light"]


def settle(page):
    page.wait_for_timeout(250)


def test_every_theme_command_repaints_the_interface_in_its_own_mode(page):
    seen = {}
    try:
        for name in DARK + LIGHT:
            page.evaluate(f"window.formvis.commands.run('theme-{name}')")
            settle(page)
            t = page.evaluate(TOKENS)
            assert t["mode"] == ("dark" if name in DARK else "light"), (name, t)
            assert t["body"].startswith("rgb(") and t["bg"], (name, t)
            seen[name] = t["bg"]
        assert len(set(seen.values())) >= 24, seen
        assert seen["terminal"] != seen["sand"] and seen["contrast"] == "#000000", seen
    finally:
        page.evaluate("for (const k of Object.keys(localStorage)) if (k.startsWith('formvis.')) localStorage.removeItem(k)")
        page.reload()
        page.wait_for_function("window.formvis && window.formvis.engine")


def test_a_theme_chosen_in_the_window_menu_is_applied_and_kept_after_a_reload(page):
    try:
        page.evaluate("window.formvis.engine.newDocument(300, 200, 'T', 'white')")
        before = page.evaluate(TOKENS)
        page.locator(".cv-menu-btn", has_text="Window").click()
        page.locator(".cv-menu:not([hidden]) .cv-menu-sub", has_text="Theme").hover()
        page.locator(".cv-menu:not([hidden]) .cv-menu-item", has_text="Theme: Soft Light").click()
        settle(page)
        after = page.evaluate(TOKENS)
        assert after["mode"] == "light" and after["bg"] != before["bg"], (before, after)
        page.reload()
        page.wait_for_function("window.formvis && window.formvis.engine")
        settle(page)
        assert page.evaluate(TOKENS) == after
        page.evaluate("window.formvis.commands.run('theme-terminal')")
        settle(page)
        assert page.evaluate(TOKENS)["bg"] != after["bg"]
        page.reload()
        page.wait_for_function("window.formvis && window.formvis.engine")
        settle(page)
        assert page.evaluate(TOKENS)["mode"] == "dark"
    finally:
        page.evaluate("for (const k of Object.keys(localStorage)) if (k.startsWith('formvis.')) localStorage.removeItem(k)")
        page.reload()
        page.wait_for_function("window.formvis && window.formvis.engine")
