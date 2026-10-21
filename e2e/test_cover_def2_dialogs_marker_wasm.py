# SC-ED-0269 confirmations open on Cancel for a destructive question and the arrow keys move between the buttons;
# PC-UI-0188 and PC-EN-0523 Place Scale Marker has a dialog with font, size, text position and colour that reach the layer;
# PC-AU-0136 the page loads no .wasm module at start.
import pytest
from playwright.sync_api import sync_playwright

CONFIRM = """async () => {
  const D = await import('/src/ui/dialogs.ts'), out = {};
  const key = (k) => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const q = D.confirmAction('Delete it?', 'Sure?', 'Delete', true);
  await wait(300);
  out.start = document.activeElement.textContent;
  key('ArrowRight'); await wait(100); out.right = document.activeElement.textContent;
  key('ArrowLeft'); await wait(100); out.left = document.activeElement.textContent;
  key('Escape'); out.escape = await q;
  const q2 = D.confirmAction('Fine?', 'Plain question', 'OK', false);
  await wait(300);
  out.plainStart = document.activeElement.textContent;
  document.activeElement.click();
  out.plain = await q2;
  return out;
}"""

MARKER = """async (via) => {
  const e = window.formvis.engine, c = window.formvis.commands, wait = (ms) => new Promise((r) => setTimeout(r, ms));
  e.newDocument(400, 200, 'S', 'white');
  c.run('measure-scale', { pixels: 100, length: 10, units: 'cm' });
  if (via === 'dialog') {
    c.run('measure-scale-marker'); await wait(400);
    const d = [...document.querySelectorAll('.cv-dialog')].find((x) => x.offsetParent && /Scale Marker/.test(x.textContent));
    const sel = d.querySelectorAll('select'), size = d.querySelector('input[type=number]');
    const names = [...d.querySelectorAll('.cv-dialog-row > span:first-child, .cv-field > span:first-child')].map((s) => s.textContent);
    sel[2].value = 'white'; sel[2].dispatchEvent(new Event('change', { bubbles: true }));
    size.value = '20'; size.dispatchEvent(new Event('input', { bubbles: true })); size.dispatchEvent(new Event('change', { bubbles: true }));
    [...d.querySelectorAll('button')].find((x) => x.textContent === 'OK').click();
    await wait(500);
    var fields = [...d.querySelectorAll('select')].length;
  } else {
    c.run('measure-scale-marker', via === 'plain' ? { length: 5, show_text: false } : { length: 5, show_text: false, color: 'white', font_size: 30 });
    await wait(300);
  }
  const l = e.current.doc.layers.find((x) => x.name === 'Measurement Scale Marker');
  if (!l) return null;
  const ctx = l.raster.ctx, w = ctx.canvas.width, h = ctx.canvas.height;
  let white = 0, black = 0;
  const px = ctx.getImageData(0, 0, w, h).data;
  for (let i = 0; i < px.length; i += 4) { if (px[i + 3] > 200) { if (px[i] > 200) white++; else if (px[i] < 50) black++; } }
  return { w, h, white, black, selects: typeof fields === 'number' ? fields : null };
}"""


def test_destructive_confirmation_opens_on_cancel_and_arrows_move_between_buttons(page):
    got = page.evaluate(CONFIRM)
    assert got["start"] == "Cancel"
    assert got["right"] == "Delete" and got["left"] == "Cancel"
    assert got["escape"] is False
    assert got["plainStart"] == "OK" and got["plain"] is True


def test_scale_marker_dialog_colour_and_font_size_reach_the_layer(page):
    got = page.evaluate(MARKER, "dialog")
    assert got is not None and got["selects"] == 3
    assert got["white"] > 0 and got["black"] == 0 or got["white"] > got["black"]
    assert got["h"] > 20


def test_scale_marker_parameters_choose_colour_and_size(page):
    plain = page.evaluate(MARKER, "plain")
    assert plain["w"] == 50 and plain["h"] == 4 and plain["black"] > 0 and plain["white"] == 0
    white = page.evaluate(MARKER, "white")
    assert white["w"] == 50 and white["h"] == 10 and white["white"] > 0 and white["black"] == 0


def test_no_wasm_module_is_requested_while_the_page_starts(context):
    import os
    url = os.environ.get("FORMVIS_E2E_URL", "http://127.0.0.1:5190")
    asked = []
    pg = context.new_page()
    pg.on("request", lambda r: asked.append(r.url) if ".wasm" in r.url else None)
    pg.goto(url + "/", wait_until="load")
    pg.wait_for_function("window.formvis && window.formvis.engine", timeout=90000)
    pg.wait_for_timeout(2500)
    assert asked == []
