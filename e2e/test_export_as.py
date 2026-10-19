CAPTURE = """async ([preset, transparent]) => {
  const e = window.formvis.engine;
  e.newDocument(120, 80, 'Shot', transparent ? 'transparent' : 'white');
  if (!transparent) { e.fg = { r: 200, g: 100, b: 50 }; e.fill('fg'); }
  const got = new Promise((resolve) => {
    const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      HTMLAnchorElement.prototype.click = orig;
      fetch(this.href).then((r) => r.blob()).then(async (b) => {
        const bmp = await createImageBitmap(b), c = new OffscreenCanvas(bmp.width, bmp.height), x = c.getContext('2d');
        x.drawImage(bmp, 0, 0);
        resolve({ name: this.download, type: b.type, w: bmp.width, h: bmp.height, px: Array.from(x.getImageData(1, 1, 1, 1).data) });
      });
    };
  });
  window.formvis.commands.run('export-as');
  await new Promise((r) => setTimeout(r, 200));
  const dlg = document.querySelector('.cv-scrim:not([hidden]) .cv-dialog'), sel = dlg.querySelectorAll('select')[1];
  sel.value = preset; sel.dispatchEvent(new Event('change', { bubbles: true }));
  [...dlg.querySelectorAll('.cv-dialog-foot button')].find((b) => b.textContent === 'Export').click();
  return await Promise.race([got, new Promise((r) => setTimeout(() => r(null), 20000))]);
}"""


def test_presets_set_format_scale_and_name(page):
    r = page.evaluate(CAPTURE, ["webp-half", False])
    assert r["name"] == "Shot@0.5x.webp" and r["type"] == "image/webp" and (r["w"], r["h"]) == (60, 40), r
    r = page.evaluate(CAPTURE, ["png-2x", False])
    assert r["name"] == "Shot 2@2x.png" and (r["w"], r["h"]) == (240, 160) and r["px"][:3] == [200, 100, 50], r


def test_jpeg_is_flattened_on_white(page):
    r = page.evaluate(CAPTURE, ["jpg-web", True])
    assert r["name"] == "Shot.jpg" and all(v > 245 for v in r["px"][:3]), r


def test_save_and_delete_a_preset(page):
    r = page.evaluate("""async () => {
      window.formvis.engine.newDocument(50, 50, 'P', 'white');
      window.formvis.commands.run('export-as');
      await new Promise((r) => setTimeout(r, 200));
      const dlg = document.querySelector('.cv-scrim:not([hidden]) .cv-dialog'), selects = dlg.querySelectorAll('select');
      selects[2].value = 'avif'; selects[2].dispatchEvent(new Event('change', { bubbles: true }));
      const name = dlg.querySelector('input[placeholder="Preset name"]'); name.value = 'My AVIF'; name.dispatchEvent(new Event('input', { bubbles: true }));
      const btn = (t) => [...dlg.querySelectorAll('button')].find((b) => b.textContent === t);
      const qualityDisabledForPng = (() => { selects[2].value = 'png'; selects[2].dispatchEvent(new Event('change', { bubbles: true })); const d = dlg.querySelector('input[type=range]').disabled; selects[2].value = 'avif'; selects[2].dispatchEvent(new Event('change', { bubbles: true })); return d; })();
      btn('Save Preset').click();
      const stored = JSON.parse(localStorage.getItem('formvis.exportPresets'));
      const listed = [...selects[1].options].some((o) => o.textContent === 'My AVIF');
      const deleteOn = !btn('Delete Preset').disabled;
      btn('Delete Preset').click();
      return { stored: stored.map((p) => [p.name, p.format]), listed, deleteOn, after: JSON.parse(localStorage.getItem('formvis.exportPresets')).length, qualityDisabledForPng,
               gone: ![...selects[1].options].some((o) => o.textContent === 'My AVIF') };
    }""")
    assert r == {"stored": [["My AVIF", "avif"]], "listed": True, "deleteOn": True, "after": 0, "qualityDisabledForPng": True, "gone": True}, r
