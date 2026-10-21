def test_the_properties_document_section_lists_the_open_documents_facts(page):
    page.evaluate("window.formvis.engine.newDocument(120, 80, 'Doc A', 'white')")
    page.wait_for_function("[...document.querySelectorAll('.cv-props-doc')].some((n) => n.getClientRects().length && n.textContent.includes('Doc A'))", timeout=6000)
    text = page.evaluate("[...document.querySelectorAll('.cv-props-doc')].find((n) => n.getClientRects().length).textContent.replace(/\\s+/g, ' ')")
    assert "120 x 80 px" in text and "72 ppi" in text and "RGB, 8 bit" in text and "Layers1" in text, text


def test_the_properties_document_section_follows_the_active_document(page):
    page.evaluate("window.formvis.engine.newDocument(120, 80, 'Doc A', 'white')")
    page.evaluate("window.formvis.engine.newDocument(64, 48, 'Doc B', 'white')")
    page.wait_for_function("[...document.querySelectorAll('.cv-props-doc')].some((n) => n.getClientRects().length && n.textContent.includes('64 x 48 px'))", timeout=6000)
    page.evaluate("window.formvis.engine.switchTo(window.formvis.engine.projects[0].id)")
    page.wait_for_function("[...document.querySelectorAll('.cv-props-doc')].some((n) => n.getClientRects().length && n.textContent.includes('120 x 80 px'))", timeout=6000)


def test_the_layer_role_select_marks_the_active_layer_for_generation(page):
    page.evaluate("window.formvis.engine.newDocument(120, 80, 'Doc A', 'white')")
    sel = page.locator("select.cv-props-role-select")
    page.wait_for_function("(() => { const s = document.querySelector('select.cv-props-role-select'); return !!s && s.getClientRects().length > 0 && !s.disabled; })()", timeout=6000)
    sel.select_option("subject", force=True)
    page.wait_for_function("window.formvis.engine.activeLayer.role === 'subject'", timeout=4000)
    sel.select_option("", force=True)
    page.wait_for_function("!window.formvis.engine.activeLayer.role", timeout=4000)


def test_dragging_the_grip_beside_the_side_panel_widens_the_column(page):
    page.evaluate("window.formvis.engine.newDocument(120, 80, 'Doc A', 'white')")
    page.wait_for_timeout(500)
    grip = page.locator(".cv-props-resize").first
    box = grip.bounding_box()
    width = "document.querySelector('.cv-props-resize').parentElement.getBoundingClientRect().width"
    before = page.evaluate(width)
    page.mouse.move(box["x"] + box["width"] / 2, box["y"] + 40)
    page.mouse.down()
    page.mouse.move(box["x"] - 80, box["y"] + 50, steps=6)
    page.mouse.up()
    page.wait_for_timeout(400)
    assert page.evaluate(width) > before + 40
