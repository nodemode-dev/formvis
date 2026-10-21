LAYERS = "window.formvis.engine.current.doc.layers.length"
COPY = """async () => { const E = await import('/src/engine/index.ts'), e = window.formvis.engine; e.newDocument(200, 100, 'P', 'white'); e.deselect(); e.fg = { r: 200, g: 20, b: 20 };
  e.applySelection(E.SelectionMask.cropped(20, 20, 40, 40, new Uint8Array(1600).fill(255)), 'replace', 's'); e.fill('fg'); window.formvis.commands.run('copy'); e.deselect(); }"""
SELECT = """async () => { const E = await import('/src/engine/index.ts'); window.formvis.engine.applySelection(E.SelectionMask.cropped(100, 30, 50, 40, new Uint8Array(2000).fill(255)), 'replace', 's'); }"""
PNG = """async () => { const c = document.createElement('canvas'); c.width = 30; c.height = 20; const x = c.getContext('2d'); x.fillStyle = '#0000ff'; x.fillRect(0, 0, 30, 20);
  const blob = await new Promise((r) => c.toBlob(r, 'image/png')); await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); }"""


def allow(page):
    page.context.grant_permissions(["clipboard-read", "clipboard-write"])


def edit_menu(page, label):
    page.keyboard.press("Escape")
    page.get_by_text("Edit", exact=True).first.click()
    if label != "Paste":
        page.locator(".cv-menu-item:has(.cv-menu-label:text-is('Paste Special'))").first.click()
    page.locator(f".cv-menu-item:has(.cv-menu-label:text-is('{label}'))").first.click()


def settle(page, before):
    page.wait_for_function(f"{LAYERS} > {before}", timeout=6000)
    return page.evaluate(LAYERS)


def test_edit_paste_from_the_menu_pastes_the_copied_selection(page):
    allow(page)
    page.evaluate(COPY)
    n = page.evaluate(LAYERS)
    edit_menu(page, "Paste")
    assert settle(page, n) == n + 1


def test_ctrl_v_pastes_the_copied_selection(page):
    allow(page)
    page.evaluate(COPY)
    n = page.evaluate(LAYERS)
    page.mouse.move(600, 400)
    page.keyboard.press("Control+v")
    assert settle(page, n) == n + 1


def test_paste_in_place_from_the_menu_adds_a_layer(page):
    allow(page)
    page.evaluate(COPY)
    n = page.evaluate(LAYERS)
    edit_menu(page, "Paste in Place")
    assert settle(page, n) == n + 1


def test_paste_into_by_its_shortcut_adds_a_layer_clipped_to_the_selection(page):
    allow(page)
    page.evaluate(COPY)
    page.evaluate(SELECT)
    assert page.evaluate("!!window.formvis.engine.current.selection")
    n = page.evaluate(LAYERS)
    page.mouse.move(600, 400)
    page.keyboard.press("Alt+Shift+Control+v")
    assert settle(page, n) == n + 1


def test_a_picture_copied_from_outside_pastes_as_a_layer_from_the_menu_and_the_keyboard(page):
    allow(page)
    page.evaluate(COPY)
    page.evaluate(PNG)
    n = page.evaluate(LAYERS)
    edit_menu(page, "Paste")
    n = settle(page, n)
    assert page.evaluate("window.formvis.engine.current.activeLayer.raster.width") == 30
    page.mouse.move(600, 400)
    page.keyboard.press("Control+v")
    assert settle(page, n) == n + 1


def test_the_menu_paste_says_the_browser_blocked_the_clipboard_and_pastes_formvis_own_copy(page):
    page.evaluate(COPY)
    n = page.evaluate(LAYERS)
    edit_menu(page, "Paste")
    page.get_by_text("The browser blocked clipboard access", exact=False).first.wait_for(timeout=8000)
    assert settle(page, n) == n + 1
