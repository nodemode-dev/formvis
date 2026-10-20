"""SC-AI-0350: the update dialog of the desktop app (the version found, its release notes, Later, Skip this version, Restart and
update), driven in the browser build with the desktop shell's IPC stood in for: check_for_update answers a stubbed update source
and install_update is recorded. Help > Check for Updates is the command check-for-updates."""
import json

from e2e.conftest import open_app

NOTES = "Fixed the thing\nAdded the other thing"
SHELL = """
window.__calls = [];
window.__TAURI_INTERNALS__ = {
  invoke: async (cmd, args) => {
    window.__calls.push(cmd);
    if (cmd === 'check_for_update') return %s;
    return null;
  },
  transformCallback: () => 0,
};
"""
FOUND = {"status": "available", "version": "9.9.9", "message": "Version 9.9.9 is available.", "notes": NOTES}
DIALOG = ".cv-scrim:not([hidden]) .cv-dialog"


def start(context, report=None):
    page = context.new_page()
    page.add_init_script(SHELL % json.dumps(report or FOUND))
    open_app(page)
    return page


def check(page):
    page.evaluate("window.formvis.commands.run('check-for-updates')")
    dialog = page.locator(DIALOG).filter(has_text="Update available")
    dialog.wait_for(state="visible", timeout=15000)
    return dialog


def calls(page):
    return page.evaluate("window.__calls")


def test_the_dialog_shows_the_version_and_the_release_notes(context):
    page = start(context)
    dialog = check(page)
    text = dialog.inner_text()
    assert "Version 9.9.9 is available." in text and "Restart and update formvis?" in text
    notes = dialog.locator("[aria-label='Release notes']")
    assert notes.is_visible() and notes.inner_text() == NOTES
    names = [b.inner_text() for b in dialog.locator(".cv-dialog-foot button").all()]
    assert names == ["Skip this version", "Later", "Restart and update"], names
    page.close()


def test_without_notes_the_notes_box_stays_hidden(context):
    page = start(context, {**FOUND, "notes": None})
    dialog = check(page)
    assert not dialog.locator("[aria-label='Release notes']").is_visible()
    page.close()


def test_later_closes_it_without_installing_or_remembering_a_skip(context):
    page = start(context)
    dialog = check(page)
    dialog.get_by_role("button", name="Later").click()
    page.locator(DIALOG).filter(has_text="Update available").wait_for(state="hidden", timeout=5000)
    assert "install_update" not in calls(page)
    assert page.evaluate("localStorage.getItem('formvis_skipped_update')") is None
    check(page)
    assert "You skipped this version earlier." not in page.locator(DIALOG).inner_text()
    page.close()


def test_closing_it_any_other_way_is_later(context):
    page = start(context)
    check(page)
    page.keyboard.press("Escape")
    page.locator(DIALOG).filter(has_text="Update available").wait_for(state="hidden", timeout=5000)
    assert "install_update" not in calls(page)
    assert page.evaluate("localStorage.getItem('formvis_skipped_update')") is None
    page.close()


def test_skip_this_version_remembers_it_and_a_quiet_start_check_stays_silent_but_the_menu_offers_it_again(context):
    page = start(context)
    dialog = check(page)
    dialog.get_by_role("button", name="Skip this version").click()
    page.locator(DIALOG).filter(has_text="Update available").wait_for(state="hidden", timeout=5000)
    assert page.evaluate("localStorage.getItem('formvis_skipped_update')") == "9.9.9"
    assert "install_update" not in calls(page)
    assert "Skipped version 9.9.9" in page.locator(".cv-toast, [role='status'], [role='alert']").all_inner_texts().__str__()
    again = check(page)
    assert "You skipped this version earlier." in again.inner_text()
    again.get_by_role("button", name="Later").click()
    page.close()


def test_restart_and_update_installs_the_update(context):
    page = start(context)
    dialog = check(page)
    dialog.get_by_role("button", name="Restart and update").click()
    page.wait_for_function("window.__calls.includes('install_update')", timeout=15000)
    page.close()


def test_a_current_version_shows_no_dialog(context):
    page = start(context, {"status": "current", "version": None, "message": "formvis is up to date."})
    page.evaluate("window.formvis.commands.run('check-for-updates')")
    page.wait_for_function("window.__calls.includes('check_for_update')", timeout=15000)
    page.wait_for_timeout(500)
    assert page.locator(DIALOG).filter(has_text="Update available").count() == 0
    page.close()
