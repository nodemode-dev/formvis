import re

MK = """async () => {
  const e = window.formvis.engine, E = await import('/src/engine/index.ts');
  e.newDocument(200, 100, 'A', 'white');
  const sq = (x, y) => { e.addLayer(); e.applySelection(E.SelectionMask.cropped(x, y, 10, 10, new Uint8Array(100).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect(); return e.current.activeId; };
  const ids = [sq(10, 5), sq(50, 40), sq(150, 70)];
  e.current.selectedIds = new Set(ids); e.refresh();
  window.__ids = ids;
}"""
POS = """() => { const e = window.formvis.engine; return window.__ids.map((id) => { const l = e.current.layer(id), d = l.raster.read(0, 0, l.raster.width, l.raster.height).data; for (let i = 0; i < d.length; i += 4) if (d[i + 3]) return [(i / 4) % l.raster.width + l.transform.x, Math.floor(i / 4 / l.raster.width) + l.transform.y]; return null; }); }"""


def menu(page, *path):
    page.locator(".cv-menu-btn", has_text=path[0]).first.click()
    for i, label in enumerate(path[1:]):
        item = page.locator(".cv-menu:not([hidden]) > *", has_text=re.compile("^" + re.escape(label) + "(?![A-Za-z ])")).first
        item.hover() if i < len(path) - 2 else item.click()


def test_layer_align_and_distribute_menus_move_the_selected_layers(page):
    # SC-ED-0111 SC-ED-0112
    page.evaluate(MK)
    assert page.evaluate(POS) == [[10, 5], [50, 40], [150, 70]]
    menu(page, "Layer", "Distribute", "Distribute Horizontal Centers")
    assert page.evaluate(POS) == [[10, 5], [80, 40], [150, 70]]
    menu(page, "Layer", "Align", "Align Left Edges")
    assert page.evaluate(POS) == [[10, 5], [10, 40], [10, 70]]
    menu(page, "Layer", "Align", "Align Bottom Edges")
    assert page.evaluate(POS) == [[10, 70], [10, 70], [10, 70]]
    page.evaluate("window.formvis.engine.undo()")
    assert page.evaluate(POS) == [[10, 5], [10, 40], [10, 70]]
