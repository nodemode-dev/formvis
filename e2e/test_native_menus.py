from e2e.conftest import open_app

# The desktop shell on macOS stood in for: @tauri-apps/api/menu creates items through invoke('plugin:menu|new', ...),
# recorded here with their options; the platform reads as a Mac.
SHELL = """
Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' });
window.__menus = []; let rid = 1;
window.__TAURI_INTERNALS__ = {
  invoke: async (cmd, args) => {
    const o = args && args.options ? { kind: args.kind, text: args.options.text, accelerator: args.options.accelerator } : null;
    window.__menus.push({ cmd, o });
    if (cmd === 'plugin:menu|new') { rid += 1; return [rid, 'm' + rid]; }
    return null;
  },
  transformCallback: () => 0,
};
"""


def test_the_menus_go_to_the_macos_menu_bar(context):
    page = context.new_page()
    page.add_init_script(SHELL)
    open_app(page)
    page.wait_for_function("window.__menus.some((c) => c.cmd === 'plugin:menu|set_as_app_menu')", timeout=15000)
    made = page.evaluate("window.__menus.filter((c) => c.cmd === 'plugin:menu|new').map((c) => c.o)")
    subs = [m["text"] for m in made if m and m["kind"] == "Submenu"]
    for name in ["sonny", "File", "Edit", "Image", "Layer", "Select", "Filter", "View", "Window", "Help"]:
        assert name in subs, subs
    save = [m for m in made if m and m["kind"] == "MenuItem" and m["text"] == "Save"]
    assert save and save[0]["accelerator"] == "CmdOrCtrl+S", save
    assert page.evaluate("document.documentElement.classList.contains('has-native-menus')")
    assert not page.locator(".cv-menubar").is_visible()                                   # the in-window bar gives way
    page.close()


def test_a_browser_keeps_the_in_window_menu_bar(page):
    assert page.locator(".cv-menubar").is_visible()
    assert not page.evaluate("document.documentElement.classList.contains('has-native-menus')")
