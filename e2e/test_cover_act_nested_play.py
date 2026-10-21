from e2e.act_support import PANEL, SCENE, dialog_open, dlg_button, dlg_select, open_panel, px, record, start, steady, stored, undo_all

PICK = "(i) => { const d = [...document.querySelectorAll('.cv-dialog')].filter((x) => x.offsetParent).pop(); const s = d.querySelector('select.cv-input'); s.value = String(i); s.dispatchEvent(new Event('change', { bubbles: true })); }"


@steady
def test_an_inserted_play_action_step_runs_the_inner_action_inside_the_outer(page, tmp_path):
    start(page)
    page.evaluate(SCENE)
    open_panel(page)
    record(page, "Inner", ["invert"])
    record(page, "Outer", ["flip-canvas-h"])
    undo_all(page, 2)
    assert (px(page, 12, 8), px(page, 3, 8)) == ([30, 40, 220], [220, 30, 30])
    dialog_open(page, "actions")
    page.evaluate(PICK, 1)
    page.wait_for_timeout(200)
    dlg_select(page, "Action to play", "Inner")
    dlg_button(page, "Insert Play Action")
    assert [s["label"] for s in stored(page)[1]["steps"]] == ["Flip Canvas Horizontal", "Play Inner"]
    dlg_button(page, "Close")
    page.evaluate("document.querySelectorAll('.cv-actions-panel .cv-actions-list .cv-list-row')[1].click()")
    page.wait_for_timeout(200)
    page.click(f"{PANEL} [data-act=play]")
    page.wait_for_function("document.body.innerText.includes('Played \"Outer\", 2 steps')", timeout=10000)
    assert (px(page, 12, 8), px(page, 3, 8)) == ([220, 30, 30], [225, 215, 35])
