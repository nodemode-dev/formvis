import base64

import pytest

from e2e.test_select_subject import _engine_up

HEADS = {"webp": [b"RIFF"], "tiff": [b"II*\x00", b"MM\x00*"], "pdf": [b"%PDF-"], "avif": [b"\x00\x00\x00"]}
CAPTURE = """async (kind) => {
  const e = window.formvis.engine;
  e.newDocument(40, 30, 'Out', 'white'); e.fg = { r: 200, g: 100, b: 50 }; e.fill('fg');
  const got = new Promise((resolve) => {
    const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      HTMLAnchorElement.prototype.click = orig;
      fetch(this.href).then((r) => r.arrayBuffer()).then((buf) => {
        let s = ''; new Uint8Array(buf).forEach((b) => { s += String.fromCharCode(b); });
        resolve({ name: this.download, b64: btoa(s) });
      });
    };
  });
  window.formvis.commands.run('export-' + kind);
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
