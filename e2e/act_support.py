import json

try:
    from e2e.files2_support import AGENT, PIXEL, SCENE, click_button, dialog_open, set_field, start, steady  # noqa: F401
except ImportError:
    from files2_support import AGENT, PIXEL, SCENE, click_button, dialog_open, set_field, start, steady  # noqa: F401

PANEL = ".cv-actions-panel"


def stored(page):
    return json.loads(page.evaluate("localStorage.getItem('formvis.actions') || '[]'"))


def open_panel(page):
    page.evaluate("window.formvis.commands.run('panel-actions')")
    page.wait_for_function("(() => { const p = document.querySelector('.cv-actions-panel'); return !!p && !!p.offsetParent; })()", timeout=10000)


def record(page, name, commands):
    page.fill(f"{PANEL} .cv-actions-name", name)
    page.click(f"{PANEL} [data-act=record]")
    for c in commands:
        page.evaluate(f"window.formvis.commands.run('{c}')")
        page.wait_for_timeout(400)
    page.click(f"{PANEL} [data-act=stop]")
    page.wait_for_timeout(300)


def px(page, x, y):
    return page.evaluate(PIXEL, [x, y])[:3]


def toast_text(page):
    return page.evaluate("[...document.querySelectorAll('.cv-toast')].map((t) => t.textContent).join('|')")


def undo_all(page, n=2):
    for _ in range(n):
        page.evaluate("window.formvis.commands.run('undo')")
        page.wait_for_timeout(150)


def dialog_pick(page, title):
    return f"[...document.querySelectorAll('.cv-dialog')].filter((d) => d.offsetParent && d.textContent.includes({json.dumps(title)})).pop()"


def dlg_button(page, label):
    r = page.evaluate("(l) => { const ds = [...document.querySelectorAll('.cv-dialog')].filter((d) => d.offsetParent), d = ds[ds.length - 1]; const b = [...d.querySelectorAll('button')].find((x) => x.textContent.trim() === l); if (!b) return 'none:' + [...d.querySelectorAll('button')].map((x) => x.textContent.trim()).join('|'); b.click(); return 'ok'; }", label)
    assert r == "ok", r
    page.wait_for_timeout(200)


def dlg_select(page, aria, value):
    r = page.evaluate("([a, v]) => { const ds = [...document.querySelectorAll('.cv-dialog')].filter((d) => d.offsetParent), d = ds[ds.length - 1]; const s = d.querySelector(`select[aria-label=\"${a}\"]`); if (!s) return 'no select ' + a; s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); return 'ok'; }", [aria, value])
    assert r == "ok", r
    page.wait_for_timeout(200)


def dlg_pick_step(page, index):
    page.evaluate("(i) => { const ds = [...document.querySelectorAll('.cv-dialog')].filter((d) => d.offsetParent), d = ds[ds.length - 1]; d.querySelectorAll('.cv-step-row .cv-step-label')[i].click(); }", index)
    page.wait_for_timeout(200)


def dlg_step_labels(page):
    return page.evaluate("(() => { const ds = [...document.querySelectorAll('.cv-dialog')].filter((d) => d.offsetParent), d = ds[ds.length - 1]; return [...d.querySelectorAll('.cv-step-row .cv-step-label')].map((x) => x.textContent); })()")
