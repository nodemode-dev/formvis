DLG = ".cv-scrim:not([hidden]) .cv-dialog"

SEEN = """() => { const r = document.documentElement, st = document.querySelector('.cv-stage'), m = document.querySelector('.cv-menu-btn');
  const p = JSON.parse(localStorage.getItem('formvis.prefs') || '{}');
  return { stage: getComputedStyle(st).backgroundColor, menuFont: getComputedStyle(m).fontSize, menuText: m.textContent.trim(),
    lang: r.lang, accent: getComputedStyle(r).getPropertyValue('--accent-color').trim(), prefs: { ui: p.uiFontSize, border: p.canvasBorder, lang: p.language } }; }"""


def pick(page, label, value):
    page.locator(f"{DLG} label", has_text=label).locator("select").first.select_option(value)


def open_interface(page):
    page.evaluate("window.formvis.commands.run('settings')")
    page.locator(f"{DLG} .cv-prefs-railtab", has_text="Interface").click()
    page.locator(f"{DLG} label", has_text="Canvas Color").wait_for()


def reload(page):
    page.reload()
    page.wait_for_function("window.formvis && window.formvis.engine")
    page.wait_for_timeout(500)


def test_interface_preferences_change_the_app_in_the_settings_window_and_are_kept_after_a_reload(page):
    try:
        page.evaluate("window.formvis.engine.newDocument(400, 300, 'I', 'white')")
        before = page.evaluate(SEEN)
        open_interface(page)
        pick(page, "Canvas Color", "black")
        pick(page, "Canvas Border", "shadow")
        pick(page, "Interface Text Size", "larger")
        page.wait_for_timeout(400)
        now = page.evaluate(SEEN)
        assert now["stage"] == "rgb(0, 0, 0)" and now["stage"] != before["stage"], (before, now)
        assert float(now["menuFont"][:-2]) > float(before["menuFont"][:-2]), (before, now)
        assert now["prefs"] == {"ui": "larger", "border": "shadow", "lang": "en"}, now
        page.keyboard.press("Escape")
        reload(page)
        kept = page.evaluate(SEEN)
        assert kept["stage"] == "rgb(0, 0, 0)" and kept["menuFont"] == now["menuFont"] and kept["prefs"] == now["prefs"], (now, kept)
        page.evaluate("window.formvis.engine.newDocument(400, 300, 'I', 'white')")
        open_interface(page)
        sel = page.evaluate(f"""(() => {{ const v = (t) => [...document.querySelectorAll('{DLG} label')].find((l) => l.textContent.includes(t)).querySelector('select').value;
          return [v('Canvas Color'), v('Canvas Border'), v('Interface Text Size')]; }})()""")
        assert sel == ["black", "shadow", "larger"], sel
        page.keyboard.press("Escape")
    finally:
        page.evaluate("for (const k of Object.keys(localStorage)) if (k.startsWith('formvis.')) localStorage.removeItem(k)")
        reload(page)


def test_the_language_choice_translates_the_menu_bar_and_is_kept_after_a_reload(page):
    try:
        page.evaluate("window.formvis.engine.newDocument(400, 300, 'L', 'white')")
        before = page.evaluate(SEEN)
        open_interface(page)
        pick(page, "Language", "de")
        page.wait_for_timeout(1500)
        page.keyboard.press("Escape")
        page.wait_for_timeout(300)
        after = page.evaluate(SEEN)
        assert after["menuText"] != before["menuText"] and after["prefs"]["lang"] == "de", (before, after)
        reload(page)
        assert page.evaluate(SEEN)["menuText"] == after["menuText"]
    finally:
        page.evaluate("for (const k of Object.keys(localStorage)) if (k.startsWith('formvis.')) localStorage.removeItem(k)")
        reload(page)
