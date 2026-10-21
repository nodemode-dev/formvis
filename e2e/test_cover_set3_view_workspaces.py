import json

ORDER = "[...document.querySelectorAll('.cv-layers > section')].filter((s) => !s.hidden).map((s) => s.className.split(' ')[0].replace('cv-', ''))"
DLG = ".cv-scrim:not([hidden]) .cv-dialog"
KEYS = ["formvis.workspace", "formvis.customWorkspaces", "formvis.dock", "formvis.dock.heights", "formvis.dock.floats", "formvis.dockCollapsed"]


def reload(page):
    page.reload()
    page.wait_for_function("window.formvis && window.formvis.engine")
    page.wait_for_timeout(700)


def wipe(page):
    page.evaluate("(keys) => { for (const k of keys) localStorage.removeItem(k); }", KEYS)
    reload(page)


def choose(page, label):
    page.locator(".cv-title-tools .cv-dd-btn").click()
    page.locator(".cv-dd-pop:not([hidden]) .cv-dd-item", has_text=label).click()
    page.wait_for_timeout(500)


def current(page):
    return page.locator(".cv-title-tools .cv-dd-btn").inner_text().strip()


def test_switching_workspace_rearranges_the_panels_and_the_choice_is_kept_after_a_reload(page):
    wipe(page)
    try:
        essentials = page.evaluate(ORDER)
        assert "swatches" in essentials
        choose(page, "Photography")
        photo = page.evaluate(ORDER)
        assert "swatches" not in photo and photo != essentials
        assert page.evaluate("localStorage.getItem('formvis.workspace')") == "photography"
        reload(page)
        assert page.evaluate(ORDER) == photo
        assert "Photography" in current(page)
        choose(page, "Essentials")
        assert page.evaluate(ORDER) == essentials
    finally:
        wipe(page)


def test_new_workspace_saves_the_arrangement_under_a_name_and_choosing_it_brings_it_back(page):
    wipe(page)
    try:
        choose(page, "Photography")
        photo = page.evaluate(ORDER)
        page.evaluate("window.formvis.commands.run('new-workspace')")
        page.wait_for_timeout(400)
        field = page.locator(f"{DLG} input").first
        field.fill("Mine")
        field.press("Enter")
        page.wait_for_timeout(500)
        saved = json.loads(page.evaluate("localStorage.getItem('formvis.customWorkspaces') || '[]'"))
        assert [w["label"] for w in saved] == ["Mine"]
        assert "Mine" in current(page)
        choose(page, "Essentials")
        assert page.evaluate(ORDER) != photo
        choose(page, "Mine")
        assert page.evaluate(ORDER) == photo
        reload(page)
        assert "Mine" in current(page)
    finally:
        wipe(page)


def test_reset_panels_puts_the_dock_back_to_how_formvis_comes(page):
    wipe(page)
    try:
        default = page.evaluate(ORDER)
        choose(page, "Painting")
        assert page.evaluate(ORDER) != default
        page.evaluate("window.formvis.commands.run('reset-panels')")
        page.wait_for_timeout(600)
        assert page.evaluate(ORDER) == default
        reload(page)
        assert page.evaluate(ORDER) == default
    finally:
        wipe(page)
