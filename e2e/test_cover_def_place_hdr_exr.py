# D02: placing a Radiance HDR or an EXR into an open document failed with "cannot identify image file" and added no layer.
import struct

from e2e.files2_support import PIXEL, scene, steady

W, H = 6, 4


def write_hdr(path):
    pixel = bytes([0, 128, 0, 129])
    path.write_bytes(b"#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n" + f"-Y {H} +X {W}\n".encode() + pixel * (W * H))
    return str(path)


def write_exr(path):
    import numpy
    import OpenEXR

    px = numpy.zeros((H, W, 3), dtype=numpy.float32)
    px[..., 1] = 1.0
    OpenEXR.File({"compression": OpenEXR.NO_COMPRESSION}, {"RGB": px}).write(str(path))
    return str(path)


def place(page, path, name):
    with page.expect_file_chooser(timeout=10000) as fc:
        page.evaluate("window.formvis.commands.run('place-embedded')")
    fc.value.set_files(path)
    page.wait_for_function(f"window.formvis.engine.current.doc.layers.some((l) => l.name === '{name}')", timeout=20000)
    page.keyboard.press("Enter")
    page.wait_for_timeout(500)


@steady
def test_a_radiance_hdr_places_into_an_open_document(page, tmp_path):
    scene(page)
    before = page.evaluate("window.formvis.engine.current.doc.layers.length")
    place(page, write_hdr(tmp_path / "sky.hdr"), "sky")
    assert page.evaluate("window.formvis.engine.current.doc.layers.length") == before + 1
    assert page.evaluate("window.formvis.engine.current.doc.layers.find((l) => l.name === 'sky').smart") is not None
    px = page.evaluate(PIXEL, [7, 6])
    assert px[1] > 180 and px[0] < 60 and px[2] < 60, px


@steady
def test_an_exr_places_into_an_open_document(page, tmp_path):
    scene(page)
    before = page.evaluate("window.formvis.engine.current.doc.layers.length")
    place(page, write_exr(tmp_path / "grade.exr"), "grade")
    assert page.evaluate("window.formvis.engine.current.doc.layers.length") == before + 1
    px = page.evaluate(PIXEL, [7, 6])
    assert px[1] > 180 and px[0] < 60 and px[2] < 60, px
