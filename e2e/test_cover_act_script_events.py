from e2e.act_support import SCENE, dialog_open, dlg_button, dlg_select, open_panel, px, record, set_field, start, steady

LIST = "(() => { const d = [...document.querySelectorAll('.cv-dialog')].filter((x) => x.offsetParent).pop(); return [[...d.querySelectorAll('select[aria-label=\"Events with actions\"] option')].map((o) => o.textContent), d.querySelector('[role=log]').textContent]; })()"


@steady
def test_script_events_run_an_action_then_a_script_when_a_document_is_made(page, tmp_path):
    start(page)
    page.evaluate(SCENE)
    open_panel(page)
    record(page, "Inv", ["invert"])
    dialog_open(page, "script-events")
    set_field(page, "Enable Events to Run Scripts/Actions", True)
    dlg_select(page, "Event", "new")
    dlg_select(page, "Action", "Inv")
    dlg_button(page, "Add")
    assert page.evaluate(LIST)[0] == ["New Document: Inv"]
    dlg_button(page, "Done")

    page.evaluate("window.formvis.engine.newDocument(8, 8, 'Ev', 'white')")
    page.wait_for_function("document.body.innerText !== '' && (() => { const p = window.formvis.engine.flattened().getContext('2d').getImageData(2, 2, 1, 1).data; return p[0] === 0 && p[1] === 0 && p[2] === 0; })()", timeout=15000)
    assert px(page, 2, 2) == [0, 0, 0]
    dialog_open(page, "script-events")
    assert "New Document: Inv ran, played" in page.evaluate(LIST)[1]

    page.select_option(".cv-dialog select[aria-label='Events with actions']", index=0)
    dlg_button(page, "Switch On or Off")
    assert page.evaluate(LIST)[0] == ["[New Document: Inv]"]
    page.evaluate("[...document.querySelectorAll('.cv-dialog')].filter((x) => x.offsetParent).pop().querySelector('input[type=file]').dataset.t = '1'")
    page.set_input_files(".cv-dialog input[type=file][data-t='1']", files=[{"name": "paint.js", "mimeType": "text/javascript", "buffer": b"await run('fill-fg'); log('painted');"}])
    page.wait_for_function("(() => { const d = [...document.querySelectorAll('.cv-dialog')].filter((x) => x.offsetParent).pop(); return d.querySelectorAll('select[aria-label=\"Events with actions\"] option').length === 2; })()", timeout=10000)
    dlg_button(page, "Done")

    page.evaluate("window.formvis.engine.newDocument(8, 8, 'Ev2', 'white')")
    page.wait_for_function("(() => { const p = window.formvis.engine.flattened().getContext('2d').getImageData(2, 2, 1, 1).data; return p[2] === 220; })()", timeout=15000)
    assert px(page, 2, 2) == [30, 40, 220]
    dialog_open(page, "script-events")
    assert "New Document: paint.js ran, painted" in page.evaluate(LIST)[1]
