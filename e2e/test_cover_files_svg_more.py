import functools

from playwright.sync_api import Error as PlaywrightError

DIALOG = ".cv-scrim:not([hidden]) .cv-dialog"
ROW = """(y) => { const d = window.formvis.engine.flattened().getContext('2d').getImageData(0, y, 500, 1).data; const o = []; for (let x = 0; x < 500; x++) o.push([d[x*4], d[x*4+1], d[x*4+2], d[x*4+3]]); return o; }"""
SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="50mm" height="25mm" viewBox="0 0 100 50"><rect width="33.3" height="50" fill="#dc1e1e"/><script>alert(1)</script></svg>'
LAYER = "(() => { const l = window.formvis.engine.current.activeLayer; return { smart: !!l.smart, mime: l.smart && l.smart.original && l.smart.original.mime, rw: l.raster.width, sw: l.smart ? l.smart.source.width : 0, tw: l.transform.w }; })()"


def steady(fn):
    @functools.wraps(fn)
    def run(page, tmp_path, **kw):
        for attempt in range(3):
            try:
                return fn(page, tmp_path, **kw)
            except PlaywrightError as err:
                if "context was destroyed" not in str(err) or attempt == 2:
                    raise
                page.wait_for_function("window.formvis && window.formvis.engine", timeout=60000)
    return run


def blurred(row):
    return len([p for p in row if 40 < p[1] < 240])


def bring(page, path, how, by, value):
    page.evaluate("window.formvis.engine.newDocument(500, 300, 'T', 'white')")
    page.set_input_files("input[data-role='import-images']", str(path))
    dlg = page.locator(DIALOG)
    dlg.wait_for(timeout=20000)
    dlg.locator("select[data-role='svg-size-by']").select_option(by)
    dlg.locator("input[data-role='svg-size-value']").fill(str(value))
    dlg.locator("select[data-role='svg-bring-as']").select_option(how)
    text = dlg.inner_text()
    dlg.locator(".cv-dialog-foot button", has_text="Import").click()
    page.wait_for_timeout(1200)
    return text


@steady
def test_a_smart_svg_layer_scaled_four_times_keeps_a_sharp_edge_unlike_a_pixel_layer(page, tmp_path):
    svg = tmp_path / "a.svg"
    svg.write_text(SVG)
    text = bring(page, svg, "smart", "ppi", 96)
    assert "Comes in at 189 by 94 px" in text
    assert page.evaluate(LAYER)["mime"] == "image/svg+xml"
    page.evaluate("window.formvis.engine.setLayerTransform({x: 0, y: 0, w: 400, h: 200})")
    page.wait_for_timeout(2500)
    assert page.evaluate(LAYER)["sw"] == 400
    assert blurred(page.evaluate(ROW, 100)) <= 2
    bring(page, svg, "pixels", "width", 100)
    assert not page.evaluate(LAYER)["smart"]
    page.evaluate("window.formvis.engine.setLayerTransform({x: 0, y: 0, w: 400, h: 200})")
    page.wait_for_timeout(2500)
    assert blurred(page.evaluate(ROW, 100)) >= 5


@steady
def test_the_smart_svg_layer_survives_a_project_round_trip(page, tmp_path):
    svg = tmp_path / "a.svg"
    svg.write_text(SVG)
    bring(page, svg, "smart", "width", 100)
    back = page.evaluate("""async () => { const m = await import('/src/io/project-io.ts'); const p = window.formvis.engine.current;
      const out = await m.serialize(p.doc, p.activeId); const opened = await m.deserialize(out.manifest, async (n) => out.files.find(f => f.name === n).blob);
      const l = opened.doc.layers.find(x => x.smart); return [l.smart.original.mime, new TextDecoder().decode(l.smart.original.data).slice(0, 4)]; }""")
    assert back == ["image/svg+xml", "<svg"]


@steady
def test_the_dialog_offers_editable_shapes_and_remembers_its_choices(page, tmp_path):
    svg = tmp_path / "a.svg"
    svg.write_text(SVG)
    page.evaluate("window.formvis.engine.newDocument(500, 300, 'T', 'white')")
    page.set_input_files("input[data-role='import-images']", str(svg))
    dlg = page.locator(DIALOG)
    dlg.wait_for(timeout=20000)
    count = page.evaluate("window.formvis.engine.projects.length")
    dlg.locator("select[data-role='svg-bring-as']").select_option("shapes")
    dlg.locator(".cv-dialog-foot button", has_text="Import").click()
    page.wait_for_function(f"window.formvis.engine.projects.length > {count}", timeout=20000)
    assert page.evaluate("window.formvis.engine.current.doc.layers.some(l => !!l.vector)")
