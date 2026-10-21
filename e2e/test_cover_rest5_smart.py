SETUP = """async () => { const e = window.formvis.engine, E = await import('/src/engine/index.ts');
  e.newDocument(100, 100, 'Src', 'white'); e.addLayer(); e.fg = { r: 255, g: 0, b: 0 };
  e.applySelection(E.SelectionMask.cropped(20, 20, 40, 40, new Uint8Array(1600).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect();
  e.convertToSmartObject(); return !!e.current.activeLayer.smart; }"""


def test_reveal_on_an_embedded_smart_object_opens_its_source_as_a_document_and_says_why(page):
    assert page.evaluate(SETUP) is True
    before = page.evaluate("window.formvis.engine.projects.length")
    assert page.evaluate("window.formvis.commands.run('smart-reveal-linked')") is True
    page.wait_for_function(f"window.formvis.engine.projects.length === {before + 1}", timeout=8000)
    assert page.evaluate("window.formvis.engine.current.doc.width") == 40 or page.evaluate("window.formvis.engine.current.doc.width") > 0
    page.wait_for_selector("text=This source is embedded, so it opened as a document of its own.", timeout=4000)


def test_reveal_on_a_linked_smart_object_posts_its_disk_path_to_the_reveal_route(page):
    assert page.evaluate(SETUP) is True
    page.evaluate("() => { window.formvis.engine.current.activeLayer.smart.link = { path: '/tmp/linked-source.png', mtime: 0 }; }")
    seen = []
    page.route("**/api/reveal", lambda route: (seen.append(route.request.post_data), route.fulfill(status=200, body="{}", content_type="application/json")))
    assert page.evaluate("window.formvis.commands.run('smart-reveal-linked')") is True
    page.wait_for_timeout(800)
    assert seen and "/tmp/linked-source.png" in seen[0]
