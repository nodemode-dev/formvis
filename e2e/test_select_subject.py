import json
import urllib.request

import pytest

from e2e.conftest import URL


def _engine_up() -> bool:
    try:
        # A cold engine may take a while to answer; only an engine that does not answer at all is skipped.
        with urllib.request.urlopen(URL + "api/capabilities", timeout=30) as r:
            return bool(json.load(r).get("removeBackground", {}).get("default"))
    except (OSError, ValueError):
        return False


pytestmark = pytest.mark.skipif(not _engine_up(), reason="needs the engine on 8190 with a background engine (./formvis backend)")

SCENE = """() => {
  const e = window.formvis.engine;
  e.newDocument(240, 160, 'S', 'white');
  const l = e.current.activeLayer, c = l.raster.ctx;
  c.fillStyle = '#c81e3c'; c.beginPath(); c.arc(70, 80, 35, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#1e5ac8'; c.beginPath(); c.arc(175, 80, 35, 0, Math.PI * 2); c.fill();
  l.raster.touch(); e.refresh();
}"""
PROBE = "(() => { const s = window.formvis.engine.current.selection; return s ? [s.valueAt(70, 80), s.valueAt(175, 80), s.valueAt(5, 5), window.formvis.engine.historySteps.names.slice(-1)[0]] : null; })()"


def run(page, command):
    step = "Select Subject" if command == "select-subject" else "Select Object"
    page.evaluate(f"window.formvis.commands.run('{command}')")
    page.wait_for_function(f"window.formvis.engine.historySteps.names.slice(-1)[0] === '{step}'", timeout=60000)


def test_select_subject_selects_the_objects_and_not_the_background(page):
    page.evaluate(SCENE)
    run(page, "select-subject")
    r = page.evaluate(PROBE)
    assert r[0] >= 128 and r[2] < 128 and r[3] == "Select Subject", r


def test_object_in_selection_keeps_to_the_marquee(page):
    page.evaluate(SCENE)
    page.evaluate("""async () => { const E = await import('/src/engine/index.ts'); window.formvis.engine.applySelection(E.SelectionMask.cropped(20, 20, 110, 120, new Uint8Array(110 * 120).fill(255)), 'replace', 'Rect'); }""")
    run(page, "select-object")
    r = page.evaluate(PROBE)
    assert r[0] >= 128 and r[1] == 0 and r[2] == 0 and r[3] == "Select Object", r
