def test_selecting_a_layer_inside_a_collapsed_folder_opens_the_folder_and_scrolls_its_row_into_view(page):
    page.set_viewport_size({"width": 1280, "height": 720})
    page.evaluate("""async () => { const e = window.formvis.engine; e.newDocument(60, 40, 'R', 'white');
      e.addLayer({ name: 'Inner' }); window.__inner = e.activeLayer.id; await window.formvis.commands.run('group');
      window.__folder = e.current.doc.layers.find((l) => l.isGroup).id;
      for (let i = 0; i < 40; i++) e.addLayer({ name: 'Top ' + i }); }""")
    page.evaluate("() => { window.formvis.engine.toggleCollapsed(window.__folder); }")
    page.wait_for_timeout(500)
    assert page.evaluate("window.formvis.engine.current.collapsed.has(window.__folder)") is True
    page.evaluate("() => { const l = document.querySelector('.cv-layer-list, .cv-layers-list'); if (l) l.scrollTop = 0; }")
    page.evaluate("() => window.formvis.engine.selectLayer(window.__inner)")
    page.wait_for_timeout(800)
    assert page.evaluate("window.formvis.engine.current.collapsed.has(window.__folder)") is False
    row = page.locator(f'.cv-layer-list [data-id="{page.evaluate("window.__inner")}"]').first
    row.wait_for(state="attached", timeout=3000)
    box = row.bounding_box()
    view = page.locator(".cv-layer-list").first.bounding_box()
    assert box and view and view["y"] - 1 <= box["y"] and box["y"] + box["height"] <= view["y"] + view["height"] + 1
