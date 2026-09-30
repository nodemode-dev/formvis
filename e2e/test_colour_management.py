# Colour management (1.53.5, the parity plan's H2): Proof Colors and Gamut Warning against a real press profile,
# Assign and Convert to Profile, and embedded profiles on open. FOGRA39 comes from TeX Live on the test machine.
import io

from PIL import Image

from e2e.conftest import open_app

FOGRA = "/usr/share/texlive/texmf-dist/tex/generic/colorprofiles/FOGRA39L_coated.icc"
DLG = ".cv-scrim:not([hidden]) .cv-dialog"
SCREEN = """([x, y]) => { const e = window.formvis.engine, v = e.current.viewport, d = devicePixelRatio, c = document.querySelector('.cv-scene');
  return Array.from(c.getContext('2d').getImageData(Math.round((v.panX + x * v.zoom) * d), Math.round((v.panY + y * v.zoom) * d), 1, 1).data).slice(0, 3); }"""
PIXEL = "([x, y]) => Array.from(window.formvis.engine.activeLayer.raster.ctx.getImageData(x, y, 1, 1).data).slice(0, 3)"


def two_halves(page):
    page.evaluate("""async () => { const E = await import('/src/engine/index.ts'), e = window.formvis.engine; e.newDocument(200, 100, 'Proof', 'white');
      const r = new E.Raster(200, 100); r.ctx.fillStyle = 'rgb(0,0,255)'; r.ctx.fillRect(0, 0, 100, 100); r.ctx.fillStyle = 'rgb(128,128,128)'; r.ctx.fillRect(100, 0, 100, 100); r.touch();
      e.insertRasterLayer(r, 'Colours', 0, 0, {}, 'Colours'); e.zoomTo(1); }""")


def test_proof_colors_and_gamut_warning_with_a_press_profile(page):
    two_halves(page)
    page.wait_for_function(f"({SCREEN})([40, 40]).join() === '0,0,255'", timeout=15000)   # the first frame drawn
    page.evaluate("window.formvis.commands.run('proof-setup')")
    page.locator(DLG, has_text="Proof Setup").wait_for()
    page.locator(f"{DLG} input[data-role='load-profile']").set_input_files(FOGRA)
    page.wait_for_function("document.querySelector('.cv-scrim:not([hidden]) select[aria-label=\"Device to Simulate\"]').selectedOptions[0]?.textContent.includes('CMYK')", timeout=15000)
    page.locator(f"{DLG} .cv-dialog-foot button", has_text="OK").click()
    page.wait_for_function("!!window.formvis.engine.viewTransform", timeout=15000)
    page.wait_for_timeout(300)
    proofed = page.evaluate(SCREEN, [40, 40])
    assert proofed != [0, 0, 255] and proofed[2] < 250, proofed                               # the press's duller blue on screen
    assert page.evaluate(PIXEL, [40, 40]) == [0, 0, 255]                                       # the document untouched
    page.evaluate("window.formvis.commands.run('gamut-warning')")
    page.wait_for_function("window.formvis.engine.viewTransform?.gamut === true", timeout=15000); page.wait_for_timeout(300)
    assert page.evaluate(SCREEN, [40, 40]) == [128, 128, 128]                                  # beyond the press: grey
    grey = page.evaluate(SCREEN, [150, 40])
    assert all(abs(v - 128) <= 12 for v in grey), grey                                          # printable: not flagged
    page.evaluate("window.formvis.commands.run('proof-colors')")
    page.wait_for_function("!window.formvis.engine.viewTransform", timeout=15000); page.wait_for_timeout(300)
    assert page.evaluate(SCREEN, [40, 40]) == [0, 0, 255]


def test_assign_and_convert_to_profile(page):
    page.evaluate("""async () => { const E = await import('/src/engine/index.ts'), e = window.formvis.engine; e.newDocument(60, 40, 'Assign', 'white');
      const r = new E.Raster(60, 40); r.ctx.fillStyle = 'rgb(200,100,50)'; r.ctx.fillRect(0, 0, 60, 40); r.touch(); e.insertRasterLayer(r, 'Paint', 0, 0, {}, 'Paint'); }""")
    page.evaluate("window.formvis.commands.run('assign-profile')")
    page.locator(DLG, has_text="Assign Profile").wait_for()
    page.locator(f"{DLG} select[aria-label='Profile']").select_option("display-p3")
    page.locator(f"{DLG} .cv-dialog-foot button", has_text="OK").click()
    page.wait_for_function("window.formvis.engine.current.doc.profile?.name === 'Display P3'")
    assert page.evaluate(PIXEL, [5, 5]) == [200, 100, 50]                                      # assigned: the numbers stay
    page.wait_for_function("!!window.formvis.engine.viewTransform", timeout=15000)              # and the view is colour-managed
    page.evaluate("window.formvis.commands.run('convert-profile')")
    page.locator(DLG, has_text="Convert to Profile").wait_for()
    page.locator(f"{DLG} select[aria-label='Destination profile']").select_option("srgb")
    page.locator(f"{DLG} .cv-dialog-foot button", has_text="OK").click()
    page.wait_for_function("!window.formvis.engine.current.doc.profile", timeout=15000)
    r, g, b = page.evaluate(PIXEL, [5, 5])
    assert r > 205 and b < 45, (r, g, b)                                                       # Display P3's orange in sRGB's numbers
    page.evaluate("window.formvis.engine.undo()")
    assert page.evaluate("window.formvis.engine.current.doc.profile?.name") == "Display P3" and page.evaluate(PIXEL, [5, 5]) == [200, 100, 50]


def test_an_embedded_profile_is_converted_or_kept(context, tmp_path):
    page = context.new_page()
    try:
        open_app(page)
        icc = bytes(page.evaluate("async () => Array.from((await import('/src/engine/icc.ts')).iccProfile('display-p3'))"))
        f = tmp_path / "p3.png"
        Image.new("RGB", (40, 30), (200, 100, 50)).save(f, "PNG", icc_profile=icc)
        page.locator("input[data-role='import-images']").set_input_files(str(f))
        page.wait_for_function("document.body.innerText.includes('converted from its embedded profile, Display P3')", timeout=15000)
        page.wait_for_function("window.formvis.engine.current?.doc.width === 40", timeout=15000)   # the message comes before the image is in
        assert page.evaluate("window.formvis.engine.current.doc.profile ?? null") is None
        page.evaluate("localStorage.setItem('formvis.prefs', JSON.stringify({ profileMismatch: 'keep' }))")
        page.reload(); page.wait_for_function("window.formvis && window.formvis.engine")
        page.evaluate("() => { const e = window.formvis.engine; for (const p of [...e.projects]) e.closeProject(p.id); }")   # the image opens as its own document
        page.locator("input[data-role='import-images']").set_input_files(str(f))
        page.wait_for_function("window.formvis.engine.current?.doc.profile?.name === 'Display P3'", timeout=15000)
        assert page.evaluate(PIXEL, [5, 5]) == [200, 100, 50]                                  # kept: the numbers as stored
    finally:
        page.evaluate("localStorage.removeItem('formvis.prefs')")
        page.close()
