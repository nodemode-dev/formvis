# D18: Image > Mode > RGB from an 8-bit CMYK document uses the intent and black point compensation set in Color Settings.
# A saturated cyan patch is outside sRGB, so Relative Colorimetric with BPC and Absolute Colorimetric without it give different RGB.
from PIL import Image

OPEN = """async (path) => 1"""

READ = """async (settings) => {
  const P = await import('/src/ui/prefs.ts'), e = window.formvis.engine, wait = (ms) => new Promise((r) => setTimeout(r, ms));
  P.updatePrefs({ colour: { ...P.loadPrefs().colour, ...settings, askMode: false } });
  const p = e.current;
  if (p.doc.mode !== 'cmyk') return { mode: p.doc.mode };
  window.formvis.commands.run('mode-rgb');
  for (let i = 0; i < 60 && e.current.doc.mode !== 'rgb'; i++) await wait(250);
  const l = e.current.doc.layers.find((x) => x.raster) || e.current.doc.layers[0];
  const d = l.raster.ctx.getImageData(2, 2, 1, 1).data;
  return { mode: e.current.doc.mode, px: [d[0], d[1], d[2]] };
}"""


def open_cmyk(page, tmp_path, name):
    f = tmp_path / name
    Image.new("CMYK", (16, 16), (255, 0, 0, 0)).save(f, "TIFF")
    count = page.evaluate("window.formvis.engine.projects.length")
    page.set_input_files("input[data-role='open-files']", str(f))
    page.wait_for_function(f"window.formvis.engine.projects.length > {count}", timeout=30000)
    page.wait_for_function("window.formvis.engine.current && window.formvis.engine.current.doc.mode === 'cmyk'", timeout=30000)


def test_cmyk_to_rgb_follows_the_colour_settings_intent_and_black_point(page, tmp_path):
    open_cmyk(page, tmp_path, "c1.tif")
    a = page.evaluate(READ, {"intent": "relative", "bpc": True})
    assert a["mode"] == "rgb"
    open_cmyk(page, tmp_path, "c2.tif")
    b = page.evaluate(READ, {"intent": "absolute", "bpc": False})
    assert b["mode"] == "rgb"
    assert a["px"] != b["px"]
    page.evaluate("async () => { const P = await import('/src/ui/prefs.ts'); P.updatePrefs({ colour: { ...P.loadPrefs().colour, intent: 'relative', bpc: true } }); }")
