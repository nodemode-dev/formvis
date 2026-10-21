from e2e.act_support import PANEL, SCENE, dialog_open, dlg_button, dlg_pick_step, dlg_select, dlg_step_labels, open_panel, px, record, set_field, start, steady, stored, toast_text, undo_all


@steady
def test_the_actions_panel_records_plays_and_skips_a_switched_off_step(page, tmp_path):
    start(page)
    page.evaluate(SCENE)
    open_panel(page)
    assert px(page, 12, 8) == [30, 40, 220] and px(page, 3, 8) == [220, 30, 30]
    record(page, "Inv", ["invert", "flip-canvas-h"])
    assert [s["label"] for s in stored(page)[0]["steps"]] == ["Invert", "Flip Canvas Horizontal"]
    assert page.eval_on_selector_all(f"{PANEL} .cv-step-row .cv-step-label", "e => e.map((x) => x.textContent)") == ["Invert", "Flip Canvas Horizontal"]
    recorded = (px(page, 12, 8), px(page, 3, 8))
    assert recorded == ([220, 30, 30], [225, 215, 35])

    undo_all(page, 2)
    assert px(page, 12, 8) == [30, 40, 220]
    page.click(f"{PANEL} [data-act=play]")
    page.wait_for_function("document.body.innerText.includes('Played \"Inv\", 2 steps')", timeout=10000)
    assert (px(page, 12, 8), px(page, 3, 8)) == recorded

    undo_all(page, 2)
    page.click(f"{PANEL} .cv-step-row:nth-child(2) .cv-step-on")
    page.wait_for_function("(() => { const a = JSON.parse(localStorage.getItem('formvis.actions') || '[]'); return a[0] && a[0].steps[1].off === true; })()", timeout=5000)
    assert page.evaluate(f"document.querySelector('{PANEL} .cv-step-row:nth-child(2)').classList.contains('is-off')")
    page.click(f"{PANEL} [data-act=play]")
    page.wait_for_function("document.body.innerText.includes('Played \"Inv\", 2 steps')", timeout=10000)
    assert (px(page, 12, 8), px(page, 3, 8)) == ([225, 215, 35], [220, 30, 30])


@steady
def test_button_mode_dialog_options_and_function_key_refusal(page, tmp_path):
    start(page)
    page.evaluate(SCENE)
    open_panel(page)
    record(page, "Inv", ["invert", "flip-canvas-h"])
    page.check(f"{PANEL} [data-act=mode]")
    page.wait_for_function(f"!!document.querySelector('{PANEL} .cv-actions-grid').offsetParent", timeout=5000)
    assert page.inner_text(f"{PANEL} .cv-actions-grid") == "Inv"

    dialog_open(page, "actions")
    assert dlg_step_labels(page) == ["Invert", "Flip Canvas Horizontal"]
    dlg_pick_step(page, 0)
    dlg_button(page, "Delete Step")
    assert dlg_step_labels(page) == ["Flip Canvas Horizontal"]
    assert [s["label"] for s in stored(page)[0]["steps"]] == ["Flip Canvas Horizontal"]

    set_field(page, "Set", "MySet")
    dlg_select(page, "Button colour", "red")
    dlg_select(page, "Function key", "F5")
    page.wait_for_function("document.body.innerText.includes('F5 already runs')", timeout=5000)
    assert "key" not in stored(page)[0]
    dlg_select(page, "Function key", "Shift+F9")
    a = stored(page)[0]
    assert (a["set"], a["colour"], a["key"]) == ("MySet", "red", "Shift+F9")
    dlg_button(page, "Close")
    page.wait_for_function("document.querySelector('.cv-actions-grid .cv-action-btn.is-red') !== null", timeout=5000)
    assert page.inner_text(f"{PANEL} .cv-actions-grid .cv-action-btn").replace("\n", "") == "InvMySet, Shift+F9"

    page.click(f"{PANEL} .cv-actions-grid .cv-action-btn")
    page.wait_for_function("document.body.innerText.includes('Played \"Inv\", 1 step')", timeout=10000)
    assert (px(page, 3, 8), px(page, 12, 8)) == ([220, 30, 30], [225, 215, 35])
