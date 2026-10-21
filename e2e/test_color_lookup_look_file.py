"""Color Lookup loads an Iridas/SpeedGrade .look and a .3dl through its Load button, and both change the picture."""
import struct

PIXEL = "Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(10, 10, 1, 1).data).slice(0, 3)"


def invert_look() -> bytes:
    data = ""
    for n in range(8):
        r, g, b = n & 1, (n >> 1) & 1, n >> 2
        for v in (1 - r, 1 - g, 1 - b):
            data += struct.pack("<f", float(v)).hex().upper()
    return f'<?xml version="1.0" ?>\n<look>\n  <LUT>\n    <size>"2"</size>\n    <data>"{data}"</data>\n  </LUT>\n</look>\n'.encode()


def invert_3dl() -> bytes:
    rows = ["0 1023"]
    for r in range(2):
        for g in range(2):
            for b in range(2):
                rows.append(f"{(1 - r) * 1023} {(1 - g) * 1023} {(1 - b) * 1023}")
    return ("\n".join(rows) + "\n").encode()


def load(page, name, body):
    with page.expect_file_chooser() as fc:
        page.locator(".cv-lut-row button", has_text="Load").first.click()
    fc.value.set_files({"name": name, "mimeType": "application/octet-stream", "buffer": body})
    page.wait_for_function(f"window.formvis.engine.current.activeLayer.adjustment.data.params.cubeName === '{name}'")


def test_a_look_file_and_a_3dl_file_load_from_the_color_lookup_panel(page):
    page.evaluate("window.formvis.engine.newDocument(40, 30, 'A', 'white')")
    assert page.evaluate(PIXEL) == [255, 255, 255]
    assert page.evaluate("window.formvis.commands.run('new-adj-colorLookup')")
    load(page, "invert.look", invert_look())
    page.wait_for_function(f"{PIXEL}[0] < 5")
    assert page.evaluate(PIXEL) == [0, 0, 0]
    assert page.locator(".cv-lut-name").first.inner_text() == "invert.look"
    page.locator(".cv-lut-row button", has_text="Clear").first.click()
    page.wait_for_function(f"{PIXEL}[0] > 100")                     # back to the built-in warm look
    load(page, "invert.3dl", invert_3dl())
    page.wait_for_function(f"{PIXEL}[0] < 5")
    assert page.evaluate(PIXEL) == [0, 0, 0]


def test_a_file_that_is_not_a_lut_is_refused_with_a_note(page):
    page.evaluate("window.formvis.engine.newDocument(40, 30, 'A', 'white')")
    assert page.evaluate("window.formvis.commands.run('new-adj-colorLookup')")
    with page.expect_file_chooser() as fc:
        page.locator(".cv-lut-row button", has_text="Load").first.click()
    fc.value.set_files({"name": "notes.look", "mimeType": "text/plain", "buffer": b"<look><LUT><size>\"2\"</size></LUT></look>"})
    page.get_by_text("is not a 3D LUT in the .cube, .3dl or .look format").wait_for()
    assert page.evaluate("window.formvis.engine.current.activeLayer.adjustment.data.params.cubeName") == ""
