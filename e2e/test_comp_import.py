import base64
import io
import json
import zipfile

# A document with a folder, a Multiply layer at half opacity with a mask, a hidden clipped layer and an active layer,
# written by formvis's own serializer (the .comp layout is the one formvis's format shares), then labelled as a .comp.
BUILD = """async () => {
  const S = await import('/src/io/project-io.ts'), e = window.formvis.engine;
  e.newDocument(60, 40, 'Src', 'white');
  const p = e.current, base = p.activeId;
  e.addLayer(); const top = p.activeId;
  p.selectedIds = new Set([base, top]); e.groupLayers();
  p.updateLayer(base, { blend: 'multiply', opacity: 0.5 });
  p.updateLayer(top, { visible: false, clipId: base });
  p.activeId = top;
  const out = await S.serialize(p.doc, p.activeId);
  const files = {};
  for (const f of out.files) { const b = new Uint8Array(await f.blob.arrayBuffer()); let s = ''; for (const x of b) s += String.fromCharCode(x); files[f.name] = btoa(s); }
  const layers = p.doc.layers.map((l) => ({ id: l.id, name: l.name, blend: l.blend, opacity: l.opacity, visible: l.visible, clip: l.clipId ?? null, parent: l.parentId ?? null, group: !!l.isGroup }));
  return { manifest: out.manifest, files, layers };
}"""


def test_a_dropped_comp_project_opens_with_every_property(page):
    src = page.evaluate(BUILD)
    manifest = dict(src["manifest"], format="com.example.project", version=7)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("manifest.json", json.dumps(manifest))
        for name, b64 in src["files"].items():
            z.writestr(f"images/{name}", base64.b64decode(b64))
    page.evaluate("""(b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)), dt = new DataTransfer();
      dt.items.add(new File([bytes], 'Old Work.comp', { type: '' }));
      const t = document.querySelector('.cv-stage') || document.body, r = t.getBoundingClientRect();
      for (const type of ['dragenter', 'dragover', 'drop']) t.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + 10, clientY: r.top + 10 }));
    }""", base64.b64encode(buf.getvalue()).decode())
    page.wait_for_function("window.formvis.engine.current?.name === 'Old Work'", timeout=15000)
    got = page.evaluate("""() => { const p = window.formvis.engine.current;
      return { layers: p.doc.layers.map((l) => ({ id: l.id, name: l.name, blend: l.blend, opacity: l.opacity, visible: l.visible, clip: l.clipId ?? null, parent: l.parentId ?? null, group: !!l.isGroup })),
        active: p.activeId, size: [p.doc.width, p.doc.height] }; }""")
    assert got["layers"] == src["layers"], (got["layers"], src["layers"])      # every layer and property, as written
    assert got["size"] == [60, 40]
    assert any(l["group"] for l in got["layers"]) and any(l["clip"] for l in got["layers"]), got   # the folder and the clip came through
