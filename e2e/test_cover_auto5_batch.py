import io
import zipfile

from PIL import Image

from e2e.act_support import SCENE, dlg_button, open_panel, record, stored


def test_batch_plays_a_recorded_action_over_chosen_images_and_downloads_one_zip(browser, tmp_path):
    ctx = browser.new_context(accept_downloads=True)
    page = ctx.new_page()
    try:
        for n, c in (("one", (255, 0, 0)), ("two", (0, 255, 0))):
            Image.new("RGB", (30, 20), c).save(tmp_path / f"{n}.png")
        page.goto("http://127.0.0.1:5190/")
        page.wait_for_function("window.formvis && window.formvis.engine", timeout=120000)
        page.evaluate(SCENE)
        open_panel(page)
        record(page, "InvertAct", ["invert"])
        assert [(a["name"], len(a["steps"])) for a in stored(page)] == [("InvertAct", 1)]
        page.evaluate("window.formvis.commands.run('batch')")
        dialog = ".cv-scrim:not([hidden]) .cv-dialog"
        page.wait_for_selector(f"{dialog} input[type=file][multiple]:not([webkitdirectory])", state="attached")
        page.set_input_files(f"{dialog} input[type=file][multiple]:not([webkitdirectory])", [str(tmp_path / "one.png"), str(tmp_path / "two.png")])
        page.wait_for_function("[...document.querySelectorAll('.cv-scrim:not([hidden]) .cv-note')].some((n) => n.textContent.startsWith('2 images chosen'))", timeout=10000)
        with page.expect_download(timeout=60000) as dl:
            dlg_button(page, "Run")
        z = zipfile.ZipFile(io.BytesIO(open(dl.value.path(), "rb").read()))
        got = {n: Image.open(io.BytesIO(z.read(n))).convert("RGB").getpixel((5, 5)) for n in z.namelist()}
        assert got == {"one.png": (0, 255, 255), "two.png": (255, 0, 255)}
        assert dl.value.suggested_filename == "InvertAct batch.zip"
        page.wait_for_function("[...document.querySelectorAll('.cv-toast')].some((t) => t.textContent === 'Batch finished all 2 images.')", timeout=10000)
    finally:
        ctx.close()
