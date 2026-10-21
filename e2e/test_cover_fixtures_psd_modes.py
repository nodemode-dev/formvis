import psd_tools

from e2e.fixtures_support import FX, PIXEL, near, open_fixture, steady

DOC = """() => { const d = window.formvis.engine.current.doc; return { w: d.width, h: d.height, mode: d.mode || null, depth: d.depth || 8, palette: d.palette ? d.palette.length : 0, profile: d.profile ? d.profile.name : null, layers: d.layers.length }; }"""


def truth(name, x, y):
    im = psd_tools.PSDImage.open(FX / name).topil().convert("RGB")
    return im.getpixel((x, y))


@steady
def test_grayscale_and_indexed_psds_from_a_hand_written_layout_keep_their_mode_and_pixels(page, tmp_path):
    opened, report = open_fixture(page, "psd_mode_gray_rle.psd")
    assert opened
    d = page.evaluate(DOC)
    assert (d["w"], d["h"], d["mode"]) == (32, 24, "grayscale"), d
    for x in (0, 15, 31):
        assert near(page.evaluate(PIXEL, [x, 5]), truth("psd_mode_gray_rle.psd", x, 5), 2), x
    opened, report = open_fixture(page, "psd_mode_indexed_rle.psd")
    d = page.evaluate(DOC)
    assert d["mode"] == "indexed" and d["palette"] == 256, d
    assert "Indexed Color with 256 colors" in report
    for x in (0, 1, 2, 3):
        assert near(page.evaluate(PIXEL, [x, 3]), truth("psd_mode_indexed_rle.psd", x, 3), 1), x
    assert page.evaluate(PIXEL, [1, 3])[:3] == [60, 195, 164]


@steady
def test_an_indexed_psd_with_a_raw_merged_image_opens_as_indexed_with_its_palette(page, tmp_path):
    opened, report = open_fixture(page, "psd_mode_indexed.psd")
    assert opened
    d = page.evaluate(DOC)
    assert (d["w"], d["h"], d["mode"], d["palette"], d["layers"]) == (32, 24, "indexed", 256, 1), d
    assert report and "Indexed Color with 256 colors" in report, report
    assert "damaged" not in report, report
    for x in (0, 1, 2, 3):
        assert near(page.evaluate(PIXEL, [x, 3]), truth("psd_mode_indexed.psd", x, 3), 1), x
    assert page.evaluate(PIXEL, [1, 3])[:3] == [60, 195, 164]
    assert page.evaluate("window.formvis.engine.current.doc.palette[1]") == {"r": 1, "g": 254, "b": 7}


@steady
def test_bitmap_psd_opens_whole_as_bitmap_with_black_and_white_halves(page, tmp_path):
    opened, report = open_fixture(page, "psd_mode_bitmap.psd")
    assert opened
    assert "cut short" not in report, report
    assert page.evaluate(DOC)["mode"] == "bitmap"
    for x in (2, 14, 17, 30):
        assert near(page.evaluate(PIXEL, [x, 8]), truth("psd_mode_bitmap.psd", x, 8), 2), x


@steady
def test_sixteen_bit_psd_opens_at_16_bits_with_the_stored_samples(page, tmp_path):
    opened, report = open_fixture(page, "psd_mode_rgb16.psd")
    assert opened
    d = page.evaluate(DOC)
    assert d["depth"] == 16 and "16 bits" in report
    assert near(page.evaluate(PIXEL, [5, 5]), (155, 78, 39), 2)


@steady
def test_cmyk_lab_multichannel_and_duotone_psds_open_in_their_own_modes(page, tmp_path):
    for name, mode in (("psd_mode_cmyk_layered.psd", "cmyk"), ("psd_mode_lab.psd", "lab"), ("psd_mode_multichannel.psd", "multichannel"), ("psd_mode_duotone.psd", "duotone")):
        opened, report = open_fixture(page, name)
        assert opened, name
        page.wait_for_function("window.formvis.engine.current.doc.layers.length > 0", timeout=15000)
        d = page.evaluate(DOC)
        assert d["mode"] == mode and (d["w"], d["h"]) == (32, 24), (name, d)
        if mode in ("multichannel", "duotone"):
            assert report and mode.capitalize() in report, report
        px = page.evaluate(PIXEL, [4, 4])
        if mode == "cmyk":
            assert page.evaluate("window.formvis.engine.current.doc.layers[0].name") == "Ink layer"
        if mode == "cmyk":
            assert d["profile"] and px[2] > px[0] + 40, px
        if mode == "lab":
            assert px[1] + 30 < px[0] and px[1] + 30 < px[2], px


@steady
def test_a_large_document_format_psb_without_layers_opens_with_its_merged_image(page, tmp_path):
    opened, report = open_fixture(page, "psd_plain.psb")
    assert opened
    d = page.evaluate(DOC)
    assert (d["w"], d["h"]) == (32, 24)
    assert near(page.evaluate(PIXEL, [3, 3]), (10, 200, 90), 2)
