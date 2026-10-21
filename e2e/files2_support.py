import base64
import functools
import io
import zipfile

from playwright.sync_api import Error as PlaywrightError

HOOK = """() => {
  if (window.__hooked) { window.__got = []; return; }
  window.__hooked = true; window.__got = [];
  const make = URL.createObjectURL, click = HTMLAnchorElement.prototype.click, blobs = new Map();
  URL.createObjectURL = function (b) { const u = make.call(URL, b); blobs.set(u, b); return u; };
  HTMLAnchorElement.prototype.click = function () {
    const name = this.download, href = this.href;
    if (!name) return click.call(this);
    const p = blobs.has(href) ? blobs.get(href).arrayBuffer() : fetch(href).then((r) => r.arrayBuffer());
    p.then((buf) => { let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); window.__got.push({ name, b64: btoa(s) }); });
  };
}"""
FIELD = """([label, value]) => {
  const dlgs = [...document.querySelectorAll('.cv-dialog')].filter((d) => d.offsetParent), dlg = dlgs[dlgs.length - 1];
  const f = [...dlg.querySelectorAll('.cv-field')].find((x) => { const t = (x.querySelector('span') || {}).textContent || ''; return t.trim() === label; });
  if (!f) return 'no field ' + label + ' in ' + [...dlg.querySelectorAll('.cv-field span')].map((s) => s.textContent).join('|');
  const sel = f.querySelector('select'), chk = f.querySelector('input[type=checkbox]'), num = f.querySelector('input.cv-num'), txt = f.querySelector('input.cv-input');
  if (sel) { sel.value = value; sel.dispatchEvent(new Event('change', { bubbles: true })); }
  else if (chk) { if (chk.checked !== value) { chk.checked = value; chk.dispatchEvent(new Event('change', { bubbles: true })); } }
  else if (num) { num.value = value; num.dispatchEvent(new Event('input', { bubbles: true })); num.dispatchEvent(new Event('change', { bubbles: true })); }
  else if (txt) { txt.value = value; txt.dispatchEvent(new Event('input', { bubbles: true })); }
  return 'ok';
}"""
CLICK = """(label) => {
  const dlgs = [...document.querySelectorAll('.cv-dialog')].filter((d) => d.offsetParent), dlg = dlgs[dlgs.length - 1];
  const b = [...dlg.querySelectorAll('button')].find((x) => x.textContent.trim() === label);
  if (!b) return 'no button ' + label + ' in ' + [...dlg.querySelectorAll('button')].map((x) => x.textContent).join('|');
  b.click(); return 'ok';
}"""
DLG = """() => { const d = [...document.querySelectorAll('.cv-dialog')].filter((x) => x.offsetParent); const t = d[d.length - 1]; return t ? { text: t.textContent.slice(0, 400), fields: [...t.querySelectorAll('.cv-field span')].map((s) => s.textContent) } : null; }"""
PIXEL = """([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data)"""


def steady(fn):
    @functools.wraps(fn)
    def run(page, tmp_path, **kw):
        for attempt in range(3):
            try:
                return fn(page, tmp_path, **kw)
            except PlaywrightError as err:
                if "context was destroyed" not in str(err) or attempt == 2:
                    raise
                page.wait_for_function("window.formvis && window.formvis.engine", timeout=60000)
    return run


def start(page):
    page.wait_for_function("window.formvis && window.formvis.engine", timeout=120000)
    page.evaluate(HOOK)


def dialog_open(page, name):
    for _ in range(3):
        if page.evaluate("[...document.querySelectorAll('.cv-dialog')].some((d) => d.offsetParent)"):
            page.keyboard.press("Escape")
            page.wait_for_timeout(250)
    page.evaluate(AGENT)
    page.evaluate(f"window.formvis.commands.run('{name}')")
    page.evaluate(AGENT)
    page.wait_for_function("(() => { const d = [...document.querySelectorAll('.cv-dialog')].filter((x) => x.offsetParent); return d.length && d[d.length - 1].querySelector('.cv-field, input[type=file]'); })()", timeout=10000)
    page.wait_for_timeout(300)


AGENT = """() => { const d = [...document.querySelectorAll('.cv-dialog')].filter((x) => x.offsetParent && x.textContent.includes('outside agent')).pop(); if (!d) return false; [...d.querySelectorAll('button')].find((b) => b.textContent.trim() === "Don't").click(); return true; }"""


def set_field(page, label, value):
    r = page.evaluate(FIELD, [label, value])
    if r != "ok" and page.evaluate(AGENT):
        page.wait_for_timeout(300)
        r = page.evaluate(FIELD, [label, value])
    assert r == "ok", r
    page.wait_for_timeout(120)


def click_button(page, label):
    r = page.evaluate(CLICK, label)
    if r != "ok" and page.evaluate(AGENT):
        page.wait_for_timeout(300)
        r = page.evaluate(CLICK, label)
    assert r == "ok", r


def downloads(page, count=1, timeout=30000):
    page.wait_for_function(f"window.__got.length >= {count}", timeout=timeout)
    page.wait_for_timeout(300)
    got = page.evaluate("window.__got")
    return [(g["name"], base64.b64decode(g["b64"])) for g in got]


def zip_of(data):
    z = zipfile.ZipFile(io.BytesIO(data))
    return {n: z.read(n) for n in z.namelist()}


SCENE = """async () => { const e = window.formvis.engine, E = await import('/src/engine/index.ts');
 e.newDocument(16, 12, 'Ex', 'white'); e.fg = {r:220,g:30,b:30}; e.fill('fg'); e.addLayer({name:'Top'}); e.fg = {r:30,g:40,b:220};
 e.applySelection(E.SelectionMask.cropped(8,0,8,12,new Uint8Array(96).fill(255)),'replace','s'); e.fill('fg'); e.deselect(); }"""
RED, BLUE = (220, 30, 30), (30, 40, 220)


def scene(page):
    start(page)
    page.evaluate(SCENE)
