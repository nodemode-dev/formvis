# SVG files placed as layers (checked 1.51.7: formvis already took SVG as an image; this confirms it).
def test_an_svg_file_is_placed_as_a_layer(page, tmp_path):
    svg = tmp_path / "badge.svg"
    svg.write_text('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30"><rect width="40" height="30" fill="#1e88e5"/><circle cx="20" cy="15" r="8" fill="#ffeb3b"/></svg>')
    page.evaluate("window.formvis.engine.newDocument(120, 80, 'S', 'white')")
    page.locator("input[data-role='import-images']").set_input_files(str(svg))
    page.locator(".cv-scrim:not([hidden]) .cv-dialog-foot button", has_text="Import").click()   # asks the width first (the declared 40)
    page.wait_for_function("() => window.formvis.engine.current.doc.layers.length === 2", timeout=10000)
    got = page.evaluate("""(() => { const l = window.formvis.engine.activeLayer, px = (x, y) => Array.from(l.raster.ctx.getImageData(x, y, 1, 1).data).slice(0, 3);
      return [l.name, l.raster.width, l.raster.height, px(2, 2), px(20, 15)]; })()""")
    assert got[0].startswith("badge") and got[1:3] == [40, 30] and got[3] == [30, 136, 229] and got[4] == [255, 235, 59], got
