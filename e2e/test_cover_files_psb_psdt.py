import base64
import functools

from playwright.sync_api import Error as PlaywrightError

from e2e.test_cover_files_flat_formats import CAPTURE, PIXEL, near, open_file


def steady(fn):
    @functools.wraps(fn)
    def run(page, tmp_path):
        for attempt in range(3):
            try:
                return fn(page, tmp_path)
            except PlaywrightError as err:
                if "context was destroyed" not in str(err) or attempt == 2:
                    raise
                page.wait_for_function("window.formvis && window.formvis.engine", timeout=60000)
    return run


SCENE = """async () => {
  const e = window.formvis.engine, E = await import('/src/engine/index.ts');
  e.newDocument(16, 12, 'Lay', 'white'); e.fg = { r: 220, g: 30, b: 30 }; e.fill('fg');
  e.addLayer({ name: 'Blue half', blend: 'multiply', opacity: 0.5 }); e.fg = { r: 30, g: 40, b: 220 };
  e.applySelection(E.SelectionMask.cropped(8, 0, 8, 12, new Uint8Array(96).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect();
}"""
LAYERS = """() => window.formvis.engine.current.doc.layers.map((l) => [l.name, l.blend, Math.round(l.opacity * 100)])"""


@steady
def test_psb_and_a_renamed_psdt_open_with_their_layers_blend_and_opacity(page, tmp_path):
    for cmd, ext in [("export-psb", "psb"), ("export-psd", "psdt")]:
        page.evaluate(SCENE)
        want = page.evaluate(LAYERS)
        r = page.evaluate(CAPTURE, cmd)
        assert r
        data = base64.b64decode(r["b64"])
        assert data[:4] == b"8BPS" and data[5] == (2 if cmd == "export-psb" else 1)
        f = tmp_path / f"saved.{ext}"
        f.write_bytes(data)
        assert open_file(page, f) == [16, 12]
        got = page.evaluate(LAYERS)
        assert got == want and got[-1] == ["Blue half", "multiply", 50], (cmd, got)
        assert near(page.evaluate(PIXEL, [3, 3]), (220, 30, 30), 2)
        mixed = page.evaluate(PIXEL, [12, 8])
        assert mixed[2] > mixed[1] and mixed[0] < 220, mixed
