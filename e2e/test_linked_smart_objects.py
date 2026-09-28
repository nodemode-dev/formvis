FLOW = """async () => {
  const e = window.formvis.engine, L = await import('/src/io/links.ts');
  const png = async (rgb) => { const c = new OffscreenCanvas(40, 30), g = c.getContext('2d'); g.fillStyle = rgb; g.fillRect(0, 0, 40, 30); return c.convertToBlob({ type: 'image/png' }); };
  e.newDocument(200, 100, 'L', 'white');
  let file = new File([await png('rgb(220,30,30)')], 'art.png', { type: 'image/png', lastModified: 1000 });
  const source = { name: 'art.png', live: true, getFile: async () => file };
  L.registerLinkSource('link-test', source);
  await L.placeLinked(e, 'link-test', source);
  const px = () => Array.from(e.flattened().getContext('2d').getImageData(100, 50, 1, 1).data).slice(0, 3);
  const l = () => e.current.activeLayer;
  const out = { placed: [l().name, l().smart.link.name, l().smart.link.lastModified, e.historySteps.names.slice(-1)[0]], red: px() };
  out.same = await L.updateLinked(e);
  file = new File([await png('rgb(30,30,220)')], 'art.png', { type: 'image/png', lastModified: 2000 });
  out.changed = await L.updateLinked(e);
  await new Promise((r) => setTimeout(r, 100));
  out.blue = px(); out.step = e.historySteps.names.slice(-1)[0]; out.newTime = l().smart.link.lastModified;
  const io = await import('/src/io/project-io.ts'), { manifest, files } = await io.serialize(e.current.doc, e.current.activeId), m = new Map(files.map((f) => [f.name, f.blob]));
  const d = (await io.deserialize(manifest, (n) => Promise.resolve(m.get(n)))).doc;
  out.saved = d.layers[d.layers.length - 1].smart.link;
  e.undo(); await new Promise((r) => setTimeout(r, 50)); out.undone = px();
  e.redo(); window.formvis.commands.run('embed-linked'); out.embedded = l().smart.link; out.stillBlue = px();
  return out;
}"""


def test_place_linked_update_modified_content_save_and_embed(page):
    r = page.evaluate(FLOW)
    assert r["placed"] == ["art", "art.png", 1000, "Place Linked"], r
    assert r["red"][0] > 200 and r["red"][2] < 60
    assert r["same"] == {"updated": 0, "missing": []}
    assert r["changed"] == {"updated": 1, "missing": []}
    assert r["blue"][2] > 200 and r["blue"][0] < 60 and r["step"] == "Update Modified Content" and r["newTime"] == 2000, r
    assert r["saved"] == {"id": "link-test", "name": "art.png", "size": r["saved"]["size"], "lastModified": 2000} and r["saved"]["size"] > 0
    assert r["undone"][0] > 200
    assert r["embedded"] is None and r["stillBlue"][2] > 200


def test_a_link_whose_source_is_gone_is_reported(page):
    r = page.evaluate("""async () => {
      const e = window.formvis.engine, L = await import('/src/io/links.ts'), E = await import('/src/engine/index.ts');
      e.newDocument(100, 60, 'M', 'white');
      const r = new E.Raster(10, 10); r.ctx.fillStyle = '#0f0'; r.ctx.fillRect(0, 0, 10, 10);
      e.placeLinked(r, { id: 'nowhere-' + Math.random(), name: 'gone.png', size: 5, lastModified: 1 }, 'gone');
      return L.updateLinked(e);
    }""")
    assert r == {"updated": 0, "missing": ["gone.png"]}, r
