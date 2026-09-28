import io
import json
import zipfile

from PIL import Image


def _png(size, rgba):
    buf = io.BytesIO(); Image.new("RGBA", size, rgba).save(buf, "PNG"); return buf.getvalue()


def _t(origin, size):
    return {"origin": origin, "size": size, "rotation": 0, "flipX": False, "flipY": False, "sampling": "Nearest"}


def canvasor(path):
    """A canvasor project as NodeMode canvasor writes it: layers bottom to top, each transform an origin and a
    displayed size that may differ from the image's own (the base here is a 4 by 2 image shown at 200 by 100)."""
    m = {"format": "com.nodemode.canvasor", "version": 1, "colorSpace": "sRGB", "resolution": 72, "documentID": "D0C-1", "width": 200, "height": 100,
         "layers": [{"id": "BASE", "name": "Base", "isVisible": True, "transform": _t([0, 0], [200, 100]), "imageFile": "BASE.png"},
                    {"id": "HALF", "name": "Half", "isVisible": True, "transform": _t([20, 20], [40, 40]), "imageFile": "HALF.png"},
                    {"id": "EMPTY", "name": "Empty", "isVisible": True, "transform": _t([0, 0], [200, 100])},
                    {"id": "TOP", "name": "Top", "isVisible": True, "transform": _t([140, 30], [40, 40]), "imageFile": "TOP.png"}],
         "activeLayerID": "HALF"}
    with zipfile.ZipFile(path, "w") as z:
        z.writestr("manifest.json", json.dumps(m))
        z.writestr("images/BASE.png", _png((4, 2), (220, 20, 20, 255)))
        z.writestr("images/HALF.png", _png((10, 10), (0, 0, 0, 128)))
        z.writestr("images/TOP.png", _png((5, 5), (20, 40, 220, 255)))


PX = "([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data).slice(0, 3)"


def test_a_canvasor_project_opens_as_it_was_composed(page, tmp_path):
    f = tmp_path / "Night Scene.canvasor"
    canvasor(f)
    page.evaluate("window.formvis.commands.run('open')")
    inp = page.locator(".cv-scrim:not([hidden]) input[type=file]").first
    assert ".canvasor" in inp.get_attribute("accept")                  # the picker offers .canvasor files
    inp.set_input_files(str(f))
    page.wait_for_function("window.formvis.engine.projects.length === 1")
    got = page.evaluate("""(() => { const p = window.formvis.engine.current; return { name: p.name, size: [p.doc.width, p.doc.height],
      layers: p.doc.layers.map((l) => [l.name, !!l.raster]), active: p.activeLayer.name }; })()""")
    assert got == {"name": "Night Scene", "size": [200, 100], "layers": [["Base", True], ["Half", True], ["Empty", False], ["Top", True]], "active": "Half"}, got
    assert page.evaluate(PX, [5, 5]) == [220, 20, 20]                   # the 4 by 2 base fills the canvas at its shown size
    assert page.evaluate(PX, [195, 95]) == [220, 20, 20]
    half = page.evaluate(PX, [40, 40])                                  # 50% black over red, inside the half layer's 40 px
    assert abs(half[0] - 110) <= 3 and half[1] <= 12, half
    assert page.evaluate(PX, [160, 50]) == [20, 40, 220]                # the last layer is on top
    assert page.evaluate(PX, [100, 50]) == [220, 20, 20]


def test_a_dropped_canvasor_file_is_opened_as_a_project(page):
    assert page.evaluate("(async () => (await import('/src/io/images.ts')).isProjectFile(new File([''], 'x.canvasor')))()")
