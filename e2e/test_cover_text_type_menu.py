import re

MAKE = """async () => { const e = window.formvis.engine; e.newDocument(400, 200, 'T', 'white');
  await e.createTextLayer({ x: 10, y: 100 }, { ...e.textSettings, content: 'office 1/2 1st', size: 48, color: { r: 0, g: 0, b: 0 }, box: null, direction: 'horizontal' }); }"""
SPEC = "() => { const l = window.formvis.engine.current.activeLayer; return l.text && { f: l.text.features || [], sh: l.text.shaping ?? null, bidi: l.text.bidi ?? null, angle: l.text.angle ?? null }; }"
OPENTYPE = [("liga", "Standard Ligatures"), ("calt", "Contextual Alternates"), ("dlig", "Discretionary Ligatures"), ("swsh", "Swash"), ("onum", "Oldstyle"),
            ("salt", "Stylistic Alternates"), ("titl", "Titling Alternates"), ("ornm", "Ornaments"), ("ordn", "Ordinals"), ("frac", "Fractions")]


def menu(page, *path):
    if page.locator(".cv-menu:not([hidden])").count():
        page.keyboard.press("Escape")
        page.wait_for_timeout(100)
    page.locator(".cv-menu-btn", has_text=path[0]).first.click()
    for i, label in enumerate(path[1:]):
        item = page.locator(".cv-menu:not([hidden]) > *", has_text=re.compile("^" + re.escape(label) + "(?![A-Za-z ])")).first
        item.hover() if i < len(path) - 2 else item.click()


def test_each_opentype_menu_item_turns_its_feature_on_or_off_and_back(page):
    # PC-UI-0366 PC-UI-0367 PC-UI-0368 PC-UI-0369 PC-UI-0370 PC-UI-0371 PC-UI-0372 PC-UI-0373 PC-UI-0374 PC-UI-0375 PC-EN-0398 PC-EN-0399
    page.evaluate(MAKE)
    for tag, label in OPENTYPE:
        off_by_default = tag in ("liga", "calt")
        menu(page, "Layer", "Type", "OpenType", label)
        page.wait_for_function(f"({SPEC})().f.includes({('-' + tag if off_by_default else tag)!r})")
        menu(page, "Layer", "Type", "OpenType", label)
        page.wait_for_function(f"!({SPEC})().f.some((x) => x === {tag!r} || x === {'-' + tag!r})")


def test_language_options_and_text_direction_set_the_layer(page):
    # PC-UI-0387 PC-UI-0388 PC-UI-0389 PC-UI-0390 PC-UI-0801
    page.evaluate(MAKE)
    for label, shaping in (("East Asian Features", "eastAsian"), ("Middle Eastern Features", "middleEastern"),
                           ("Middle Eastern and South Asian Features", "southAsian"), ("Default Features", None)):
        menu(page, "Layer", "Type", "Language Options", label)
        page.wait_for_function(f"({SPEC})().sh === {shaping!r}".replace("None", "null"))
    for label, bidi in (("Right to Left", "rtl"), ("Left to Right", "ltr"), ("Follow Language Options", None)):
        menu(page, "Layer", "Type", "Text Direction", label)
        page.wait_for_function(f"({SPEC})().bidi === {bidi!r}".replace("None", "null"))


def test_type_angle_turns_the_glyphs_and_zero_sets_them_straight(page):
    # SC-ED-0177
    page.evaluate(MAKE)
    page.evaluate("window.formvis.commands.call('type-angle', { angle: 30 })")
    page.wait_for_function(f"({SPEC})().angle === 30")
    page.evaluate("window.formvis.commands.call('type-angle', {})")
    page.wait_for_function(f"({SPEC})().angle === null")


def test_font_preview_size_huge_is_saved_in_the_preferences(page):
    # PC-UI-0386
    page.evaluate(MAKE)
    menu(page, "Layer", "Type", "Font Preview Size", "Huge")
    page.wait_for_function("localStorage.getItem('formvis.prefs') && localStorage.getItem('formvis.prefs').includes('\"fontPreview\":\"huge\"')")


def test_convert_to_shape_turns_the_type_into_a_vector_layer_and_undoes(page):
    # PC-UI-0377 PC-EN-0409
    page.evaluate(MAKE)
    menu(page, "Layer", "Type", "Convert to Shape")
    page.wait_for_function("(() => { const l = window.formvis.engine.current.activeLayer; return !l.text && !!l.vector; })()")
    assert page.evaluate("window.formvis.engine.current.doc.layers.length") == 2
    page.evaluate("window.formvis.engine.undo()")
    page.wait_for_function("(() => { const l = window.formvis.engine.current.activeLayer; return !!l.text && !l.vector; })()")


def test_save_and_load_default_type_styles(page):
    # PC-UI-0395 PC-UI-0396 PC-EN-0413
    page.evaluate("window.formvis.engine.newDocument(200, 100, 'T', 'white')")
    menu(page, "Layer", "Type", "Load Default Type Styles")
    page.wait_for_function("window.formvis.engine.historySteps.names.slice(-1)[0] === 'Load Default Type Styles'")
    assert page.evaluate("window.formvis.engine.current.doc.paragraphStyles.map((s) => s.name)") == ["Heading 1", "Heading 2", "Body", "Caption"]
    page.evaluate("window.formvis.engine.textSettings = { ...window.formvis.engine.textSettings, size: 77 }")
    menu(page, "Layer", "Type", "Save Default Type Styles")
    page.evaluate("window.formvis.engine.newDocument(200, 100, 'U', 'white'); window.formvis.engine.textSettings = { ...window.formvis.engine.textSettings, size: 20 }")
    menu(page, "Layer", "Type", "Load Default Type Styles")
    page.wait_for_function("window.formvis.engine.textSettings.size === 77")
    assert page.evaluate("window.formvis.engine.current.doc.paragraphStyles.length") == 4
