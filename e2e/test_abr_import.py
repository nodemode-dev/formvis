import struct


def cross(w, h):
    return bytes(255 if abs(x - w / 2 + 0.5) < 3 or abs(y - h / 2 + 0.5) < 3 else 0 for y in range(h) for x in range(w))


def packbits_rows(data, w, h):
    rows = []
    for y in range(h):
        row = data[y * w:(y + 1) * w]
        out = bytearray()
        for i in range(0, w, 128):
            chunk = row[i:i + 128]
            out += bytes([len(chunk) - 1]) + chunk
        rows.append(bytes(out))
    return b"".join(struct.pack(">H", len(r)) for r in rows) + b"".join(rows)


def abr_v62(tips):
    samp = bytearray()
    for w, h, data in tips:
        body = b"\x07" * 301 + struct.pack(">iiiiHB", 0, 0, h, w, 8, 1) + packbits_rows(data, w, h)
        samp += struct.pack(">I", len(body)) + body
        while len(samp) % 4:
            samp += b"\x00"
    return struct.pack(">HH", 6, 2) + b"8BIMsamp" + struct.pack(">I", len(samp)) + bytes(samp) + b"8BIMdesc" + struct.pack(">I", 0)


def test_import_paint_and_keep(page, tmp_path):
    f = tmp_path / "Crosses.abr"
    f.write_bytes(abr_v62([(40, 40, cross(40, 40)), (24, 12, cross(24, 12))]))
    page.evaluate("(() => { const e = window.formvis.engine; e.newDocument(200, 120, 'B', 'white'); e.setTool('brush'); if (e.tool !== 'brush') throw new Error('tool'); })()")
    page.evaluate("document.querySelector('.cv-opt-more:not([hidden])[aria-expanded=false]')?.click()")
    page.locator(".cv-opt-group:not([hidden]) button, .cv-opt-pop-sect[style*=contents] button", has_text="Import Brushes").click()
    page.set_input_files("input[data-role=import-brushes]", str(f))
    page.wait_for_function("(window.formvis.engine.brushPresetId || '').startsWith('abr-')", timeout=10000)
    r = page.evaluate("(() => { const e = window.formvis.engine; return [e.brush.tip.w, e.brush.tip.h, e.brush.diameter]; })()")
    assert r == [40, 40, 40], r
    page.wait_for_timeout(200)
    listed = page.evaluate("(() => { const s = [...document.querySelectorAll('.cv-opt-group:not([hidden]) select, .cv-opt-pop-sect[style*=contents] select')].find((x) => [...x.options].some((o) => o.textContent === 'Hard round')); return s ? [[...s.options].map((o) => o.textContent).filter((t) => t.startsWith('Crosses')), s.value.startsWith('abr-')] : null; })()")
    assert listed == [["Crosses 1", "Crosses 2"], True], listed
    page.evaluate("document.querySelector('.cv-opt-more:not([hidden])[aria-expanded=true]')?.click()")
    s = page.evaluate("(() => { const e = window.formvis.engine; e.fg = { r: 0, g: 0, b: 0 }; const v = e.current.viewport, b = document.querySelector('.cv-stage').getBoundingClientRect(); return [b.left + v.panX + 100 * v.zoom, b.top + v.panY + 60 * v.zoom]; })()")
    page.mouse.click(*s)
    page.wait_for_timeout(300)
    px = lambda x, y: page.evaluate(f"window.formvis.engine.flattened().getContext('2d').getImageData({x}, {y}, 1, 1).data[0]")
    # the cross's arms are painted, its corners are not
    assert px(100, 45) < 80 and px(85, 60) < 80 and px(88, 48) > 200, [px(100, 45), px(85, 60), px(88, 48)]
    page.reload()
    page.wait_for_function("window.formvis && window.formvis.engine")
    kept = page.evaluate("async () => { const B = await import('/src/engine/brush-dynamics.ts'); for (let i = 0; i < 50 && !B.importedBrushPresets.length; i++) await new Promise((r) => setTimeout(r, 100)); return B.importedBrushPresets.map((p) => [p.name, p.tip.w, p.tip.h]); }")
    assert kept == [["Crosses 1", 40, 40], ["Crosses 2", 24, 12]], kept
