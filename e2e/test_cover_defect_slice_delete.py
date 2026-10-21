# D21: a single slice could not be deleted (engine.removeSlice had no caller); Delete Slice removes the selected slice
# and keeps the others, as one undo step.

SETUP = """() => { const e = window.formvis.engine;
  e.newDocument(200, 100, 'S', 'white');
  e.addSlice({ x: 10, y: 10, w: 60, h: 40 }); e.addSlice({ x: 100, y: 10, w: 60, h: 40 });
  e.activeSlice = e.current.doc.slices[0].id;
  return e.current.doc.slices.map((s) => s.id); }"""
IDS = "window.formvis.engine.current.doc.slices.map((s) => s.id)"


def test_delete_slice_removes_only_the_selected_slice_and_undo_brings_it_back(page):
    ids = page.evaluate(SETUP)
    assert len(ids) == 2
    assert page.evaluate("window.formvis.commands.enabled(window.formvis.commands.get('delete-slice'))") is True
    page.evaluate("window.formvis.commands.run('delete-slice')")
    assert page.evaluate(IDS) == [ids[1]]
    assert page.evaluate("window.formvis.engine.historySteps.names.slice(-1)[0]") == "Delete Slice"
    assert page.evaluate("window.formvis.commands.enabled(window.formvis.commands.get('delete-slice'))") is False
    page.evaluate("window.formvis.engine.undo()")
    assert page.evaluate(IDS) == ids
