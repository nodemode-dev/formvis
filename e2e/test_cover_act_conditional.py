from e2e.act_support import PANEL, SCENE, dialog_open, dlg_button, dlg_pick_step, dlg_select, open_panel, px, record, start, steady, stored, undo_all

PICK = "(i) => { const d = [...document.querySelectorAll('.cv-dialog')].filter((x) => x.offsetParent).pop(); const s = d.querySelector('select.cv-input'); s.value = String(i); s.dispatchEvent(new Event('change', { bubbles: true })); }"


def play(page, idx, done):
    page.evaluate("(i) => document.querySelectorAll('.cv-actions-panel .cv-actions-list .cv-list-row')[i].click()", idx)
    page.wait_for_timeout(200)
    page.click(f"{PANEL} [data-act=play]")
    page.wait_for_function(f"document.body.innerText.includes({done!r})", timeout=10000)
    page.wait_for_timeout(300)


@steady
def test_a_conditional_step_plays_its_action_only_when_the_document_meets_the_test(page, tmp_path):
    start(page)
    page.evaluate(SCENE)
    open_panel(page)
    record(page, "Inner", ["invert"])
    record(page, "Cond", ["select-all"])
    undo_all(page, 2)
    assert px(page, 12, 8) == [30, 40, 220]
    dialog_open(page, "actions")
    page.evaluate(PICK, 1)
    page.wait_for_timeout(200)
    dlg_select(page, "Condition", "landscape")
    dlg_select(page, "Play when it holds", "Inner")
    dlg_button(page, "Insert Conditional")
    assert [s["label"] for s in stored(page)[1]["steps"]] == ["All", "If the document is landscape"]
    dlg_button(page, "Close")
    play(page, 1, 'Played "Cond", 2 steps')
    assert (px(page, 12, 8), px(page, 3, 8)) == ([225, 215, 35], [220, 30, 30])
    undo_all(page, 2)
    assert px(page, 12, 8) == [30, 40, 220]

    dialog_open(page, "actions")
    page.evaluate(PICK, 1)
    page.wait_for_timeout(200)
    dlg_pick_step(page, 1)
    dlg_button(page, "Delete Step")
    dlg_select(page, "Condition", "portrait")
    dlg_select(page, "Play when it holds", "Inner")
    dlg_button(page, "Insert Conditional")
    dlg_button(page, "Close")
    assert [s["label"] for s in stored(page)[1]["steps"]] == ["All", "If the document is portrait"]
    page.evaluate("document.body.querySelectorAll('.cv-toast').forEach((t) => t.remove())")
    play(page, 1, 'Played "Cond", 2 steps')
    assert (px(page, 12, 8), px(page, 3, 8)) == ([30, 40, 220], [220, 30, 30])
