import json
import struct
from pathlib import Path

FIX = Path(__file__).resolve().parent / "fixtures" / "shc"
FILES = ["spec_v2_corners_and_smooth.shc", "spec_v1_unicode_names.shc"]


def decode(b):
    assert b[:4] == b"8BFS"
    count = struct.unpack(">I", b[6:10])[0]
    o, out = 10, []
    for _ in range(count):
        version, n = struct.unpack(">II", b[o:o + 8])
        o += 8
        name = b[o:o + 2 * n].decode("utf-16-be").rstrip("\0")
        o += 2 * n
        m = struct.unpack(">H", b[o + 2:o + 4])[0]
        o += 4
        pts = [struct.unpack(">HH", b[o + 4 * i:o + 4 * i + 4]) for i in range(m)]
        o += 4 * m + (m if version == 2 else 0) + 8
        out.append((name, sorted(((h, v) for v, h in pts), key=lambda p: p[0])))
    assert o == len(b)
    return out


def library_points(page):
    lib = json.loads(page.evaluate("localStorage.getItem('formvis.contours')"))
    out = []
    for e in lib:
        pts = [tuple(float(s) for s in part.split(",")) for part in e["id"][7:].split(";")]
        out.append((e["name"], [(round(x * 255), round(y * 255)) for x, y in pts]))
    return out


def test_contour_files_made_to_the_public_layout_load_and_save_through_the_layer_style_dialog(page):
    page.evaluate("() => window.formvis.engine.newDocument(120, 80, 'S', 'white')")
    assert page.evaluate("window.formvis.commands.run('layer-style')")
    page.locator(".cv-scrim:not([hidden]) .cv-dialog-foot").last.wait_for()
    page.wait_for_timeout(1000)
    sel = page.locator(".cv-scrim:not([hidden]) .cv-dialog select:has(option[value='act:load'])").first
    expected = []
    for name in FILES:
        with page.expect_file_chooser() as fc:
            sel.select_option("act:load")
        fc.value.set_files(str(FIX / name))
        page.wait_for_timeout(500)
        expected += decode((FIX / name).read_bytes())
    assert len(expected) == 5
    assert library_points(page) == expected
    with page.expect_download() as dl:
        sel.select_option("act:save")
    assert dl.value.suggested_filename == "Contours.shc"
    saved = Path(dl.value.path()).read_bytes()
    assert decode(saved) == expected
    page.locator(".cv-scrim:not([hidden]) .cv-dialog-foot button", has_text="Cancel").last.click()
