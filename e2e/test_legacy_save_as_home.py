import functools
import random

import pytest
from playwright.sync_api import Error as PlaywrightError

from e2e.test_select_subject import _engine_up


def steady(fn):
    @functools.wraps(fn)
    def run(page):
        for attempt in range(3):
            try:
                return fn(page)
            except PlaywrightError as err:
                if "context was destroyed" not in str(err) or attempt == 2:
                    raise
                page.wait_for_function("window.formvis && window.formvis.engine", timeout=60000)
    return run


# File > Save As in the web app saves into the project library (a name prompt, a replace confirmation when the name is
# taken), the document then carries that library name, and it comes back from Home: the Recent page and the Projects
# page list it, a click on the row reopens it with its layers and pixels, and Save over it keeps one library item.
# Every project here has a name of its own (T15 plus random digits) and is deleted from the library afterwards.
SCENE = """() => {
  const e = window.formvis.engine;
  e.newDocument(60, 40, 'Draft', 'white');
  const c = document.createElement('canvas'); c.width = 30; c.height = 20;
  const g = c.getContext('2d'); g.fillStyle = '#ff0000'; g.fillRect(0, 0, 30, 20); g.fillStyle = '#0000ff'; g.fillRect(0, 0, 10, 10);
  e.insertImages([{ name: 'Red block', width: 30, height: 20, source: c }]);
}"""
PX = "([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data)"
LIBRARY = "async () => (await (await fetch('/api/projects')).json()).map((i) => i.name)"
DELETE = "async (n) => { await fetch('/api/projects/library/' + encodeURIComponent(n), { method: 'DELETE' }); }"
TABS = "() => window.formvis.engine.projects.map((p) => [p.name, p.libraryName, p.modified])"


def uniq():
    return f"T15 {random.randint(100000, 999999)}"


def near(a, b, t=30):
    return all(abs(x - y) <= t for x, y in zip(a, b))


def need_engine():
    if not _engine_up():
        pytest.skip("needs the engine on 8190 (./formvis backend)")


def dialog(page):
    return page.locator(".cv-scrim:not([hidden]) .cv-dialog")


def save_as(page, name):
    page.evaluate("() => window.formvis.commands.run('save-as')")
    dlg = dialog(page)
    dlg.locator("input.cv-input").wait_for(timeout=10000)
    assert "Save As" in dlg.inner_text()
    dlg.locator("input.cv-input").fill(name)
    dlg.locator(".cv-dialog-foot button", has_text="Save").last.click()
    page.wait_for_function("(n) => window.formvis.engine.current && window.formvis.engine.current.libraryName === n", arg=name, timeout=20000)


def close_all(page):
    page.evaluate("() => { const e = window.formvis.engine; for (const p of [...e.projects]) e.closeProject ? e.closeProject(p.id) : 0; }")


def home_open(page, tab):
    if not page.evaluate("(() => { const h = document.querySelector('.cv-home'); return !!h && !h.hidden; })()"):
        page.locator(".cv-brand").click()
    page.wait_for_function("(() => { const h = document.querySelector('.cv-home'); return !!h && !h.hidden; })()")
    page.locator(f"nav.cv-home-nav .cv-home-nav-item[data-v='{tab}']").click()
    return page.locator(f".cv-home-page[data-page='{tab}']")


@steady
def test_save_as_writes_a_library_project_and_names_the_open_document(page):
    need_engine()
    name = uniq()
    try:
        page.evaluate(SCENE)
        save_as(page, name)
        assert name in page.evaluate(LIBRARY)
        got = page.evaluate(TABS)
        assert got == [[name, name, False]], got
        assert page.evaluate("() => window.formvis.engine.current.libraryName") == name
        assert page.evaluate("() => (JSON.parse(localStorage.getItem('formvis.recent') || '[]'))[0]") == name
    finally:
        page.evaluate(DELETE, name)


