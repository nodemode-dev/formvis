import functools

from playwright.sync_api import Error as PlaywrightError


def steady(fn):
    @functools.wraps(fn)
    def run(page):
        for attempt in range(3):
            try:
                return fn(page)
            except PlaywrightError as err:
                if "context was destroyed" not in str(err) or attempt == 2:
                    raise
                page.wait_for_function("window.formvis && window.formvis.engine", timeout=60000)
    return run


# Spherical Panorama (panorama-view, panorama-apply-view) and Contact Sheet II (contact-sheet). The panorama is a 2:1
# picture with a red left half and a blue right half; the view dialog is opened, its canvas read, Edit View makes the
# linked view document and Apply View projects it back as a layer on the source. The contact sheet is built from the
# open documents and from base64 picture files, and the page size, page count and thumbnail colours are read back.
CALL = "async ([id, p]) => await window.formvis.commands.call(id, p)"
PANO = """() => { const e = window.formvis.engine; e.newDocument(400, 200, 'Pano', 'white');
  e.addLayer(); e.fg = { r: 255, g: 0, b: 0 };
  const c = document.createElement('canvas'); c.width = 400; c.height = 200; const g = c.getContext('2d');
  g.fillStyle = '#ff0000'; g.fillRect(0, 0, 200, 200); g.fillStyle = '#0000ff'; g.fillRect(200, 0, 200, 200);
  e.insertImages([{ name: 'pano.png', width: 400, height: 200, source: c }]); }"""
DIALOG_CENTRE = """() => { const c = document.querySelector('canvas[aria-label="Spherical panorama view"]'); if (!c) return null;
  const d = c.getContext('2d').getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data; return Array.from(d); }"""
PX = "([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data)"


def near(a, b, t=60):
    return all(abs(x - y) <= t for x, y in zip(a, b))


@steady
def test_panorama_view_opens_a_dialog_showing_the_picture_through_a_view(page):
    page.evaluate(PANO)
    page.wait_for_timeout(300)
    page.evaluate("() => window.formvis.commands.run('panorama-view')")
    page.wait_for_selector('canvas[aria-label="Spherical panorama view"]', timeout=10000)
    page.wait_for_timeout(800)
    px = page.evaluate(DIALOG_CENTRE)
    assert px and px[3] == 255 and px[1] < 120 and (px[0] > 100 or px[2] > 100), px


@steady
def test_panorama_view_warns_when_the_picture_is_not_two_to_one(page):
    page.evaluate("() => window.formvis.engine.newDocument(300, 300, 'Sq', 'white')")
    page.evaluate("() => window.formvis.commands.run('panorama-view')")
    page.wait_for_selector('canvas[aria-label="Spherical panorama view"]', timeout=10000)
    page.wait_for_timeout(500)
    assert page.locator("body").inner_text().count("not close to 2:1") >= 1


@steady
def test_panorama_view_is_off_without_a_document(page):
    page.evaluate("() => { const e = window.formvis.engine; while (e.projects.length) e.closeProject?.(e.projects[0].id); }")
    en = page.evaluate("() => { const c = window.formvis.commands.get('panorama-view'); return !!c.enabled(); }")
    if page.evaluate("() => window.formvis.engine.projects.length") == 0:
        assert en is False


@steady
def test_edit_view_makes_a_linked_document_and_apply_view_adds_a_layer_to_the_source(page):
    page.evaluate(PANO)
    page.wait_for_timeout(300)
    src = page.evaluate("() => window.formvis.engine.current.id")
    page.evaluate("() => window.formvis.commands.run('panorama-view')")
    page.wait_for_selector('canvas[aria-label="Spherical panorama view"]', timeout=10000)
    page.wait_for_timeout(600)
    page.get_by_role("button", name="Edit View").click()
    page.wait_for_timeout(1500)
    assert page.evaluate("() => window.formvis.engine.current.id") != src
    assert page.evaluate("(id) => window.formvis.engine.panoramaLinks.size > 0", src)
    assert page.evaluate("() => !!window.formvis.commands.get('panorama-apply-view').enabled()") is True
    page.evaluate("() => window.formvis.commands.run('panorama-apply-view')")
    page.wait_for_timeout(1200)
    assert page.evaluate("() => window.formvis.engine.current.id") == src
    assert "Panorama edit" in page.evaluate("() => window.formvis.engine.current.doc.layers.map((l) => l.name)")


