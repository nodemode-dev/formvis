DLG = ".cv-scrim:not([hidden]) .cv-dialog"

COLOURS = """() => {
  const probe = document.createElement('i'); probe.style.color = 'var(--accent-color)'; document.body.appendChild(probe);
  const accent = getComputedStyle(probe).color; probe.remove();
  const col = (e) => getComputedStyle(e).color, q = (s) => [...document.querySelectorAll(`.cv-scrim:not([hidden]) .cv-dialog ${s}`)];
  const active = q('.cv-prefs-railtab.is-active .cv-prefs-tabicon');
  return { accent,
    rail: q('.cv-prefs-railtab:not(.is-active) .cv-prefs-tabicon').map(col),
    active: active.map(col),
    sections: q('.cv-prefs-secicon').map(col),
    labels: q('.cv-prefs-label').map(col),
    railNames: q('.cv-prefs-railtab').length };
}"""


def open_settings(page):
    page.evaluate("window.formvis.engine.newDocument(400, 300, 'P', 'white')")
    page.evaluate("window.formvis.commands.run('settings')")
    page.locator(f"{DLG} .cv-prefs-railtab").first.wait_for()


def test_settings_icons_and_group_labels_use_the_accent_and_the_active_tab_icon_does_not(page):
    try:
        open_settings(page)
        c = page.evaluate(COLOURS)
        assert c["railNames"] >= 10 and len(c["rail"]) == c["railNames"] - 1, c
        assert c["sections"] and c["labels"], c
        assert set(c["rail"]) == {c["accent"]}, c
        assert set(c["sections"]) == {c["accent"]}, c
        assert set(c["labels"]) == {c["accent"]}, c
        assert len(c["active"]) == 1 and c["active"][0] != c["accent"], c
        page.locator(f"{DLG} .cv-prefs-railtab", has_text="Tools").click()
        page.wait_for_timeout(300)
        d = page.evaluate(COLOURS)
        assert set(d["rail"]) == {d["accent"]}, d
        assert d["active"][0] != d["accent"], d
        assert set(d["labels"]) == {d["accent"]}, d
    finally:
        page.keyboard.press("Escape")


def test_a_new_accent_recolours_the_icons_and_labels_and_is_kept_after_a_reload(page):
    try:
        open_settings(page)
        page.locator(f"{DLG} .cv-prefs-railtab", has_text="Interface").click()
        page.evaluate("""(() => { const i = document.querySelector('.cv-scrim:not([hidden]) .cv-dialog input[type=color]');
          i.value = '#22aa55'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); })()""")
        page.wait_for_timeout(300)
        c = page.evaluate(COLOURS)
        assert c["accent"] == "rgb(34, 170, 85)", c
        assert set(c["rail"]) == {c["accent"]} and set(c["sections"]) == {c["accent"]} and set(c["labels"]) == {c["accent"]}, c
        assert c["active"][0] != c["accent"], c
        page.keyboard.press("Escape")
        page.reload()
        page.wait_for_function("window.formvis && window.formvis.engine")
        assert page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim()") == "#22aa55"
        open_settings(page)
        c = page.evaluate(COLOURS)
        assert set(c["rail"]) == {c["accent"] == "rgb(34, 170, 85)" and c["accent"]}, c
    finally:
        page.evaluate("for (const k of Object.keys(localStorage)) if (k.startsWith('formvis.')) localStorage.removeItem(k)")
        page.reload()
        page.wait_for_function("window.formvis && window.formvis.engine")
