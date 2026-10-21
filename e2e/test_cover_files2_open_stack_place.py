import pytest
from PIL import Image

from e2e.files2_support import PIXEL, click_button, dialog_open, scene, steady


def png(path, color, size):
    Image.new("RGB", size, color).save(path, "PNG")
    return str(path)


@steady
def test_load_files_into_stack_makes_one_document_with_a_layer_per_file(page, tmp_path):
    scene(page)
    a, b = png(tmp_path / "a.png", (200, 10, 10), (9, 5)), png(tmp_path / "b.png", (10, 10, 200), (9, 5))
    dialog_open(page, "load-files-stack")
    count = page.evaluate("window.formvis.engine.projects.length")
    page.evaluate("[...[...document.querySelectorAll('.cv-dialog')].filter((d) => d.offsetParent).pop().querySelectorAll('input[type=file]')].find((i) => i.multiple && !i.webkitdirectory).dataset.t = '1'")
    page.set_input_files("input[type=file][data-t='1']", [a, b])
    page.wait_for_function("[...document.querySelectorAll('.cv-dialog')].some((d) => d.offsetParent && d.textContent.includes('2 files'))", timeout=10000)
    click_button(page, "OK")
    page.wait_for_function(f"window.formvis.engine.projects.length > {count}", timeout=30000)
    got = page.evaluate("(() => { const p = window.formvis.engine.current; return [p.doc.width, p.doc.height, p.doc.layers.map((l) => l.name)]; })()")
    assert got[:2] == [9, 5] and sorted(got[2]) == ["a", "b"]


@steady
def test_place_embedded_adds_a_smart_object_layer_with_the_file_pixels(page, tmp_path):
    scene(page)
    f = png(tmp_path / "placed.png", (10, 200, 10), (10, 6))
    with page.expect_file_chooser(timeout=10000) as fc:
        page.evaluate("window.formvis.commands.run('place-embedded')")
    fc.value.set_files(f)
    page.wait_for_function("window.formvis.engine.current.doc.layers.some((l) => l.name === 'placed')", timeout=15000)
    page.keyboard.press("Enter")
    page.wait_for_timeout(500)
    assert page.evaluate("window.formvis.engine.current.doc.layers.find((l) => l.name === 'placed').smart") is not None
    assert page.evaluate(PIXEL, [8, 6])[:3] == [10, 200, 10]
