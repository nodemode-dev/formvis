from e2e.act_support import SCENE, dialog_open, dlg_button, dlg_select, px, set_field, start, steady

LAYERS = "window.formvis.engine.current.doc.layers.map((l) => [l.name, l.visible])"


@steady
def test_a_visibility_variable_is_defined_and_data_sets_import_and_apply_through_their_dialogs(page, tmp_path):
    start(page)
    page.evaluate(SCENE)
    assert px(page, 12, 8) == [30, 40, 220]
    dialog_open(page, "variables-define")
    set_field(page, "Visibility", True)
    dlg_button(page, "OK")
    variables = page.evaluate("window.formvis.engine.current.doc.variables")
    assert [(v["name"], v["kind"]) for v in variables] == [("Top", "visibility")]

    dialog_open(page, "data-sets-import")
    page.evaluate("[...document.querySelectorAll('.cv-dialog')].filter((x) => x.offsetParent).pop().querySelector('input[type=file]').dataset.t = '1'")
    page.set_input_files(".cv-dialog input[type=file][data-t='1']", files=[{"name": "sets.csv", "mimeType": "text/csv", "buffer": b"Data Set,Top\nShown,true\nHidden,false\n"}])
    page.wait_for_function("window.formvis.engine.current.doc.dataSets && window.formvis.engine.current.doc.dataSets.length === 2", timeout=10000)
    assert [d["name"] for d in page.evaluate("window.formvis.engine.current.doc.dataSets")] == ["Shown", "Hidden"]

    dlg_select(page, "Data set", "Hidden")
    dlg_button(page, "Apply")
    page.wait_for_function("window.formvis.engine.current.doc.activeDataSet === 'Hidden'", timeout=10000)
    assert page.evaluate(LAYERS) == [["Background", True], ["Top", False]]
    assert px(page, 12, 8) == [220, 30, 30]

    dlg_select(page, "Data set", "Shown")
    dlg_button(page, "Apply")
    page.wait_for_function("window.formvis.engine.current.doc.activeDataSet === 'Shown'", timeout=10000)
    assert page.evaluate(LAYERS) == [["Background", True], ["Top", True]]
    assert px(page, 12, 8) == [30, 40, 220]
