from e2e.conftest import open_app

# The desktop shell's IPC, stood in for: @tauri-apps/api's invoke calls window.__TAURI_INTERNALS__.invoke, which the
# shell provides; here it answers system_fonts as the shell's command does (its Rust test checks the real font folders).
SHELL = """window.__TAURI_INTERNALS__ = {
  invoke: async (cmd) => { window.__asked = (window.__asked || []).concat(cmd); if (cmd === 'system_fonts') return ['Alpha Serif', 'Zeta Sans']; throw new Error('not in this stand-in: ' + cmd); },
  transformCallback: () => 0, metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
};"""
# The Type tool's Font menu, as the user sees it (the app's own copy of the font module fills it).
MENU = """() => { window.formvis.engine.setTool('type'); const s = [...document.querySelectorAll('select')].find((n) => [...n.options].some((o) => o.text === 'Inter'));
  return s ? [...s.options].map((o) => o.text) : []; }"""


def test_the_desktop_app_lists_the_installed_fonts_at_start(context):
    page = context.new_page()
    page.add_init_script(SHELL)
    open_app(page)
    page.wait_for_function("(window.__asked || []).includes('system_fonts')", timeout=10000)   # asked at start, no click
    for _ in range(50):                                   # the answer arrives a moment after the request
        menu = page.evaluate(MENU)
        if "Zeta Sans" in menu:
            break
        page.wait_for_timeout(200)
    assert "Alpha Serif" in menu and "Zeta Sans" in menu, menu
    page.close()


def test_a_browser_does_not_ask_without_a_click(page):
    # Local Font Access asks the user's permission, so the browser build waits for "Load system fonts..." as before.
    page.wait_for_timeout(500)
    assert page.evaluate("'__TAURI_INTERNALS__' in window") is False
    menu = page.evaluate(MENU)
    assert "Inter" in menu and "Alpha Serif" not in menu, menu


def test_load_system_fonts_in_a_browser_fills_the_menu(context):
    # The browser's Local Font Access, stood in for. The menu's options were built once and never refreshed, so fonts
    # loaded this way did not appear from 1.29.0 until the menu became a live list in 1.43.0.
    page = context.new_page()
    page.add_init_script("window.queryLocalFonts = async () => [{ family: 'Gamma Grotesk' }, { family: 'Delta Mono' }];")
    open_app(page)
    menu = page.evaluate(MENU)
    assert "Load system fonts..." in menu and "Gamma Grotesk" not in menu, menu
    page.evaluate("""() => { const s = [...document.querySelectorAll('select')].find((n) => [...n.options].some((o) => o.text === 'Inter'));
      s.value = [...s.options].find((o) => o.text === 'Load system fonts...').value; s.dispatchEvent(new Event('change', { bubbles: true })); }""")
    for _ in range(50):
        menu = page.evaluate(MENU)
        if "Gamma Grotesk" in menu:
            break
        page.wait_for_timeout(200)
    assert "Gamma Grotesk" in menu and "Delta Mono" in menu, menu
    page.close()
