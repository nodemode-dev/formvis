import io
import struct
import zipfile
import zlib

D = ".cv-scrim:not([hidden]) .cv-dialog"


def png_bytes(w, h, rgb):
    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    rows = b"".join(b"\x00" + bytes(rgb if (x // 4 + y // 4) % 2 else (255, 255, 255)) * 1 if False else b"\x00" + b"".join(bytes(rgb if (x // 4 + y // 4) % 2 else (255, 255, 255)) for x in range(w)) for y in range(h))
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(rows)) + chunk(b"IEND", b"")


def test_lens_correction_batch_runs_the_filter_on_chosen_images_and_downloads_one_zip_of_pngs(page, tmp_path):
    files = []
    for i, rgb in enumerate(((200, 0, 0), (0, 0, 200))):
        f = tmp_path / f"shot{i}.png"
        f.write_bytes(png_bytes(48, 32, rgb))
        files.append(str(f))
    page.evaluate("window.formvis.engine.newDocument(40, 40, 'L', 'white')")
    page.evaluate("window.formvis.commands.run('lens-correction-batch')")
    page.locator(D).last.wait_for()
    page.wait_for_timeout(600)
    page.locator(f"{D} input[type=file]").first.set_input_files(files)
    page.locator(f"{D} input[aria-label='Distortion value'], {D} input[aria-label='Distortion']").last.evaluate("(i) => { i.value = 40; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); }")
    page.locator(D).last.locator("select").last.select_option("png", force=True)
    with page.expect_download(timeout=60000) as dl:
        page.locator(f"{D}-foot button", has_text="Run").last.click()
    path = dl.value.path()
    names = zipfile.ZipFile(path).namelist()
    assert len(names) == 2 and all(n.endswith(".png") for n in names), names
    from PIL import Image
    raw = zipfile.ZipFile(path).read(names[0])
    assert Image.open(io.BytesIO(raw)).size == (48, 32)
    assert raw != png_bytes(48, 32, (200, 0, 0))
