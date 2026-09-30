# Generative Fill and Expand with neither fal nor ComfyUI (1.53.2): LaMa on this computer, the real engine and model.
import urllib.request

DLG = ".cv-scrim:not([hidden]) .cv-dialog"
PAINT = """([w, h]) => { const e = window.formvis.engine; e.newDocument(w, h, 'L', 'white');
  const c = e.activeLayer.raster.ctx; c.fillStyle = 'rgb(200,30,30)'; c.fillRect(0, 0, w / 2, h); c.fillStyle = 'rgb(30,60,200)'; c.fillRect(w / 2, 0, w / 2, h); e.activeLayer.raster.touch(); }"""
PX = "([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data).slice(0, 3)"


def no_fal():
    try:
        urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:8190/api/generative/key", method="DELETE"), timeout=10)
    except Exception:
        pass


def open_with_lama(page, command, title):
    page.evaluate(f"window.formvis.commands.run('{command}')")
    page.locator(DLG, has_text=title).wait_for()
    page.wait_for_function("() => document.querySelector('.cv-scrim:not([hidden]) select[aria-label=Model]').value === 'local:lama'", timeout=15000)
    assert "takes no prompt" in page.locator(DLG).inner_text()                                  # chosen: fal has no key, and no ComfyUI


def test_generative_fill_with_lama_and_nothing_else(page):
    no_fal()
    page.evaluate(PAINT, [300, 200])
    page.evaluate("async () => { const E = await import('/src/engine/index.ts'); window.formvis.engine.applySelection(E.SelectionMask.cropped(60, 70, 60, 60, new Uint8Array(3600).fill(255)), 'replace', 's'); }")
    open_with_lama(page, "generative-fill", "Generative Fill")
    page.locator(f"{DLG} .cv-dialog-foot button", has_text="Generate").click()
    page.wait_for_function("() => window.formvis.engine.current.doc.layers.length === 2", timeout=60000)
    r, g, b = page.evaluate(PX, [90, 100])
    assert r > 150 and g < 90 and b < 90, (r, g, b)                                              # filled red, from what surrounds it
    assert page.evaluate(PX, [250, 100]) == [30, 60, 200]                                        # outside the selection: untouched


def test_generative_expand_with_lama_and_nothing_else(page):
    no_fal()
    page.evaluate(PAINT, [200, 120])
    open_with_lama(page, "generative-expand", "Generative Expand")
    page.locator(f"{DLG} input[aria-label='Right margin']").fill("40")
    page.locator(f"{DLG} .cv-dialog-foot button", has_text="Generate").click()
    page.wait_for_function("() => window.formvis.engine.current.doc.width === 240", timeout=60000)
    page.wait_for_function("() => window.formvis.engine.current.doc.layers.length >= 2", timeout=60000)
    r, g, b = page.evaluate(PX, [225, 60])
    assert b > 130 and r < 110, (r, g, b)                                                        # the new border continues the blue beside it
