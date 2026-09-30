# 16-bit documents (1.53.6, the parity plan's H1): a 16-bit PNG opened, an Exposure layer, a 16-bit PNG exported with
# thousands of levels; painting refused and 8-bit-only commands disabled; back to 8 bits.
import cv2
import numpy as np


def test_a_16_bit_png_keeps_its_bits_through_an_adjustment(page, tmp_path):
    src = tmp_path / "ramp16.png"
    ramp = np.linspace(0, 65535, 1024).astype(np.uint16).reshape(1, 1024, 1).repeat(3, 2).repeat(8, 0)
    cv2.imwrite(str(src), ramp)
    page.locator("input[data-role='import-images']").set_input_files(str(src))
    page.wait_for_function("window.formvis.engine.current?.doc.depth === 16", timeout=20000)
    page.evaluate("""() => { const e = window.formvis.engine; e.addAdjustmentLayer('exposure');
      e.edit('Exposure', (pp) => { pp.doc = { ...pp.doc, layers: pp.doc.layers.map((l) => (l.adjustment?.kind === 'exposure' ? { ...l, adjustment: { ...l.adjustment, data: { ...l.adjustment.data, exposureSettings: { exposure: 0.7, offset: 0, gamma: 1 } } } } : l)) }; }); }""")   # as the agent bridge's set_adjustment does
    with page.expect_download(timeout=30000) as d:
        page.evaluate("window.formvis.commands.run('export-png')")
    out = tmp_path / "out.png"; d.value.save_as(str(out))
    img = cv2.imread(str(out), cv2.IMREAD_UNCHANGED)
    # +0.7 EV clips above 0.616 linear (about 81 percent up the encoded ramp): some 830 of the 1,024 inputs stay distinct
    levels = len(np.unique(img[..., 0]))
    assert img.dtype == np.uint16 and levels > 780, (img.dtype, levels)                        # 8 bits would keep at most 256
    assert int(img[0, 512, 0]) > int(ramp[0, 512, 0]) + 3000                                   # the Exposure layer took effect
    assert page.evaluate("window.formvis.commands.enabled(window.formvis.commands.get('filter-gaussianBlur'))") is False
    assert page.evaluate("window.formvis.commands.enabled(window.formvis.commands.get('new-adj-curves'))") is True
    assert page.evaluate("(() => { const e = window.formvis.engine; e.selectLayer(e.current.doc.layers.find((l) => l.deep).id); return e.beginStroke({ x: 5, y: 4 }, false); })()") is False
    page.evaluate("window.formvis.commands.run('depth-8')")
    assert page.evaluate("(() => { const d = window.formvis.engine.current.doc; return [d.depth ?? 8, d.layers.some((l) => l.deep)]; })()") == [8, False]


def test_flips_sizes_and_filters_keep_16_bits(page, tmp_path):
    src = tmp_path / "ramp16b.png"
    ramp = np.linspace(0, 65535, 1024).astype(np.uint16).reshape(1, 1024, 1).repeat(3, 2).repeat(16, 0)
    cv2.imwrite(str(src), ramp)
    page.locator("input[data-role='import-images']").set_input_files(str(src))
    page.wait_for_function("window.formvis.engine.current?.doc.depth === 16", timeout=20000)
    for cid in ("flip-canvas-h", "image-size", "canvas-size", "filter-gaussianBlur"):
        assert page.evaluate(f"window.formvis.commands.enabled(window.formvis.commands.get('{cid}'))") is True, cid
    page.evaluate("window.formvis.commands.run('flip-canvas-h')")
    page.evaluate("window.formvis.engine.resizeCanvas(1024, 20, 0, 2)")                          # Canvas Size: 2 px more above and below
    page.evaluate("window.formvis.engine.resampleImage(768, 15, 'bilinear', 72)")               # Image Size
    page.evaluate("window.formvis.commands.run('filter-gaussianBlur')")
    page.locator(".cv-scrim:not([hidden]) .cv-dialog", has_text="Gaussian Blur").wait_for()
    page.locator(".cv-scrim:not([hidden]) .cv-dialog .cv-dialog-foot button", has_text="OK").click()
    page.wait_for_function("window.formvis.engine.current.history.undoName === 'Gaussian Blur'", timeout=15000)
    with page.expect_download(timeout=30000) as d:
        page.evaluate("window.formvis.commands.run('export-png')")
    out = tmp_path / "out2.png"; d.value.save_as(str(out))
    img = cv2.imread(str(out), cv2.IMREAD_UNCHANGED)
    assert img.dtype == np.uint16 and img.shape[:2] == (15, 768), (img.dtype, img.shape)
    row = img[7, :, 0].astype(int)
    assert row[20] > row[-20] + 40000                                                           # flipped: bright on the left now
    assert len(np.unique(row)) > 600, len(np.unique(row))                                      # still far past 8 bits' 256


