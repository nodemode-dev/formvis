import base64
from pathlib import Path

DNG = base64.b64encode((Path(__file__).parent.parent / "backend" / "tests" / "fixtures" / "synthetic.dng").read_bytes()).decode()


def test_a_dropped_raw_file_is_developed_and_opens_develop(page):
    page.evaluate("window.sonny.engine.newDocument(200, 150, 'R', 'white')")
    page.evaluate("""(b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)), dt = new DataTransfer();
      dt.items.add(new File([bytes], 'photo.dng', { type: '' }));
      const target = document.querySelector('.cv-stage') || document.body, r = target.getBoundingClientRect();
      for (const type of ['dragenter', 'dragover', 'drop'])
        target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
    }""", DNG)
    page.wait_for_function("window.sonny.engine.current.activeLayer?.name?.startsWith('photo')", timeout=15000)
    px = page.evaluate("""() => { const l = window.sonny.engine.current.activeLayer, c = l.raster.ctx, w = l.raster.width, h = l.raster.height;
      const at = (x, y) => Array.from(c.getImageData(x, y, 1, 1).data); return { w, h, left: at(8, h >> 1), right: at(w - 8, h >> 1) }; }""")
    assert (px["w"], px["h"]) == (64, 48), px
    assert px["left"][0] > 200 and px["left"][2] < 150 and px["right"][2] > 200 and px["right"][0] < 150, px   # red left, blue right
    # As Photoshop opens a RAW file into Camera Raw, sonny opens it into Develop.
    page.wait_for_function("[...document.querySelectorAll('.cv-scrim:not([hidden]) .cv-note')].some((n) => n.textContent === 'Point Curve')", timeout=10000)
    page.keyboard.press("Escape")
