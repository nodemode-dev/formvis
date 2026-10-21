# D14 (Quick Export PNG dropped the profile), D19 (pictures opened at 72 ppi) and D20 (Export As wrote no ppi).
import io
import struct

from PIL import Image, ImageCms

from e2e.files2_support import click_button, dialog_open, downloads, scene, set_field, start


def profile_bytes():
    return ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()


def assign(page, icc, name="Test RGB"):
    import base64
    page.evaluate("([b64, n]) => window.formvis.engine.assignProfile({ name: n, icc: b64 })", [base64.b64encode(icc).decode(), name])


def test_d14_quick_export_png_carries_the_document_profile(page):
    scene(page)
    icc = profile_bytes()
    assign(page, icc)
    page.evaluate("window.__got = []")
    page.evaluate("window.formvis.commands.run('quick-export')")
    name, data = downloads(page)[0]
    assert name.endswith(".png") and b"iCCP" in data
    assert Image.open(io.BytesIO(data)).info.get("icc_profile") == icc


def test_d14_export_png_command_carries_the_document_profile(page):
    scene(page)
    icc = profile_bytes()
    assign(page, icc)
    page.evaluate("window.__got = []")
    page.evaluate("window.formvis.commands.run('export-png')")
    _, data = downloads(page)[0]
    assert Image.open(io.BytesIO(data)).info.get("icc_profile") == icc


def test_d20_export_as_png_writes_the_document_resolution(page):
    scene(page)
    page.evaluate("window.formvis.engine.current.doc.resolution = 300")
    dialog_open(page, "export-as")
    set_field(page, "Format", "png")
    page.evaluate("window.__got = []")
    click_button(page, "Export")
    _, data = downloads(page)[0]
    i = data.index(b"pHYs")
    ppm = struct.unpack(">I", data[i + 4:i + 8])[0]
    assert ppm == 11811
    assert round(Image.open(io.BytesIO(data)).info["dpi"][0]) == 300


def test_d20_export_as_jpeg_writes_the_document_resolution(page):
    scene(page)
    page.evaluate("window.formvis.engine.current.doc.resolution = 300")
    dialog_open(page, "export-as")
    set_field(page, "Format", "jpg")
    page.evaluate("window.__got = []")
    click_button(page, "Export")
    _, data = downloads(page)[0]
    assert round(Image.open(io.BytesIO(data)).info["dpi"][0]) == 300


def test_d19_a_300_ppi_picture_opens_at_300_ppi(page, tmp_path):
    start(page)
    f = tmp_path / "pic300.png"
    Image.new("RGB", (60, 40), (200, 50, 50)).save(f, dpi=(300, 300))
    page.evaluate("window.formvis.commands.run('import')") if False else None
    page.set_input_files("input[data-role='import-images']", str(f))
    page.wait_for_function("window.formvis.engine.current && window.formvis.engine.current.doc.width === 60", timeout=15000)
    assert round(page.evaluate("window.formvis.engine.current.doc.resolution")) == 300
