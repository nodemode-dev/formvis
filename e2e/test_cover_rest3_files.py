import struct
import zlib

PX = "([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data)"


def png_bytes(w, h, rgb):
    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    row = b"\x00" + bytes(rgb) * w
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(row * h)) + chunk(b"IEND", b"")


def test_open_as_reads_a_file_with_the_wrong_extension_as_the_chosen_format_into_a_new_document(page, tmp_path):
    odd = tmp_path / "picture.dat"
    odd.write_bytes(png_bytes(30, 20, (10, 200, 30)))
    page.evaluate("window.formvis.engine.newDocument(80, 40, 'F', 'white')")
    page.keyboard.press("Escape")
    page.get_by_text("File", exact=True).first.click()
    page.locator(".cv-menu-item:has(.cv-menu-label:text-is('Open As...'))").first.click()
    page.locator("input[data-role=open-as-file]").set_input_files(str(odd))
    page.locator("select[data-role=open-as-format]").select_option("png", force=True)
    page.locator(".cv-scrim:not([hidden]) .cv-dialog-foot button", has_text="Open").last.click()
    page.wait_for_function("window.formvis.engine.projects.length === 2", timeout=8000)
    assert page.evaluate("[window.formvis.engine.current.doc.width, window.formvis.engine.current.doc.height]") == [30, 20]
    assert page.evaluate(PX, [15, 10])[:3] == [10, 200, 30]
    assert page.evaluate("window.formvis.engine.projects[0].doc.width") == 80
