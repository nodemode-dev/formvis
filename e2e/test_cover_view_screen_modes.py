import pytest

LAYOUT = """() => { const box = (s) => { const e = document.querySelector(s); if (!e || e.hidden || getComputedStyle(e).display === 'none') return null;
    const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; };
  return { rail: box('.cv-rail'), options: box('.cv-options'), menu: box('.cv-menubar'), title: box('.cv-titlebar'), tabs: box('.cv-doc-tabs'),
    stage: box('.cv-stage'), app: document.querySelector('.cv-app').className, full: !!document.fullscreenElement }; }"""


def layout(page):
    page.wait_for_timeout(450)
    return page.evaluate(LAYOUT)


def start(page):
    page.evaluate("window.formvis.engine.newDocument(400, 300, 'S', 'white')")
    page.locator(".cv-stage").click(position={"x": 5, "y": 5})
    page.evaluate("document.activeElement && document.activeElement.blur && document.activeElement.blur()")
    return layout(page)


def test_tab_hides_and_shows_the_tool_and_options_panels_and_the_picture_area_follows(page):
    base = start(page)
    assert base["rail"] and base["options"], base
    page.keyboard.press("Tab")
    hidden = layout(page)
    assert hidden["rail"] is None and hidden["options"] is None, hidden
    assert hidden["stage"]["w"] > base["stage"]["w"] and hidden["stage"]["h"] > base["stage"]["h"], (base, hidden)
    assert hidden["menu"] and hidden["title"], hidden
    page.keyboard.press("Tab")
    back = layout(page)
    assert back["rail"] and back["options"] and back["stage"] == base["stage"], (base, back)


def test_the_f_key_steps_standard_to_menu_only_to_full_screen_and_back(page):
    try:
        base = start(page)
        assert "is-screen-menu" not in base["app"] and "is-screen-full" not in base["app"] and base["tabs"], base
        page.keyboard.press("f")
        menu = layout(page)
        assert "is-screen-menu" in menu["app"] and menu["tabs"] is None and menu["menu"] and menu["title"], menu
        assert menu["stage"]["h"] > base["stage"]["h"], (base, menu)
        page.keyboard.press("f")
        full = layout(page)
        assert "is-screen-full" in full["app"] and not (full["menu"] or {}).get("h") and full["title"] is None and not (full["tabs"] or {}).get("h"), full
        assert full["full"] is True, full
        page.evaluate("window.formvis.commands.run('screen-standard')")
        std = layout(page)
        assert "is-screen-menu" not in std["app"] and "is-screen-full" not in std["app"] and std["tabs"] and std["menu"] and std["title"], std
        assert std["stage"] == base["stage"], (base, std)
    finally:
        page.evaluate("window.formvis.commands.run('screen-standard')")


def test_full_screen_mode_leaves_the_picture_area_on_screen(page):
    try:
        start(page)
        page.evaluate("window.formvis.commands.run('screen-full')")
        full = layout(page)
        assert full["stage"] and full["stage"]["h"] > 400, full
    finally:
        page.evaluate("window.formvis.commands.run('screen-standard')")
