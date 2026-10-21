import base64
import json

from e2e.act_support import PANEL, SCENE, dialog_open, dlg_button, dlg_pick_step, dlg_select, dlg_step_labels, open_panel, px, record, set_field, start, steady, stored, toast_text, undo_all
from e2e.files2_support import downloads

CHOOSE_ACTION = "(() => { const d = [...document.querySelectorAll('.cv-dialog')].filter((x) => x.offsetParent).pop(); const s = d.querySelector('select.cv-input'); s.value = '1'; s.dispatchEvent(new Event('change', { bubbles: true })); })()"


def names(page):
    return [(a["name"], [s["label"] for s in a["steps"]]) for a in stored(page)]


@steady
def test_reorder_rename_insert_menu_item_and_stop_then_play_pauses_and_continues(page, tmp_path):
    start(page)
    page.evaluate(SCENE)
    open_panel(page)
    record(page, "One", ["invert"])
    record(page, "Two", ["flip-canvas-h", "select-all"])
    undo_all(page, 3)
    assert [n for n, _ in names(page)] == ["One", "Two"]

    dialog_open(page, "actions")
    page.evaluate(CHOOSE_ACTION)
    page.wait_for_timeout(200)
    assert dlg_step_labels(page) == ["Flip Canvas Horizontal", "All"]
    dlg_button(page, "Action Up")
    assert [n for n, _ in names(page)] == ["Two", "One"]
    dlg_pick_step(page, 0)
    dlg_button(page, "Step Down")
    assert names(page)[0] == ("Two", ["All", "Flip Canvas Horizontal"])
    set_field(page, "New action", "Renamed")
    dlg_button(page, "Rename")
    assert [n for n, _ in names(page)] == ["Renamed", "One"]

    dlg_select(page, "Menu item", "deselect")
    dlg_button(page, "Insert Menu Item")
    assert names(page)[0][1] == ["All", "Flip Canvas Horizontal", "Menu Item: Deselect"]
    page.fill(".cv-dialog input[placeholder='Message for a stop']", "Halt here")
    dlg_button(page, "Insert Stop")
    assert names(page)[0][1][-1] == "Stop"
    dlg_button(page, "Close")
    page.wait_for_timeout(300)

    page.click(f"{PANEL} [data-act=play]")
    page.wait_for_function("[...document.querySelectorAll('.cv-dialog')].some((d) => d.offsetParent && d.innerText.includes('Action Paused') && d.innerText.includes('Halt here'))", timeout=10000)
    dlg_button(page, "Continue")
    page.wait_for_function("document.body.innerText.includes('Played \"Renamed\", 4 steps')", timeout=10000)
    assert px(page, 3, 8) == [30, 40, 220]


@steady
def test_actions_save_to_an_atn_and_load_back_from_the_dialog(page, tmp_path):
    start(page)
    page.evaluate(SCENE)
    open_panel(page)
    record(page, "Flip", ["flip-canvas-h", "select-all"])
    dialog_open(page, "actions")
    page.evaluate("window.__got = []")
    dlg_button(page, "Save .atn...")
    name, data = downloads(page)[0]
    assert name == "formvis actions.atn" and data[:4] == b"\x00\x00\x00\x10"

    page.evaluate("(() => { const d = [...document.querySelectorAll('.cv-dialog')].filter((x) => x.offsetParent).pop(); d.querySelector('input[type=file]').dataset.t = '1'; })()")
    page.set_input_files(".cv-dialog input[type=file][data-t='1']", files=[{"name": "formvis actions.atn", "mimeType": "application/octet-stream", "buffer": data}])
    page.wait_for_function("JSON.parse(localStorage.getItem('formvis.actions') || '[]').length === 2", timeout=10000)
    loaded = stored(page)
    assert loaded[1]["name"] == "Flip"
    assert [s["label"] for s in loaded[1]["steps"]] == ["Flip Canvas Horizontal", "All"]
    assert "Imported 1 action" in page.evaluate("document.body.innerText")
