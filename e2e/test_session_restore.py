# Session restore (1.52.4): the documents open when formvis closed reopen at the next start, in their tab order.
from e2e.conftest import open_app

COUNT = """() => new Promise((ok) => { const r = indexedDB.open('formvis-recovery'); r.onsuccess = () => { const db = r.result, t = db.transaction('docs', 'readonly').objectStore('docs').count(); t.onsuccess = () => { db.close(); ok(t.result); }; }; r.onerror = () => ok(-1); })"""


def test_the_open_documents_come_back_in_order(context):
    page = context.new_page()
    open_app(page)
    page.evaluate("""async () => { const e = window.formvis.engine;
      e.newDocument(30, 20, 'Alpha', 'white'); e.edit('Rename', (q) => q.updateLayer(q.doc.layers[0].id, { name: 'Edited' }));
      e.newDocument(40, 20, 'Beta', 'white'); e.current.libraryName = 'Beta in the library';   // saved to the library
      e.switchTo(e.projects.find((p) => p.name === 'Alpha').id);
      await window.formvis.keepModified(); }""")
    before = page.evaluate("window.formvis.engine.projects.map((p) => [p.name, p.modified])")
    page.reload()
    page.wait_for_function("window.formvis && window.formvis.engine && window.formvis.engine.projects.length === 2", timeout=20000)
    got = page.evaluate("""(() => { const e = window.formvis.engine; return { docs: e.projects.map((p) => [p.name, p.modified]), active: e.current.name,
      library: e.projects.find((p) => p.name === 'Beta').libraryName, layer: e.projects.find((p) => p.name === 'Alpha').doc.layers[0].name, asked: !!document.querySelector('.cv-scrim:not([hidden]) .cv-dialog') }; })()""")
    assert got["docs"] == before == [["Alpha", True], ["Beta", False]], (before, got)          # order, names, saved state
    assert got["active"] == "Alpha" and got["layer"] == "Edited" and not got["asked"], got
    assert got["library"] == "Beta in the library", got                                          # it saves back to its entry
    page.wait_for_function("() => [...document.querySelectorAll('.cv-toast')].some((t) => t.textContent.includes('Reopened 2 documents'))")
    assert page.evaluate(COUNT) == 2                                                             # the last session's copies replaced, not added to
    page.evaluate("async () => { const e = window.formvis.engine; e.closeProject(e.projects.find((p) => p.name === 'Beta').id); await window.formvis.keepModified(); }")
    assert page.evaluate(COUNT) == 1                                                             # a closed document's copy goes


def test_off_only_unsaved_work_is_offered_back(context):
    page = context.new_page()
    open_app(page)
    page.evaluate("""async () => { const e = window.formvis.engine;
      localStorage.setItem('formvis.prefs', JSON.stringify({ ...JSON.parse(localStorage.getItem('formvis.prefs') || '{}'), restoreSession: false }));
      e.newDocument(30, 20, 'Changed', 'white'); e.edit('Rename', (q) => q.updateLayer(q.doc.layers[0].id, { name: 'Edited' }));
      e.newDocument(30, 20, 'Untouched', 'white');
      await window.formvis.keepModified(); }""")
    page.reload()
    page.wait_for_function("window.formvis && window.formvis.engine")
    dlg = page.locator(".cv-scrim:not([hidden]) .cv-dialog", has_text="Recover unsaved work?")
    dlg.wait_for()
    assert "Changed" in dlg.inner_text() and "Untouched" not in dlg.inner_text()
    page.get_by_role("button", name="Recover").click()
    page.wait_for_function("window.formvis.engine.projects.length === 1")
    assert page.evaluate("window.formvis.engine.projects.map((p) => p.name)") == ["Changed (recovered)"]