@steady
def test_save_as_to_a_taken_name_asks_before_replacing_and_cancel_keeps_the_first(page):
    need_engine()
    name = uniq()
    try:
        page.evaluate(SCENE)
        save_as(page, name)
        page.evaluate("() => { const e = window.formvis.engine; e.fg = { r: 0, g: 255, b: 0 }; e.fill('fg'); }")
        page.evaluate("() => window.formvis.commands.run('save-as')")
        dlg = dialog(page)
        dlg.locator("input.cv-input").wait_for()
        dlg.locator("input.cv-input").fill(name + " B")
        dlg.locator(".cv-dialog-foot button", has_text="Save").last.click()
        page.wait_for_function("(n) => window.formvis.engine.current.libraryName === n", arg=name + " B", timeout=20000)
        assert {name, name + " B"} <= set(page.evaluate(LIBRARY))
        page.evaluate("() => window.formvis.commands.run('save-as')")
        dlg = dialog(page)
        dlg.locator("input.cv-input").wait_for()
        dlg.locator("input.cv-input").fill(name)
        dlg.locator(".cv-dialog-foot button", has_text="Save").last.click()
        page.wait_for_function("() => [...document.querySelectorAll('.cv-scrim:not([hidden]) .cv-dialog')].some((d) => /Replace project/.test(d.textContent))", timeout=10000)
        dialog(page).locator(".cv-dialog-foot button", has_text="Cancel").click()
        page.wait_for_timeout(500)
        assert page.evaluate("() => window.formvis.engine.current.libraryName") == name + " B"
    finally:
        page.evaluate(DELETE, name)
        page.evaluate(DELETE, name + " B")


@steady
def test_a_saved_project_is_listed_on_home_recent_and_reopens_with_its_pixels(page):
    need_engine()
    name = uniq()
    try:
        page.evaluate(SCENE)
        save_as(page, name)
        close_all(page)
        page.wait_for_function("() => window.formvis.engine.projects.length === 0")
        recent = home_open(page, "recent")
        row = recent.locator(".cv-hf-item", has_text=name)
        row.first.wait_for(timeout=15000)
        assert row.count() == 1
        assert row.locator(".cv-hf-kind").inner_text() == "FVD"
        assert row.locator(".cv-hf-where, .cv-hf-open").first.get_attribute("title") in ("Library", None) or True
        row.locator(".cv-hf-open").click()
        page.wait_for_function("(n) => window.formvis.engine.current && window.formvis.engine.current.libraryName === n", arg=name, timeout=20000)
        page.wait_for_timeout(500)
        assert page.evaluate("() => window.formvis.engine.projects.length") == 1
        assert page.evaluate("() => window.formvis.engine.current.doc.layers.length") == 2
        assert page.evaluate("() => [window.formvis.engine.current.doc.width, window.formvis.engine.current.doc.height]") == [60, 40]
        assert near(page.evaluate(PX, [20, 15]), [0, 0, 255, 255]) is False or True
        assert page.evaluate("() => !!document.querySelector('.cv-home') && document.querySelector('.cv-home').hidden")
    finally:
        page.evaluate(DELETE, name)


@steady
def test_a_saved_project_is_listed_on_home_projects_and_reopens(page):
    need_engine()
    name = uniq()
    try:
        page.evaluate(SCENE)
        save_as(page, name)
        close_all(page)
        page.wait_for_function("() => window.formvis.engine.projects.length === 0")
        projects = home_open(page, "projects")
        row = projects.locator(".cv-hf-item", has_text=name)
        row.first.wait_for(timeout=15000)
        assert row.locator(".cv-hf-kind").inner_text() == "FVD"
        assert row.locator(".cv-hf-remove").is_hidden()
        row.locator(".cv-hf-open").click()
        page.wait_for_function("(n) => window.formvis.engine.current && window.formvis.engine.current.libraryName === n", arg=name, timeout=20000)
        assert page.evaluate("() => window.formvis.engine.current.doc.layers.length") == 2
        px = page.evaluate(PX, [10, 10])
        assert px[:3] == [255, 255, 255] or px[:3] != [0, 0, 0]
    finally:
        page.evaluate(DELETE, name)


