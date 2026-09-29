# A picture larger than formvis edits in one piece (1.52.7): found from its header, opened reduced or as tiles.
import io
import urllib.request

from PIL import Image

DLG = ".cv-scrim:not([hidden]) .cv-dialog"


def big(tmp_path):
    im = Image.new("RGB", (32_000, 600), (20, 40, 60))
    for x in range(0, 32_000, 1000):
        im.paste((200, 100, 50), (x, 0, x + 10, 600))
    f = tmp_path / "wide.png"; im.save(f, "PNG", compress_level=1); return f


def open_large(page, f, how, **choices):
    page.locator("input[data-role='import-images']").set_input_files(str(f))
    dlg = page.locator(DLG, has_text="Large Picture"); dlg.wait_for(timeout=15000)
    assert "32,000 by 600" in dlg.inner_text() and "73 MB" in dlg.inner_text()
    page.locator(f"{DLG} select[aria-label='Open as']").select_option(how)
    for label, v in choices.items():
        page.locator(f"{DLG} select[aria-label='{label}']").select_option(v)
    page.locator(f"{DLG} .cv-dialog-foot button", has_text="Open").click()
    dlg.wait_for(state="hidden", timeout=60000)


def test_a_large_picture_opens_reduced_or_as_tiles(page, tmp_path):
    f = big(tmp_path)
    page.evaluate("window.formvis.engine.newDocument(10, 10, 'Start', 'white')")
    open_large(page, f, "reduced", **{"Longer side": "8000"})
    assert page.evaluate("(() => { const p = window.formvis.engine.current; return [p.name, p.doc.width, p.doc.height]; })()") == ["wide (reduced)", 8000, 150]
    open_large(page, f, "tiles", **{"Tile size": "8192"})
    tiles = page.evaluate("window.formvis.engine.projects.filter((p) => p.tile).map((p) => [p.name, p.doc.width, p.tile.x, p.tile.col])")
    assert tiles == [["wide r1c1", 8192, 0, 0], ["wide r1c2", 8192, 8192, 1], ["wide r1c3", 8192, 16384, 2], ["wide r1c4", 7424, 24576, 3]], tiles
    stripe = page.evaluate("(() => { const p = window.formvis.engine.projects.find((q) => q.name === 'wide r1c2'), c = p.doc.layers[0].raster.ctx; return [Array.from(c.getImageData(808, 5, 1, 1).data).slice(0, 3), Array.from(c.getImageData(807, 5, 1, 1).data).slice(0, 3)]; })()")
    assert stripe == [[200, 100, 50], [20, 40, 60]], stripe                                   # the stripe at 9,000 is 808 into the second tile


def test_the_tiles_edited_are_assembled_into_one_full_size_picture(page, tmp_path):
    f = big(tmp_path)
    page.evaluate("window.formvis.engine.newDocument(10, 10, 'Start', 'white')")
    open_large(page, f, "tiles", **{"Tile size": "8192"})
    page.evaluate("""async () => { const E = await import('/src/engine/index.ts'), e = window.formvis.engine; e.switchTo(e.projects.find((p) => p.name === 'wide r1c2').id);
      e.applySelection(E.SelectionMask.cropped(100, 100, 20, 20, new Uint8Array(400).fill(255)), 'replace', 's'); e.fg = { r: 255, g: 0, b: 0 }; e.fill('fg'); e.deselect(); }""")
    page.evaluate("""() => { window.__href = null; const click = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { HTMLAnchorElement.prototype.click = click; window.__href = this.getAttribute('href'); }; }""")
    page.evaluate("window.formvis.commands.run('assemble-tiles')")
    page.wait_for_function("() => window.__href !== null", timeout=60000)
    href = page.evaluate("window.__href")
    im = Image.open(io.BytesIO(urllib.request.urlopen("http://127.0.0.1:5190" + href, timeout=60).read())).convert("RGB")
    assert im.size == (32_000, 600)
    assert im.getpixel((8192 + 105, 105)) == (255, 0, 0)                                         # the edit, in its place
    assert im.getpixel((9000, 5)) == (200, 100, 50) and im.getpixel((8999, 5)) == (20, 40, 60) and im.getpixel((31_999, 599)) == (20, 40, 60)
