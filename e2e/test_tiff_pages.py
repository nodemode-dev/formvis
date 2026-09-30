# Every page of a TIFF, and BigTIFF (1.53.4): the choice shown, pages opened as layers or the largest alone.
from PIL import Image

DLG = ".cv-scrim:not([hidden]) .cv-dialog"


def tiff(tmp_path, big=False):
    pages = [Image.new("RGB", (640, 480), (200, 30, 30)), Image.new("RGB", (640, 480), (30, 160, 60)), Image.new("RGB", (80, 60), (30, 60, 200))]
    f = tmp_path / ("big.tif" if big else "scan.tif")
    pages[0].save(f, "TIFF", save_all=True, append_images=pages[1:], **({"big_tiff": True} if big else {}))
    return f


def open_pages(page, f, how):
    page.locator("input[data-role='import-images']").set_input_files(str(f))
    dlg = page.locator(DLG, has_text="TIFF Pages"); dlg.wait_for(timeout=15000)
    assert "3 pages: 640 by 480, 640 by 480, 80 by 60" in dlg.inner_text()
    page.locator(f"{DLG} select[aria-label='Open pages as']").select_option(how)
    page.locator(f"{DLG} .cv-dialog-foot button", has_text="Open").click()
    dlg.wait_for(state="hidden", timeout=30000)


def test_a_multi_page_tiff_opens_as_layers_or_its_largest_page(page, tmp_path):
    open_pages(page, tiff(tmp_path), "layers")
    got = page.evaluate("(() => { const p = window.formvis.engine.current; return [p.doc.width, p.doc.height, p.doc.layers.map((l) => l.name)]; })()")
    assert got == [640, 480, ["Page 1", "Page 2", "Page 3"]], got
    open_pages(page, tiff(tmp_path, big=True), "largest")                                      # BigTIFF, the default choice
    got = page.evaluate("(() => { const e = window.formvis.engine, p = e.current; return [p.doc.width, p.doc.height, Array.from(e.flattened().getContext('2d').getImageData(5, 5, 1, 1).data).slice(0, 3)]; })()")
    assert got == [640, 480, [200, 30, 30]], got                                              # the full-resolution page, not the thumbnail
