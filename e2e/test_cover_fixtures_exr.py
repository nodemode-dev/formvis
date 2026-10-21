import math

from e2e.fixtures_support import FX, open_fixture, steady

LAYERS = """() => { const d = window.formvis.engine.current.doc; return { depth: d.depth, w: d.width, h: d.height, layers: d.layers.map((l) => ({ n: l.name, c: l.channels ? { w: l.channels.width, h: l.channels.height, n: l.channels.n } : null })) }; }"""
SAMPLE = """([i, x, y]) => { const c = window.formvis.engine.current.doc.layers[i].channels; const o = (y * c.width + x) * 4; return Array.from(c.data.slice(o, o + 4)); }"""
CHOOSER = """() => { const d = [...document.querySelectorAll('.cv-dialog')].filter((x) => x.offsetParent).pop(); return d ? { text: d.textContent, rows: [...d.querySelectorAll('label.cv-list-row')].map((r) => ({ name: r.querySelector('.cv-list-name').textContent, on: r.querySelector('input') ? r.querySelector('input').checked : null })) } : null; }"""
TICK = """([name, on]) => { const d = [...document.querySelectorAll('.cv-dialog')].filter((x) => x.offsetParent).pop(); const r = [...d.querySelectorAll('label.cv-list-row')].find((x) => x.querySelector('.cv-list-name').textContent.startsWith(name)); const b = r.querySelector('input'); if (b.checked !== on) b.click(); }"""
PRESS = """(label) => { const d = [...document.querySelectorAll('.cv-dialog')].filter((x) => x.offsetParent).pop(); [...d.querySelectorAll('button')].find((b) => b.textContent.trim() === label).click(); }"""


def chooser_open(page, name, untick=(), tick=()):
    count = page.evaluate("window.formvis.engine.projects.length")
    page.set_input_files("input[data-role='open-files']", str(FX / name))
    page.wait_for_function("[...document.querySelectorAll('.cv-dialog')].some((x) => x.offsetParent && x.textContent.includes('channel groups'))", timeout=20000)
    seen = page.evaluate(CHOOSER)
    for n in untick:
        page.evaluate(TICK, [n, False])
    for n in tick:
        page.evaluate(TICK, [n, True])
    page.evaluate(PRESS, "Open")
    page.wait_for_function(f"window.formvis.engine.projects.length > {count}", timeout=20000)
    return seen


@steady
def test_a_multipart_exr_offers_each_part_and_opens_the_ticked_ones_as_32_bit_layers(page, tmp_path):
    seen = chooser_open(page, "exr_multipart.exr")
    assert "3 channel groups" in seen["text"]
    names = [r["name"] for r in seen["rows"]]
    assert any(n.startswith("beauty") for n in names) and any(n.startswith("depth") for n in names) and any(n.startswith("normals") for n in names), names
    d = page.evaluate(LAYERS)
    assert d["depth"] == 32 and (d["w"], d["h"]) == (24, 16) and len(d["layers"]) == 3, d
    by = {l["n"].split(" ")[0].lower(): i for i, l in enumerate(d["layers"])}
    assert set(by) == {"beauty", "depth", "normals"}, d
    beauty = page.evaluate(SAMPLE, [by["beauty"], 12, 5])
    assert math.isclose(beauty[0], 12 / 23 * 4, rel_tol=1e-3) and math.isclose(beauty[1], 0.5, rel_tol=1e-3) and math.isclose(beauty[2], 0.25, rel_tol=1e-3), beauty
    depth = page.evaluate(SAMPLE, [by["depth"], 3, 15])
    assert math.isclose(depth[0], 9.0, rel_tol=1e-3) and math.isclose(depth[1], 9.0, rel_tol=1e-3), depth
    normals = page.evaluate(SAMPLE, [by["normals"], 4, 4])
    assert [round(v, 3) for v in normals[:3]] == [0.0, 1.0, 0.0], normals


