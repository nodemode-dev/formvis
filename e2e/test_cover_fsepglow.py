SET = """([label, v]) => { const i = [...document.querySelectorAll('input')].find((n) => n.getAttribute('aria-label') === label && n.getClientRects().length);
  if (!i) throw new Error('no control ' + label); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); }"""
GET = "(label) => { const i = [...document.querySelectorAll('input')].find((n) => n.getAttribute('aria-label') === label && n.getClientRects().length); return i ? i.value : null; }"
GLOW_SCENE = """(depth) => { const e = window.formvis.engine; e.newDocument(100, 60, 'D', 'black'); const k = e.activeLayer.raster.ctx;
  k.fillStyle = 'rgb(40,40,60)'; k.fillRect(0, 0, 100, 60); k.fillStyle = 'rgb(255,240,220)'; k.fillRect(30, 20, 20, 20);
  e.activeLayer.raster.touch(); e.refresh(); if (depth === 16) window.formvis.commands.run('depth-16'); }"""
PXS = "(pts) => pts.map(([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data))"
PTS = [[20, 30], [55, 30], [10, 30], [40, 30]]
GLOW_LABELS = ["Glow", "Glow radius (px)", "Glow threshold", "Glow warmth", "Glow diffusion"]
SEP = """(kind) => { const e = window.formvis.engine; e.newDocument(160, 120, 'FS', 'white'); const r = e.activeLayer.raster, k = r.ctx;
  const id = k.getImageData(0, 0, 160, 120); let s = 12345; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let y = 0; y < 120; y++) for (let x = 0; x < 160; x++) { const i = (y * 160 + x) * 4;
    if (kind === 'stripes') { const v = (x >> 1) % 2 ? 200 : 40; id.data[i] = v; id.data[i + 1] = 255 - v; id.data[i + 2] = (y * 2) & 255; }
    else { const edge = x > 80 ? 60 : 0; id.data[i] = Math.min(255, x + edge + rnd() * 20); id.data[i + 1] = Math.min(255, y * 2 + rnd() * 25); id.data[i + 2] = Math.min(255, 128 + 60 * Math.sin(x / 9) + rnd() * 30); }
    id.data[i + 3] = 255; }
  k.putImageData(id, 0, 0); r.touch(); e.refresh();
  const orig = k.getImageData(0, 0, 160, 120).data; e.frequencySeparation(8);
  const f = e.flattened().getContext('2d').getImageData(0, 0, 160, 120).data; let mx = 0, sum = 0, n = 0;
  for (let i = 0; i < f.length; i += 4) for (let c = 0; c < 3; c++) { const d = f[i + c] - orig[i + c]; mx = Math.max(mx, Math.abs(d)); sum += d; n++; }
  return { max: mx, mean: sum / n }; }"""


def open_develop(page, depth, glow):
    page.evaluate(GLOW_SCENE, depth)
    if depth == 16:
        page.wait_for_function("window.formvis.engine.current.doc.depth === 16")
    assert page.evaluate("window.formvis.commands.run('filter-develop')")
    page.wait_for_timeout(1500)
    for label, v in zip(GLOW_LABELS, glow):
        page.evaluate(SET, [label, v])
    page.wait_for_timeout(1200)


def apply_develop(page):
    page.locator("button.cv-btn-primary", has_text="OK").last.click()
    page.wait_for_function("window.formvis.engine.historySteps.names.slice(-1)[0] === 'Develop'", timeout=15000)
    page.wait_for_timeout(800)
    return page.evaluate(PXS, PTS)


def test_frequency_separation_low_plus_high_linear_light_rebuilds_the_picture_within_one_level_with_no_bias(page):
    # SC-ED-0102
    for kind in ("photo", "stripes"):
        r = page.evaluate(SEP, kind)
        assert r["max"] <= 1 and abs(r["mean"]) < 0.05, (kind, r)


def test_develop_glow_in_a_16_bit_document_changes_pixels_and_matches_the_8_bit_result(page):
    # CO-0157
    open_develop(page, 8, [80, 12, 50, 30, 20])
    eight = apply_develop(page)
    open_develop(page, 16, [0, 12, 50, 30, 20])
    plain = apply_develop(page)
    open_develop(page, 16, [80, 12, 50, 30, 20])
    deep = apply_develop(page)
    assert plain[0][:3] == [40, 40, 60] and plain[1][:3] == [40, 40, 60]
    assert deep[1][0] > plain[1][0] + 30
    for a, b in zip(eight, deep):
        assert all(abs(x - y) <= 2 for x, y in zip(a[:3], b[:3])), (eight, deep)


def test_develop_save_settings_writes_glow_and_load_settings_restores_it(page, tmp_path):
    # PC-IO-0122
    open_develop(page, 16, [80, 12, 50, 30, 20])
    with page.expect_download() as dl:
        page.locator("button", has_text="Save Settings...").click()
    text = open(dl.value.path()).read()
    for attr, v in (("GlowAmount", 80), ("GlowRadius", 12), ("GlowThreshold", 50), ("GlowWarmth", 30), ("GlowDiffusion", 20)):
        assert f'crs:{attr}="{v}"' in text, text
    f = tmp_path / "glow.xmp"
    f.write_text(text)
    page.evaluate(SET, ["Glow", 0])
    page.evaluate(SET, ["Glow radius (px)", 24])
    page.wait_for_timeout(500)
    assert page.evaluate(GET, "Glow") == "0"
    with page.expect_file_chooser() as fc:
        page.locator("button", has_text="Load Settings...").click()
    fc.value.set_files(str(f))
    page.wait_for_function("() => [...document.querySelectorAll('input')].some((n) => n.getAttribute('aria-label') === 'Glow' && n.getClientRects().length && n.value === '80')", timeout=5000)
    assert [page.evaluate(GET, label) for label in GLOW_LABELS] == ["80", "12", "50", "30", "20"]


def test_normalise_mode_changed_in_properties_while_its_dialog_is_open_changes_the_layer_and_the_dialog(page):
    # SC-ED-0147
    params = "window.formvis.engine.activeLayer.adjustment.data.params"
    page.evaluate("() => { const e = window.formvis.engine; e.newDocument(80, 60, 'N', 'white'); e.addAdjustmentLayer('normalise'); e.refresh(); }")
    page.wait_for_timeout(800)
    page.locator(".cv-props-adj .cv-btn", has_text="Edit in Dialog").click()
    page.wait_for_timeout(600)
    props = page.locator(".cv-props-adj select").first
    dialog = page.locator(".cv-scrim:not([hidden]) .cv-dialog select").filter(has=page.locator("option[value=mean]")).first
    props.select_option("mean")
    page.wait_for_function(f"{params}.mode === 'mean'")
    assert dialog.input_value() == "mean"
    props.select_option("stretch")
    page.wait_for_function(f"{params}.mode === 'stretch'")
    assert dialog.input_value() == "stretch"
    dialog.select_option("mean")
    page.wait_for_function(f"{params}.mode === 'mean'")
    assert props.input_value() == "mean"
    page.locator(".cv-scrim:not([hidden]) .cv-dialog-foot button", has_text="OK").last.click()
    page.wait_for_timeout(500)
    assert page.evaluate(params)["mode"] == "mean"
    assert page.evaluate("window.formvis.engine.historySteps.names.filter((n) => n === 'Edit Normalize').length") == 1
