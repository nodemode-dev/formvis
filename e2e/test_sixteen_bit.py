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
