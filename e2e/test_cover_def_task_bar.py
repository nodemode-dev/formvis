# D24: the Contextual Task Bar took clicks on the canvas around it; only its own box takes the pointer.
# D25: the bar's More button jumped sideways when a document opened.
# D29: Print One Copy skips formvis's dialog only; its description says the system dialog still opens.
import os
from pathlib import Path

REPO = Path(os.environ.get("FORMVIS_REPO", Path(__file__).resolve().parents[1]))

BAR = "(() => { const r = document.querySelector('.cv-taskbar').getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })()"
MORE = "(() => { const r = document.querySelector('.cv-tb-more').getBoundingClientRect(); return [Math.round(r.x * 10) / 10, Math.round(r.y * 10) / 10]; })()"


def at(page, x, y):
    return page.evaluate(f"(() => {{ const e = document.elementFromPoint({x}, {y}); return e ? e.className : ''; }})()")


def test_d25_more_button_does_not_move_when_a_document_opens(page):
    page.wait_for_selector(".cv-taskbar", state="attached", timeout=10000)
    page.wait_for_function("getComputedStyle(document.querySelector('.cv-taskbar')).visibility === 'visible'", timeout=10000)
    before = page.evaluate(MORE)
    page.evaluate("window.formvis.engine.newDocument(800, 600, 'T', 'white')")
    page.wait_for_timeout(1200)
    assert page.evaluate(MORE) == before


def test_d24_clicks_just_outside_the_bar_reach_the_canvas(page):
    page.evaluate("window.formvis.engine.newDocument(800, 600, 'T', 'white')")
    page.wait_for_function("getComputedStyle(document.querySelector('.cv-taskbar')).visibility === 'visible'", timeout=10000)
    page.wait_for_timeout(800)
    x, y, w, h = page.evaluate(BAR)
    assert "cv-tb" in at(page, x + w / 2, y + h / 2) or "cv-taskbar" in at(page, x + w / 2, y + h / 2)
    for px, py in ((x + w / 2, y - 6), (x + w / 2, y + h + 6), (x - 6, y + h / 2), (x + w + 6, y + h / 2)):
        assert "cv-overlay-canvas" in at(page, px, py), (px, py)


def test_d29_print_one_copy_description_does_not_promise_no_dialog():
    meta = (REPO / "frontend/src/automation/command-meta.ts").read_text(encoding="utf-8")
    line = next(l for l in meta.splitlines() if "'print-one-copy'" in l)
    assert "system print dialog still opens" in line
