import functools
import gzip

from PIL import Image
from playwright.sync_api import Error as PlaywrightError

PIXEL = """([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data)"""
SIZE = "[window.formvis.engine.current.doc.width, window.formvis.engine.current.doc.height]"
DIALOG = ".cv-scrim:not([hidden]) .cv-dialog"


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


def icon(path, sizes, big=256):
    im = Image.new("RGBA", (big, big), (220, 30, 30, 255))
    for x in range(big // 2, big):
        for y in range(big):
            im.putpixel((x, y), (30, 40, 220, 128))
    im.save(path, sizes=[(s, s) for s in sizes])


def open_file(page, path, role="open-files"):
    page.set_input_files(f"input[data-role='{role}']", str(path))


def import_svg(page, path, width, role="open-files"):
    open_file(page, path, role)
    dlg = page.locator(DIALOG)
    dlg.wait_for(timeout=20000)
    dlg.locator("[data-role='svg-size-by']").select_option("width")
    dlg.locator("[data-role='svg-size-value']").fill(str(width))
    dlg.locator(".cv-dialog-foot button", has_text="Import").click()


@steady
def test_an_icon_with_several_sizes_offers_them_and_opens_the_largest_with_its_alpha(page, tmp_path):
    ico = tmp_path / "p.ico"
    icon(ico, [16, 32, 256])
    count = page.evaluate("window.formvis.engine.projects.length")
    open_file(page, ico)
    dlg = page.locator(DIALOG)
    dlg.wait_for(timeout=20000)
    assert "3 sizes" in dlg.inner_text() and "256 by 256" in dlg.inner_text()
    dlg.locator(".cv-btn-primary").click()
    page.wait_for_function(f"window.formvis.engine.projects.length > {count}", timeout=20000)
    assert page.evaluate(SIZE) == [256, 256]
    assert page.evaluate(PIXEL, [5, 5]) == [220, 30, 30, 255]
    assert page.evaluate(PIXEL, [250, 5])[3] == 128


@steady
def test_a_cursor_file_opens_like_an_icon(page, tmp_path):
    ico = tmp_path / "one.ico"
    icon(ico, [32], 32)
    data = bytearray(ico.read_bytes())
    data[2] = 2
    cur = tmp_path / "one.cur"
    cur.write_bytes(bytes(data))
    count = page.evaluate("window.formvis.engine.projects.length")
    open_file(page, cur)
    page.wait_for_function(f"window.formvis.engine.projects.length > {count}", timeout=20000)
    assert page.evaluate(SIZE) == [32, 32]
    assert page.evaluate(PIXEL, [4, 4]) == [220, 30, 30, 255]


@steady
def test_an_svg_with_only_a_viewbox_opens_at_the_chosen_width_keeping_its_shape_and_transparency(page, tmp_path):
    svg = tmp_path / "a.svg"
    svg.write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><rect width="50" height="50" fill="#dc1e1e"/><rect x="50" width="25" height="50" fill="#1e28dc" fill-opacity="0.5"/></svg>')
    import_svg(page, svg, 200)
    page.wait_for_function("window.formvis.engine.current && window.formvis.engine.current.doc.width === 200", timeout=20000)
    assert page.evaluate(SIZE) == [200, 100]
    assert page.evaluate(PIXEL, [20, 50]) == [220, 30, 30, 255]
    assert page.evaluate(PIXEL, [130, 50])[3] == 128
    assert page.evaluate(PIXEL, [190, 50])[3] == 0


@steady
def test_a_compressed_svg_opens(page, tmp_path):
    svg = tmp_path / "z.svgz"
    svg.write_bytes(gzip.compress(b'<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="#dc1e1e"/></svg>'))
    import_svg(page, svg, 80)
    page.wait_for_function("window.formvis.engine.current && window.formvis.engine.current.doc.width === 80", timeout=20000)
    assert page.evaluate(SIZE) == [80, 40]
    assert page.evaluate(PIXEL, [40, 20]) == [220, 30, 30, 255]


@steady
def test_an_svg_with_a_script_an_event_and_an_outside_image_is_cleaned_and_keeps_its_picture(page, tmp_path):
    svg = tmp_path / "b.svg"
    svg.write_text('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="100" height="50" onload="window.__pwn=1"><script>window.__pwn=2</script><image href="https://example.invalid/x.png" width="10" height="10"/><rect width="50" height="50" fill="#00c800"/></svg>')
    import_svg(page, svg, 100)
    page.wait_for_function("window.formvis.engine.current && window.formvis.engine.current.doc.width === 100", timeout=20000)
    assert page.evaluate("window.__pwn") is None
    assert page.evaluate(PIXEL, [20, 20]) == [0, 200, 0, 255]
    assert "left out" in page.evaluate("[...document.querySelectorAll('.cv-toast')].map((t) => t.textContent).join('|')")


@steady
def test_a_broken_svg_says_so_and_opens_nothing(page, tmp_path):
    svg = tmp_path / "c.svg"
    svg.write_text('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect')
    count = page.evaluate("window.formvis.engine.projects.length")
    import_svg(page, svg, 20)
    page.wait_for_function("[...document.querySelectorAll('.cv-toast')].some((t) => t.textContent.includes('c.svg'))", timeout=20000)
    assert page.evaluate("window.formvis.engine.projects.length") == count


@steady
def test_pasted_svg_text_is_placed_as_a_layer(page, tmp_path):
    page.evaluate("window.formvis.engine.newDocument(60, 60, 'Base', 'white')")
    page.evaluate("""() => {
      const dt = new DataTransfer();
      dt.setData('text/plain', '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30"><rect width="30" height="30" fill="#dc1e1e"/></svg>');
      document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    }""")
    dlg = page.locator(DIALOG)
    dlg.wait_for(timeout=20000)
    assert "Pasted.svg" in dlg.inner_text()
    dlg.locator(".cv-dialog-foot button", has_text="Import").click()
    page.wait_for_function("window.formvis.engine.current.doc.layers.length === 2", timeout=20000)
