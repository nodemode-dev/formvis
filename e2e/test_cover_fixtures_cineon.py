from e2e.fixtures_support import PIXEL, near, open_fixture, steady

DEPTH = "window.formvis.engine.current.doc.depth"


def to_srgb(code):
    off = 10 ** ((95 - 685) * 0.002 / 0.6)
    lin = (10 ** ((code - 685) * 0.002 / 0.6) - off) / (1 - off)
    lin = min(1.0, max(0.0, lin))
    return round(255 * (12.92 * lin if lin <= 0.0031308 else 1.055 * lin ** (1 / 2.4) - 0.055))


@steady
def test_a_cineon_scan_written_by_hand_opens_with_its_size_depth_and_printing_density_values(page, tmp_path):
    opened, _ = open_fixture(page, "cineon_10bit.cin")
    assert opened
    assert page.evaluate("[window.formvis.engine.current.doc.width, window.formvis.engine.current.doc.height]") == [24, 16]
    assert page.evaluate(DEPTH) == 16
    for x, y in ((0, 0), (23, 0), (23, 15), (12, 8), (5, 14)):
        r, g = int(x / 23 * 1023), int(y / 15 * 1023)
        want = (to_srgb(r), to_srgb(g), to_srgb(512))
        got = page.evaluate(PIXEL, [x, y])
        assert near(got, want, 4), ((x, y), got, want)
