DLG = ".cv-scrim:not([hidden]) .cv-dialog"


def test_the_refine_edge_brush_changes_the_edge_only_where_painted(page):
    r = page.evaluate("""async () => {
      const S = await import('/src/engine/select-mask.ts'), W = 60, H = 20, n = W * H;
      const mask = new Float32Array(n), guide = new Float32Array(n), none = new Float32Array(n), left = new Float32Array(n);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x; mask[i] = x < 30 ? 1 : 0; guide[i] = Math.min(1, Math.max(0, (x - 20) / 20)); left[i] = y < 10 ? 1 : 0;
      }
      const same = S.refineRegion(mask, guide, none, W, H, 5);
      const half = S.refineRegion(mask, guide, left, W, H, 5);
      let top = 0, bottom = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x, dd = Math.abs(half[i] - mask[i]); if (y < 10) top += dd; else bottom += dd; }
      return { identical: same.every((v, i) => v === mask[i]), top, bottom };
    }""")
    assert r["identical"], r                      # nothing painted, nothing changed
    assert r["top"] > 1 and r["bottom"] == 0, r   # the painted half re-matted, the other half untouched


def test_decontaminate_colors_replaces_an_edge_fringe_with_the_subjects_colour(page):
    got = page.evaluate("""async () => {
      const e = window.formvis.engine, W = 60, H = 40, run = (amount) => {
        e.newDocument(W, H, 'D', 'white');
        const c = e.current.activeLayer.raster.ctx;
        for (let x = 0; x < W; x++) { c.fillStyle = x < 30 ? 'rgb(220,30,30)' : x === 30 ? 'rgb(125,30,125)' : 'rgb(30,30,220)'; c.fillRect(x, 0, 1, H); }
        e.current.activeLayer.raster.touch();
        const data = new Uint8Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) data[y * W + x] = x < 30 ? 255 : x === 30 ? 128 : 0;
        e.applyRefinedSelection(data, 'selection');
        e.applyRefinedSelection(data, 'layer', amount);
        const l = e.current.activeLayer, t = l.transform, px = l.raster.ctx.getImageData(Math.round(30 - t.x), Math.round(20 - t.y), 1, 1).data;
        return [px[0], px[1], px[2]];
      };
      return { plain: run(0), clean: run(100) };
    }""")
    plain, clean = got["plain"], got["clean"]
    assert abs(plain[0] - 125) <= 3 and abs(plain[2] - 125) <= 3, got      # without it, the fringe keeps its purple
    assert clean[0] > plain[0] + 40 and clean[2] < plain[2] - 40, got      # with it, toward the subject's red


def test_the_dialog_views_brush_and_decontaminate(page):
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.evaluate("window.formvis.engine.newDocument(120, 80, 'M', 'white'); window.formvis.engine.selectAll()")
    assert page.evaluate("window.formvis.commands.run('select-and-mask')")
    views = page.locator(DLG + " .cv-field", has=page.get_by_text("View", exact=True)).locator("select")
    values = views.evaluate("(s) => [...s.options].map((o) => o.value)")
    assert values == ["onionSkin", "marchingAnts", "overlay", "onBlack", "onWhite", "blackWhite", "onLayers"], values
    for v in values:
        views.select_option(v)
        page.wait_for_timeout(60)
    assert page.evaluate("(() => { const c = document.querySelector('.cv-mask-canvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; return d.some((x, i) => i % 4 === 3 && x > 0); })()")
    page.locator(DLG + " .cv-field", has_text="Brush (paint").locator("select").select_option("refine")
    assert page.evaluate("document.querySelector('.cv-mask-canvas').classList.contains('is-brush')")
    page.locator(DLG + " .cv-field", has_text="Decontaminate Colors").locator("input").check()
    assert page.locator(DLG + " .cv-field", has_text="Output To").locator("select").input_value() == "layerMask"   # to a new layer
    page.keyboard.press("Escape")
    assert errors == [], errors
