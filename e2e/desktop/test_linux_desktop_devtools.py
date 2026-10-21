"""SC-AI-0317: the Developer Tools command in the real Linux window. The desktop window opens the web view's inspector, docked under
the page (the page's height shrinks while it is open, and the window itself keeps its size), and the same command toggles it closed."""


def page_height(app) -> int:
    return app.call("ui_state")["structuredContent"]["window"]["height"]


def test_the_command_is_in_the_catalogue_with_alt_mod_i_in_the_desktop_window(desktop):
    found = [c for c in desktop.catalogue()["commands"] if c["id"] == "developer-tools"]
    assert found and found[0]["label"] == "Developer Tools" and found[0]["keys"] == ["Alt+Mod+I"], found


def test_developer_tools_opens_the_inspector_and_a_second_run_closes_it(desktop):
    window = desktop.toplevel().geometry()
    full = page_height(desktop)
    out = desktop.ok("run_command", {"id": "developer-tools"})
    assert out["result"]["message"] == "Ran Developer Tools."
    desktop.wait_for(lambda: page_height(desktop) < full - 100, timeout=30, what="the page to give room to the inspector")
    assert desktop.toplevel().geometry() == window
    assert desktop.alive()
    desktop.ok("run_command", {"id": "developer-tools"})
    desktop.wait_for(lambda: page_height(desktop) == full, timeout=30, what="the inspector to close and the page to take its height back")
    assert desktop.alive() and desktop.toplevel().geometry() == window
