import re

URL_LOAD = "window.formvis && window.formvis.engine"
ANCHORS = "(() => { const w = window.formvis.engine.workPath; return w ? w.subpaths.map(s => s.anchors.length) : null; })()"
KEPT = """new Promise(r => { const q = indexedDB.open('formvis-recovery'); q.onsuccess = () => { const db = q.result; if (!db.objectStoreNames.contains('docs')) { db.close(); r(0); return; }
  const g = db.transaction('docs').objectStore('docs').getAll(); g.onsuccess = () => { db.close(); r(g.result.filter(x => x.name === 'EARLY').length); }; }; })"""


def scr(page, x, y):
    return page.evaluate("([x, y]) => { const v = window.formvis.engine.current.viewport, s = document.querySelector('.cv-stage').getBoundingClientRect(), q = v.toScreen(x, y); return [s.left + q.x, s.top + q.y]; }", [x, y])


def menu(page, *path):
    page.locator(".cv-menu-btn", has_text=path[0]).first.click()
    for i, label in enumerate(path[1:]):
        item = page.locator(".cv-menu:not([hidden]) > *", has_text=re.compile("^" + re.escape(label) + "(?![A-Za-z ])")).first
        item.hover() if i < len(path) - 2 else item.click()


def test_ctrl_z_takes_back_the_pending_pen_point_before_any_history_step(page):
    # PC-UI-0053
    page.evaluate("const e = window.formvis.engine; e.newDocument(200, 120, 'PEN', 'white'); e.setTool('pen')")
    for xy in ((30, 30), (100, 30), (100, 90)):
        page.mouse.click(*scr(page, *xy))
        page.wait_for_timeout(100)
    assert page.evaluate(ANCHORS) == [3]
    page.keyboard.press("Control+z")
    page.wait_for_function(f"({ANCHORS})[0] === 2")
    page.keyboard.press("Control+z")
    page.wait_for_function(f"({ANCHORS})[0] === 1")


def test_earlier_states_lists_the_unsaved_document_a_restart_found_and_opens_it_as_a_tab(page, context):
    # SC-AI-0336
    page.evaluate("""async () => { const E = await import('/src/engine/index.ts'), e = window.formvis.engine; e.newDocument(120, 80, 'EARLY', 'white'); e.fg = { r: 220, g: 20, b: 20 };
      e.applySelection(E.SelectionMask.cropped(0, 0, 120, 80, new Uint8Array(9600).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect(); }""")
    for _ in range(90):
        if page.evaluate(KEPT):
            break
        page.wait_for_timeout(1000)
    assert page.evaluate(KEPT)
    url = page.url
    page.close()
    page = context.new_page()
    page.goto(url)
    page.wait_for_function(URL_LOAD, timeout=60000)
    page.wait_for_timeout(3000)
    menu(page, "File", "Earlier States...")
    row = page.locator(".cv-earlier-row").first
    row.wait_for()
    assert "EARLY" in row.inner_text() and "Crash" in row.inner_text()
    before = page.evaluate("window.formvis.engine.projects.length")
    row.locator("button[data-act='open']").click()
    page.wait_for_function("(n) => window.formvis.engine.projects.length > n", arg=before)
    assert any(n.endswith("(earlier)") and n.startswith("EARLY") for n in page.evaluate("window.formvis.engine.projects.map(p => p.name)"))
    assert page.evaluate("Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(10, 10, 1, 1).data).slice(0, 3)") == [220, 20, 20]