@steady
def test_apply_view_is_off_for_an_ordinary_document(page):
    page.evaluate("() => window.formvis.engine.newDocument(200, 100, 'Plain', 'white')")
    assert page.evaluate("() => !!window.formvis.commands.get('panorama-apply-view').enabled()") is False
    assert page.evaluate("() => window.formvis.engine.applyPanoramaView()") is False


THREE = """() => { const e = window.formvis.engine;
  for (const [n, col] of [['one', [255, 0, 0]], ['two', [0, 160, 0]], ['three', [0, 0, 255]]]) { e.newDocument(60, 40, n, 'white'); e.fg = { r: col[0], g: col[1], b: col[2] }; e.selectAll?.(); e.fill('fg'); e.deselect(); }
  return e.projects.length; }"""
SHEET = {"documents": True, "width": 300, "height": 200, "unit": "px", "ppi": 72, "columns": 3, "rows": 1, "spacing": 10, "captions": False, "flatten": True}


@steady
def test_contact_sheet_from_open_documents_makes_a_page_of_the_asked_size(page):
    n0 = page.evaluate(THREE)
    page.evaluate(CALL, ["contact-sheet", SHEET])
    page.wait_for_timeout(2500)
    assert page.evaluate("() => window.formvis.engine.projects.length") == n0 + 1
    size = page.evaluate("() => { const d = window.formvis.engine.current.doc; return [d.width, d.height]; }")
    assert size == [300, 200]


@steady
def test_contact_sheet_places_each_thumbnail_in_its_own_column(page):
    page.evaluate(THREE)
    page.evaluate(CALL, ["contact-sheet", SHEET])
    page.wait_for_timeout(2500)
    cols = [page.evaluate(PX, [x, 100]) for x in (50, 150, 250)]
    seen = {tuple(c[:3]) for c in cols}
    assert len(seen) == 3, cols
    assert all(c[3] == 255 for c in cols)


@steady
def test_contact_sheet_order_down_changes_the_placement(page):
    page.evaluate(THREE)
    page.evaluate(CALL, ["contact-sheet", {**SHEET, "columns": 1, "rows": 3, "height": 300, "width": 100, "order": "down"}])
    page.wait_for_timeout(2500)
    d = page.evaluate("() => { const x = window.formvis.engine.current.doc; return [x.width, x.height]; }")
    assert d == [100, 300]
    rows = [page.evaluate(PX, [50, y]) for y in (50, 150, 250)]
    assert len({tuple(r[:3]) for r in rows}) == 3, rows


@steady
def test_contact_sheet_needs_files_or_documents(page):
    page.evaluate("() => window.formvis.engine.newDocument(30, 30, 'x', 'white')")
    err = page.evaluate("""async () => { try { await window.formvis.commands.call('contact-sheet', { columns: 2 }); return null; } catch (e) { return String(e.message || e); } }""")
    assert err and "files" in err


@steady
def test_contact_sheet_from_base64_files(page):
    page.evaluate("() => window.formvis.engine.newDocument(30, 30, 'x', 'white')")
    files = page.evaluate("""() => ['#ff0000', '#00ff00'].map((c, i) => { const k = document.createElement('canvas'); k.width = 50; k.height = 50; const g = k.getContext('2d'); g.fillStyle = c; g.fillRect(0, 0, 50, 50);
      return { name: 'p' + i + '.png', data: k.toDataURL('image/png').split(',')[1] }; })""")
    n0 = page.evaluate("() => window.formvis.engine.projects.length")
    page.evaluate(CALL, ["contact-sheet", {"files": files, "width": 200, "height": 100, "unit": "px", "ppi": 72, "columns": 2, "rows": 1, "spacing": 5, "captions": False}])
    page.wait_for_timeout(2500)
    assert page.evaluate("() => window.formvis.engine.projects.length") == n0 + 1
    a, b = page.evaluate(PX, [50, 50]), page.evaluate(PX, [150, 50])
    assert a[0] > 200 and a[1] < 60 and b[1] > 200 and b[0] < 60, (a, b)
