import io

from PIL import Image

from e2e.files2_support import BLUE, RED, SCENE, click_button, dialog_open, downloads, set_field, start, zip_of


def test_image_processor_runs_on_the_open_image_and_returns_a_zip_with_a_folder_per_type(page):
    start(page)
    page.evaluate(SCENE)
    dialog_open(page, "image-processor")
    set_field(page, "Use Open Images", True)
    set_field(page, "Save as PNG", True)
    set_field(page, "Save as JPEG", True)
    click_button(page, "Run")
    name, data = downloads(page, 1, 60000)[0]
    files = zip_of(data)
    assert name == "Image Processor.zip" and sorted(files) == ["JPEG/Ex.jpg", "PNG/Ex.png"]
    png = Image.open(io.BytesIO(files["PNG/Ex.png"])).convert("RGB")
    assert png.size == (16, 12) and png.getpixel((12, 8)) == BLUE and png.getpixel((2, 2)) == RED
