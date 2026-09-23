import base64

CAPTURE = """async () => {
  const e = window.sonny.engine;
  e.newDocument(90, 60, 'Trip', 'white'); e.addLayer(); e.fg = { r: 200, g: 40, b: 40 };
  const E = await import('/src/engine/index.ts');
  e.applySelection(E.SelectionMask.cropped(10, 10, 20, 20, new Uint8Array(400).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect();
  const got = new Promise((resolve) => {
    const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      HTMLAnchorElement.prototype.click = orig;
      fetch(this.href).then((r) => r.arrayBuffer()).then((buf) => { let s = ''; new Uint8Array(buf).forEach((b) => { s += String.fromCharCode(b); }); resolve({ name: this.download, b64: btoa(s) }); });
    };
  });
  if (!window.sonny.commands.run('download-project')) throw new Error('command');
  return await Promise.race([got, new Promise((r) => setTimeout(() => r(null), 15000))]);
}"""


def test_projects_download_as_sny_and_open_again(page, tmp_path):
    r = page.evaluate(CAPTURE)
    assert r and r["name"] == "Trip.sny", r
    data = base64.b64decode(r["b64"])
    assert data[:2] == b"PK"
    f = tmp_path / "Trip.sny"
    f.write_bytes(data)
    count = page.evaluate("window.sonny.engine.projects.length")
    page.set_input_files("input[type=file][accept*='.sny']:not([data-role])", str(f))
    page.wait_for_function(f"window.sonny.engine.projects.length > {count}", timeout=15000)
    opened = page.evaluate("(() => { const e = window.sonny.engine; return [e.current.doc.width, e.current.doc.layers.length, Array.from(e.flattened().getContext('2d').getImageData(20, 20, 1, 1).data).slice(0, 3)]; })()")
    assert opened == [90, 2, [200, 40, 40]], opened
