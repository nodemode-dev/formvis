import io

from PIL import Image

SMART = """async () => {
  const e = window.formvis.engine, E = await import('/src/engine/index.ts');
  e.newDocument(200, 100, 'S', 'transparent');
  e.addLayer(); e.fg = { r: 220, g: 30, b: 30 };
  e.applySelection(E.SelectionMask.cropped(80, 30, 40, 40, new Uint8Array(1600).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect();
  window.formvis.commands.run('convert-smart');
  const l = e.current.activeLayer; return [!!l.smart, l.transform.w, l.transform.h, l.transform.x + l.transform.w / 2, l.transform.y + l.transform.h / 2];
}"""


def test_replace_contents_through_the_file_input(page, tmp_path):
    before = page.evaluate(SMART)
    assert before[0] is True
    png = tmp_path / "blue.png"
    Image.new("RGBA", (before[1] * 2, before[2] // 2), (30, 30, 220, 255)).save(png)
    assert page.evaluate("window.formvis.commands.run('replace-contents')") is True
    page.set_input_files("input[data-role=replace-contents]", str(png))
    page.wait_for_function("window.formvis.engine.historySteps.names.slice(-1)[0] === 'Replace Contents'", timeout=10000)
    after = page.evaluate("(() => { const l = window.formvis.engine.current.activeLayer, t = l.transform; return [t.w, t.h, t.x + t.w / 2, t.y + t.h / 2, l.smart.source.width]; })()")
    assert after[:2] == [before[1] * 2, before[2] // 2] and after[2:4] == before[3:5] and after[4] == before[1] * 2, (before, after)
    px = page.evaluate("Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(100, 50, 1, 1).data)")
    assert px[2] > 200 and px[0] < 60
    page.evaluate("window.formvis.engine.undo()")
    px = page.evaluate("Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(100, 50, 1, 1).data)")
    assert px[0] > 200 and px[2] < 60


EDGE = """async () => {
  const e = window.formvis.engine, E = await import('/src/engine/index.ts');
  e.newDocument(200, 100, 'M', 'white');
  const l = e.current.activeLayer, c = l.raster.ctx;
  c.fillStyle = '#000'; c.fillRect(0, 0, 100, 100); l.raster.touch(); e.refresh();
  window.formvis.commands.run('convert-smart');
  e.addSmartFilter('gaussianBlur', { radius: 12 });
  const at = (x) => e.flattened().getContext('2d').getImageData(x, 50, 1, 1).data[0];
  const blurred = at(96);
  e.applySelection(E.SelectionMask.cropped(100, 0, 100, 100, new Uint8Array(10000).fill(255)), 'replace', 's');
  window.formvis.commands.run('add-filter-mask'); e.deselect();
  return { blurred, masked: at(96), right: at(104), step: e.historySteps.names.slice(-2)[0] };
}"""


def test_filter_mask_keeps_the_filter_off_where_it_is_clear(page):
    r = page.evaluate(EDGE)
    assert r["blurred"] > 30, r
    assert r["masked"] < 5 and r["right"] < 250, r
    assert r["step"] == "Add Smart Filter Mask", r
    rt = page.evaluate("""async () => { const io = await import('/src/io/project-io.ts'), e = window.formvis.engine;
      const { manifest, files } = await io.serialize(e.current.doc, e.current.activeId), m = new Map(files.map((f) => [f.name, f.blob]));
      const d = (await io.deserialize(manifest, (n) => Promise.resolve(m.get(n)))).doc, s = d.layers[d.layers.length - 1].smart;
      return [!!s.filterMask, s.filterMaskEnabled, s.filterMask && s.filterMask.width]; }""")
    assert rt == [True, True, 200], rt
    page.evaluate("window.formvis.commands.run('toggle-filter-mask')")
    assert page.evaluate("window.formvis.engine.flattened().getContext('2d').getImageData(96, 50, 1, 1).data[0]") > 30
    page.evaluate("window.formvis.commands.run('delete-filter-mask')")
    assert page.evaluate("!!window.formvis.engine.current.activeLayer.smart.filterMask") is False