@steady
def test_unticking_a_part_leaves_it_out_and_a_beauty_layer_adds_the_ticked_groups(page, tmp_path):
    chooser_open(page, "exr_multipart.exr", untick=("depth", "normals"))
    d = page.evaluate(LAYERS)
    assert len(d["layers"]) == 1 and d["layers"][0]["n"].lower().startswith("beauty"), d


@steady
def test_exr_channel_groups_with_a_prefix_split_into_layers(page, tmp_path):
    seen = chooser_open(page, "exr_aov_groups.exr")
    names = [r["name"] for r in seen["rows"]]
    assert "Beauty" in names and any(n.startswith("diffuse") for n in names), names
    d = page.evaluate(LAYERS)
    assert len(d["layers"]) == 2
    dif = [i for i, l in enumerate(d["layers"]) if l["n"].startswith("diffuse")][0]
    px = page.evaluate(SAMPLE, [dif, 3, 3])
    assert [round(v, 3) for v in px[:3]] == [0.1, 0.2, 0.3], px


@steady
def test_a_cryptomatte_exr_lists_its_objects_and_makes_one_matte_layer_per_object(page, tmp_path):
    seen = chooser_open(page, "exr_cryptomatte.exr", tick=("crypto_object · left", "crypto_object · right"))
    assert "2 Cryptomatte objects" in seen["text"], seen["text"]
    names = [r["name"] for r in seen["rows"]]
    assert any("left" in n for n in names) and any("right" in n for n in names), names
    d = page.evaluate(LAYERS)
    assert len(d["layers"]) >= 2
    li = [i for i, l in enumerate(d["layers"]) if "left" in l["n"]][0]
    ri = [i for i, l in enumerate(d["layers"]) if "right" in l["n"]][0]
    left_l, left_r = page.evaluate(SAMPLE, [li, 2, 8]), page.evaluate(SAMPLE, [li, 20, 8])
    right_l, right_r = page.evaluate(SAMPLE, [ri, 2, 8]), page.evaluate(SAMPLE, [ri, 20, 8])
    assert left_l[0] > 0.9 and left_r[0] < 0.1, (left_l, left_r)
    assert right_r[0] > 0.9 and right_l[0] < 0.1, (right_l, right_r)


@steady
def test_open_openexr_as_acescg_moves_the_colours_to_the_working_space(page, tmp_path):
    opened, _ = open_fixture(page, "exr_single.exr")
    plain = page.evaluate(SAMPLE, [0, 12, 5])
    assert math.isclose(plain[0], 12 / 23 * 4, rel_tol=1e-3)
    page.evaluate("window.formvis.commands.run('colour.settings')")
    page.wait_for_function("[...document.querySelectorAll('.cv-dialog')].some((x) => x.offsetParent && x.textContent.includes('OpenEXR'))", timeout=10000)
    page.evaluate("""() => { const d = [...document.querySelectorAll('.cv-dialog')].filter((x) => x.offsetParent).pop(); const r = [...d.querySelectorAll('label')].find((x) => x.textContent.includes('Open OpenEXR files as ACEScg')); const b = r.querySelector('input'); if (!b.checked) b.click(); }""")
    page.evaluate(PRESS, "OK") if page.evaluate("[...document.querySelectorAll('.cv-dialog')].filter((x) => x.offsetParent).pop().textContent.includes('OK')") else page.keyboard.press("Escape")
    page.wait_for_timeout(300)
    opened, _ = open_fixture(page, "exr_single.exr")
    assert opened
    r, g, b = page.evaluate(SAMPLE, [0, 12, 5])[:3]
    R, G, B = 12 / 23 * 4, 0.5, 0.25
    want = (1.70505 * R - 0.62179 * G - 0.08326 * B, -0.13026 * R + 1.14080 * G - 0.01055 * B, -0.02400 * R - 0.12897 * G + 1.15297 * B)
    assert all(math.isclose(a, w, abs_tol=0.01) for a, w in zip((r, g, b), want)), ((r, g, b), want)
