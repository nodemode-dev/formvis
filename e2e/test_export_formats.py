import base64

import pytest

from e2e.test_select_subject import _engine_up

HEADS = {"webp": [b"RIFF"], "tiff": [b"II*\x00", b"MM\x00*"], "pdf": [b"%PDF-"], "avif": [b"\x00\x00\x00"]}
CAPTURE = """async (kind) => {
  const e = window.formvis.engine;
  e.newDocument(40, 30, 'Out', 'white'); e.fg = { r: 200, g: 100, b: 50 }; e.fill('fg');
  const got = new Promise((resolve) => {
    // The file itself, caught as it is made (the app frees its address right after the click, so fetching the address
    // afterwards could lose the race and hang; 1.50.8).
    const make = URL.createObjectURL, click = HTMLAnchorElement.prototype.click; let made = null;
    URL.createObjectURL = function (b) { made = b; return make.call(URL, b); };
    HTMLAnchorElement.prototype.click = function () {
      URL.createObjectURL = make; HTMLAnchorElement.prototype.click = click;
      const name = this.download, blob = made;
      if (!blob) { resolve(null); return; }
      blob.arrayBuffer().then((buf) => { let s = ''; new Uint8Array(buf).forEach((c) => { s += String.fromCharCode(c); }); resolve({ name, b64: btoa(s) }); }, () => resolve(null));
    };
  });
  // Engine exports are enabled once the app has found the engine, just after it starts; run the command when it is
  // (1.50.8: fired too early, it did nothing, and the wait timed out).
  for (let i = 0; i < 100 && !window.formvis.commands.run('export-' + kind); i++) await new Promise((r) => setTimeout(r, 100));
  return await Promise.race([got, new Promise((r) => setTimeout(() => r(null), 20000))]);
}"""


@pytest.mark.parametrize("kind", ["webp", "tiff", "pdf", "avif"])
def test_export_delivers_a_real_file(page, kind):
    if kind != "webp" and not _engine_up():
        pytest.skip("needs the engine on 8190 (./formvis backend)")
    r = page.evaluate(CAPTURE, kind)
    assert r is not None, "nothing was delivered"
    data = base64.b64decode(r["b64"])
    assert r["name"] == f"Out.{'tif' if kind == 'tiff' else kind}"
    assert any(data.startswith(h) for h in HEADS[kind]), data[:12]
    if kind == "avif":
        assert b"ftypavif" in data[:32]