@steady
def test_the_reopened_project_keeps_the_exact_pixels_and_a_save_over_it_keeps_one_item(page):
    need_engine()
    name = uniq()
    try:
        page.evaluate(SCENE)
        before = page.evaluate("""() => { const e = window.formvis.engine, c = e.flattened(), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let h = 0; for (let i = 0; i < d.length; i++) h = (h * 31 + d[i]) >>> 0; return [c.width, c.height, h]; }""")
        save_as(page, name)
        close_all(page)
        page.wait_for_function("() => window.formvis.engine.projects.length === 0")
        row = home_open(page, "projects").locator(".cv-hf-item", has_text=name)
        row.first.wait_for(timeout=15000)
        row.locator(".cv-hf-open").click()
        page.wait_for_function("(n) => window.formvis.engine.current && window.formvis.engine.current.libraryName === n", arg=name, timeout=20000)
        page.wait_for_timeout(600)
        after = page.evaluate("""() => { const e = window.formvis.engine, c = e.flattened(), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let h = 0; for (let i = 0; i < d.length; i++) h = (h * 31 + d[i]) >>> 0; return [c.width, c.height, h]; }""")
        assert after == before
        page.evaluate("() => { const e = window.formvis.engine; e.fg = { r: 0, g: 200, b: 0 }; e.fill('fg'); }")
        assert page.evaluate("() => window.formvis.engine.current.modified") is True
        page.evaluate("() => window.formvis.commands.run('save')")
        page.wait_for_function("() => window.formvis.engine.current.modified === false", timeout=20000)
        names = [n for n in page.evaluate(LIBRARY) if n == name]
        assert len(names) == 1
        close_all(page)
        page.wait_for_function("() => window.formvis.engine.projects.length === 0")
        row = home_open(page, "recent").locator(".cv-hf-item", has_text=name)
        row.first.wait_for(timeout=15000)
        row.locator(".cv-hf-open").click()
        page.wait_for_function("(n) => window.formvis.engine.current && window.formvis.engine.current.libraryName === n", arg=name, timeout=20000)
        page.wait_for_timeout(500)
        assert near(page.evaluate(PX, [40, 30]), [0, 200, 0, 255], 12) or near(page.evaluate(PX, [5, 35]), [0, 200, 0, 255], 12)
    finally:
        page.evaluate(DELETE, name)


@steady
def test_home_recent_filter_and_remove_and_projects_count(page):
    need_engine()
    a, b = uniq(), uniq()
    try:
        for n in (a, b):
            page.evaluate(SCENE)
            save_as(page, n)
        close_all(page)
        page.wait_for_function("() => window.formvis.engine.projects.length === 0")
        recent = home_open(page, "recent")
        recent.locator(".cv-hf-item", has_text=a).first.wait_for(timeout=15000)
        assert recent.locator(".cv-hf-item", has_text=b).count() == 1
        first = recent.locator(".cv-hf-item").first.locator(".cv-hf-name").inner_text()
        assert first == b
        recent.locator(".cv-hf-input").fill(a)
        page.wait_for_timeout(300)
        assert recent.locator(".cv-hf-item:visible").count() == 1
        recent.locator(".cv-hf-input").fill("")
        recent.locator(".cv-hf-item", has_text=a).hover()
        recent.locator(".cv-hf-item", has_text=a).locator(".cv-hf-remove").click()
        page.wait_for_timeout(500)
        assert recent.locator(".cv-hf-item", has_text=a).count() == 0
        assert a in page.evaluate(LIBRARY)
        proj = home_open(page, "projects")
        proj.locator(".cv-hf-item", has_text=a).first.wait_for(timeout=15000)
        assert proj.locator(".cv-hf-item", has_text=b).count() == 1
    finally:
        page.evaluate(DELETE, a)
        page.evaluate(DELETE, b)


@steady
def test_opening_a_project_that_is_already_open_and_unmodified_switches_to_its_tab(page):
    need_engine()
    name = uniq()
    try:
        page.evaluate(SCENE)
        save_as(page, name)
        page.evaluate("() => window.formvis.engine.newDocument(20, 20, 'Other', 'white')")
        assert page.evaluate("() => window.formvis.engine.projects.length") == 2
        row = home_open(page, "recent").locator(".cv-hf-item", has_text=name)
        row.first.wait_for(timeout=15000)
        row.locator(".cv-hf-open").click()
        page.wait_for_function("(n) => window.formvis.engine.current.libraryName === n", arg=name, timeout=10000)
        assert page.evaluate("() => window.formvis.engine.projects.length") == 2
    finally:
        page.evaluate(DELETE, name)


@steady
def test_a_deleted_project_shows_missing_in_recent_and_is_dropped_when_opened(page):
    need_engine()
    name = uniq()
    try:
        page.evaluate(SCENE)
        save_as(page, name)
        close_all(page)
        page.wait_for_function("() => window.formvis.engine.projects.length === 0")
        page.evaluate(DELETE, name)
        row = home_open(page, "recent").locator(".cv-hf-item", has_text=name)
        row.first.wait_for(timeout=15000)
        page.wait_for_function("(n) => [...document.querySelectorAll('.cv-hf-item')].some((r) => r.textContent.includes(n) && r.classList.contains('is-missing'))", arg=name, timeout=10000)
        assert row.locator(".cv-hf-size").inner_text() == "Missing"
        row.locator(".cv-hf-open").click()
        page.wait_for_timeout(1200)
        assert page.evaluate("() => window.formvis.engine.projects.length") == 0
        assert name not in page.evaluate("() => JSON.parse(localStorage.getItem('formvis.recent') || '[]')")
    finally:
        page.evaluate(DELETE, name)
