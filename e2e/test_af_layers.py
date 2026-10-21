"""PC-IO-0032: an .af, .afphoto or .afdesign document opens with its raster layers, names, groups, visibility, opacity and
blend modes; what is not read is listed, and the file's own preview rides along as a hidden layer."""
import functools
from pathlib import Path

from playwright.sync_api import Error as PlaywrightError

FX = Path(__file__).resolve().parent / "fixtures" / "af"

INFO = """() => { const e = window.formvis.engine, d = e.current.doc, f = e.flattened(), px = f.getContext('2d').getImageData(0, 0, f.width, f.height).data;
  let alpha = 0; for (let i = 3; i < px.length; i += 4) if (px[i] > 0) alpha++;
  return { name: e.current.name, w: d.width, h: d.height, alpha,
    layers: d.layers.map((l) => ({ id: l.id, name: l.name, group: !!l.isGroup, parent: l.parentId || null, visible: l.visible !== false, opacity: l.opacity, blend: l.blend, isolate: !!l.isolate, rw: l.raster ? l.raster.width : null, rh: l.raster ? l.raster.height : null, x: l.transform ? l.transform.x : null })) }; }"""


def steady(fn):
    @functools.wraps(fn)
    def run(page):
        for attempt in range(3):
            try:
                return fn(page)
            except PlaywrightError as err:
                if "context was destroyed" not in str(err) or attempt == 2:
                    raise
                page.wait_for_function("window.formvis && window.formvis.engine", timeout=60000)
    return run


def open_af(page, name):
    count = page.evaluate("window.formvis.engine.projects.length")
    page.set_input_files("input[data-role='open-files']", str(FX / name))
    page.wait_for_function("(c) => window.formvis.engine.projects.length > c", arg=count, timeout=30000)
    page.wait_for_timeout(500)
    return page.evaluate(INFO)


@steady
def test_afdesign_pixel_layer_opens_inside_its_group(page):
    info = open_af(page, "raster_test.afdesign")
    assert (info["w"], info["h"]) == (180, 180)
    by = {l["name"]: l for l in info["layers"]}
    assert by["Layer1"]["group"] and not by["Layer1"]["parent"]
    pixel = by["Pixel"]
    assert pixel["parent"] == by["Layer1"]["id"] and not pixel["group"]
    assert (pixel["rw"], pixel["rh"], pixel["x"]) == (180, 180, 0)
    assert info["alpha"] > 1000


@steady
def test_afdesign_blend_mode_ids_map_to_formvis_modes(page):
    got = page.evaluate("""async () => { const m = await import('/src/io/af-preview.ts'), n = [];
      return [[null], [{ id: 2, ver: 0 }], [{ id: 2, ver: 1 }], [{ id: 6, ver: 1 }], [{ id: 15, ver: 1 }], [{ id: 8, ver: 0 }], [{ id: 99, ver: 0 }]].map(([b]) => m.afBlend(b, 'x', n)); }""")
    assert got == ["normal", "multiply", "darker-color", "lighter-color", "linear-light", "overlay", "normal"]


@steady
def test_afdesign_with_only_empty_layers_opens_as_its_preview(page):
    for name in ("layer_mode.afdesign", "layer_test.afdesign"):
        info = open_af(page, name)
        assert [l["name"] for l in info["layers"]] == [name.split(".")[0]]
        assert info["alpha"] > 0


@steady
def test_af_image_layer_opens_and_the_shape_it_cannot_read_is_listed(page):
    info = open_af(page, "shp_arrow.af")
    names = [l["name"] for l in info["layers"]]
    assert names == ["Preview (flattened)", "Image.png"]
    preview, image = info["layers"]
    assert not preview["visible"] and image["visible"]
    assert (image["rw"], image["rh"]) == (512, 512)
    assert info["alpha"] > 200000
    toasts = page.evaluate("Array.from(document.querySelectorAll('[class*=toast]')).map((e) => e.textContent).join(' ')")
    assert "Shape" in toasts and "vector shape" in toasts


@steady
def test_af_live_filter_and_adjustment_are_listed_not_silently_dropped(page):
    info = open_af(page, "lf_gauss10.af")
    assert [l["name"] for l in info["layers"]] == ["Preview (flattened)", "Background"]
    info = open_af(page, "exposure.af")
    assert [l["name"] for l in info["layers"]] == ["Preview (flattened)", "Image.png"]
    toasts = page.evaluate("Array.from(document.querySelectorAll('[class*=toast]')).map((e) => e.textContent).join(' ')")
    assert "live filter" in toasts and "Exposure adjustment" in toasts


@steady
def test_af_with_nothing_to_read_still_opens_as_its_preview(page):
    info = open_af(page, "poster.af")
    assert (info["w"], info["h"]) == (96, 64)
    assert [l["name"] for l in info["layers"]] == ["poster"]