def test_painting_and_filtering_a_selection_keep_16_bits(page, tmp_path):
    src = tmp_path / "ramp16c.png"
    ramp = np.linspace(0, 65535, 1024).astype(np.uint16).reshape(1, 1024, 1).repeat(3, 2).repeat(80, 0)   # stroke about row 10, clear about 40, selection 50 to 70
    cv2.imwrite(str(src), ramp)
    page.locator("input[data-role='import-images']").set_input_files(str(src))
    page.wait_for_function("window.formvis.engine.current?.doc.depth === 16", timeout=20000)
    page.evaluate("""() => { const e = window.formvis.engine; e.setTool('brush'); e.fg = { r: 255, g: 0, b: 0 }; Object.assign(e.brush, { diameter: 30, hardness: 0, opacity: 0.5 });
      e.beginStroke({ x: 2, y: 10 }, false); for (let x = 2; x <= 1022; x += 4) e.strokeTo({ x, y: 10 }); e.endStroke(); }""")
    assert page.evaluate("window.formvis.engine.current.history.undoName") not in (None, "")
    page.evaluate("() => { const e = window.formvis.engine; e.setTool('cloneStamp'); }")
    assert page.evaluate("window.formvis.engine.beginRetouchStroke ? true : false") is True
    page.evaluate("""async () => { const E = await import('/src/engine/index.ts'), e = window.formvis.engine; e.setTool('marquee');
      e.applySelection(E.SelectionMask.cropped(0, 50, 1024, 20, new Uint8Array(1024 * 20).fill(255)), 'replace', 'Rectangular Marquee'); }""")
    page.evaluate("window.formvis.commands.run('filter-gaussianBlur')")
    page.locator(".cv-scrim:not([hidden]) .cv-dialog", has_text="Gaussian Blur").wait_for()
    page.locator(".cv-scrim:not([hidden]) .cv-dialog .cv-dialog-foot button", has_text="OK").click()
    page.wait_for_function("window.formvis.engine.current.history.undoName === 'Gaussian Blur'", timeout=15000)
    page.evaluate("window.formvis.engine.deselect()")
    with page.expect_download(timeout=30000) as d:
        page.evaluate("window.formvis.commands.run('export-png')")
    out = tmp_path / "out3.png"; d.value.save_as(str(out))
    img = cv2.imread(str(out), cv2.IMREAD_UNCHANGED)[..., [2, 1, 0]].astype(int)                # RGB
    painted, clear = img[10], img[40]
    assert (painted[:, 0] >= clear[:, 0]).all() and painted[512, 0] > clear[512, 0] + 5000     # redder under the stroke
    assert len(np.unique(painted[:, 1])) > 600, len(np.unique(painted[:, 1]))                  # its green channel still past 8 bits
    assert np.array_equal(img[40, :, 1], ramp[40, :, 1].astype(int))                           # outside the stroke and the selection: untouched
    assert len(np.unique(img[60, :, 1])) > 600                                                 # blurred within the selection, at 16 bits
    assert not np.array_equal(img[60, :, 1], ramp[60, :, 1].astype(int))                       # and changed by the blur
