import base64
import io
import zipfile

from PIL import Image

PX = "([x, y]) => Array.from(window.sonny.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data)"
SCENE = """async () => {
  const e = window.sonny.engine;
  e.newDocument(200, 120, 'Boards', 'transparent');
  const a1 = e.newArtboard();
  // a red block inside the first artboard, reaching past its right edge
  e.addLayer();
  const E = await import('/src/engine/index.ts');
  e.fg = { r: 220, g: 20, b: 20 };
  e.applySelection(E.SelectionMask.cropped(150, 40, 100, 40, new Uint8Array(4000).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect();
  const l = e.current.activeLayer;
  e.edit('into artboard', (p) => { p.updateLayer(l.id, { parentId: a1 }); return true; });
  const a2 = e.newArtboard();
  e.setArtboard(a2, { background: { r: 20, g: 40, b: 200 } });
  e.refresh();
  return [a1, a2];
}"""
CAPTURE = """async () => {
  const got = new Promise((resolve) => {
    const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      HTMLAnchorElement.prototype.click = orig;
      fetch(this.href).then((r) => r.arrayBuffer()).then((buf) => { let s = ''; new Uint8Array(buf).forEach((b) => { s += String.fromCharCode(b); }); resolve({ name: this.download, b64: btoa(s) }); });
    };
  });
  if (!window.sonny.commands.run('export-artboards')) throw new Error('export-artboards');
  return await Promise.race([got, new Promise((r) => setTimeout(() => r(null), 15000))]);
}"""


def test_artboards_clip_fill_grow_and_export(page):
    a1, a2 = page.evaluate(SCENE)
    doc = page.evaluate("[window.sonny.engine.current.doc.width, window.sonny.engine.current.doc.height]")
    assert doc == [500, 120], doc
    rects = page.evaluate("window.sonny.engine.artboards().map((l) => [l.name, l.artboard.x, l.artboard.w])")
    assert rects == [["Artboard 2", 300, 200], ["Artboard 1", 0, 200]], rects
    px = lambda x, y: page.evaluate(PX, [x, y])
    assert px(180, 60)[:3] == [220, 20, 20]            # red inside the artboard
    assert px(20, 20)[:3] == [255, 255, 255]           # its white background
    assert px(230, 60)[3] == 0                         # the red past its edge is clipped, the gap is empty
    assert px(400, 60)[:3] == [20, 40, 200]            # the second artboard's own background
    r = page.evaluate(CAPTURE)
    assert r and r["name"] == "Boards artboards.zip", r
    z = zipfile.ZipFile(io.BytesIO(base64.b64decode(r["b64"])))
    assert sorted(z.namelist()) == ["Artboard 1.png", "Artboard 2.png"]
    one = Image.open(io.BytesIO(z.read("Artboard 1.png"))).convert("RGBA")
    two = Image.open(io.BytesIO(z.read("Artboard 2.png"))).convert("RGBA")
    assert one.size == (200, 120) and two.size == (200, 120)
    assert one.getpixel((180, 60))[:3] == (220, 20, 20) and one.getpixel((20, 20))[:3] == (255, 255, 255)
    assert two.getpixel((100, 60))[:3] == (20, 40, 200)


def test_artboards_follow_moves_flips_resizes_and_saves(page):
    a1, _ = page.evaluate(SCENE)
    rect = lambda: page.evaluate("window.sonny.engine.artboards().find((l) => l.name === 'Artboard 1').artboard")
    # the Move tool drags the artboard and what it holds
    s = page.evaluate("""(id) => { const e = window.sonny.engine; e.selectLayer(id); e.setTool('move'); if (e.tool !== 'move') throw new Error('tool');
      const v = e.current.viewport, b = document.querySelector('.cv-stage').getBoundingClientRect(); return [b.left + v.panX, b.top + v.panY, v.zoom]; }""", a1)
    at = lambda x, y: (s[0] + x * s[2], s[1] + y * s[2])
    page.mouse.move(*at(180, 60)); page.mouse.down(); page.mouse.move(*at(190, 70), steps=5); page.mouse.up()
    page.wait_for_timeout(300)
    r = rect()
    assert (r["x"], r["y"]) == (10, 10), r
    assert page.evaluate(PX, [190, 70])[:3] == [220, 20, 20]
    # Flip Canvas mirrors it, Canvas Size shifts it, Image Size scales it
    page.evaluate("window.sonny.engine.flipCanvas(true)")
    r = rect()
    assert r["x"] == 500 - 10 - 200, r
    page.evaluate("window.sonny.engine.resizeCanvas(520, 140, 20, 20)")
    assert (rect()["x"], rect()["y"]) == (310, 30)
    before = rect()
    page.evaluate("window.sonny.engine.resampleImage(260, 70, 'smooth', 72)")
    after = rect()
    assert (after["x"], after["w"], after["h"]) == (round(before["x"] / 2), 100, round(before["h"] / 2)), (before, after)
    # a .sny round trip keeps the artboards
    back = page.evaluate("""async () => { const e = window.sonny.engine, io = await import('/src/io/project-io.ts');
      const { manifest, files } = await io.serialize(e.current.doc, e.current.activeId), m = new Map(files.map((f) => [f.name, f.blob]));
      const d = (await io.deserialize(manifest, (n) => Promise.resolve(m.get(n)))).doc;
      return d.layers.filter((l) => l.artboard).map((l) => [l.name, l.artboard.background && l.artboard.background.b]); }""")
    assert sorted(back) == [["Artboard 1", 255], ["Artboard 2", 200]], back
