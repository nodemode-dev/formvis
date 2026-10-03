"""TiledRaster (1.62.2, DEV_PLAN 26.6a): a layer as tiles must give exactly what one canvas gives. Tiles of 64 pixels
on a 300 by 200 layer, so every operation crosses many tile edges; each result is compared with a single-canvas Raster
doing the same, over every byte."""

SETUP = """async () => {
  const E = await import('/src/engine/index.ts'), T = await import('/src/engine/tiled.ts');
  window.__E = E; window.__T = T;
  window.__same = (a, b) => { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
}"""


def test_writes_and_reads_cross_tile_edges_as_one_canvas(page):
    page.evaluate(SETUP)
    r = page.evaluate("""() => {
      const E = window.__E, T = window.__T, W = 300, H = 200, one = new E.Raster(W, H), tiled = new T.TiledRaster(W, H, 64);
      let s = 11; const rnd = (n) => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s % n; };
      for (let k = 0; k < 40; k++) {
        const w = 1 + rnd(130), h = 1 + rnd(90), img = new ImageData(w, h);
        for (let i = 0; i < img.data.length; i++) img.data[i] = rnd(256);
        for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;   // opaque: putImageData keeps values exactly
        const x = rnd(W + 60) - 40, y = rnd(H + 60) - 40;                // some partly outside the layer
        one.ctx.putImageData(img, x, y); tiled.write(img, x, y);
      }
      const whole = window.__same(one.ctx.getImageData(0, 0, W, H).data, tiled.read(0, 0, W, H).data);
      const part = window.__same(one.ctx.getImageData(37, 21, 150, 120).data, tiled.read(37, 21, 150, 120).data);
      const past = tiled.read(W - 10, H - 10, 30, 30), outside = past.data[(25 * 30 + 25) * 4 + 3];   // beyond the layer: transparent
      return { whole, part, outside, tiles: tiled.tileCount, of: tiled.cols * tiled.rows };
    }""")
    assert r["whole"] and r["part"], r
    assert r["outside"] == 0, r
    assert r["of"] == 5 * 4, r


def test_fills_drawn_across_tile_edges_land_exactly_as_on_one_canvas(page):
    page.evaluate(SETUP)
    r = page.evaluate("""() => {
      const E = window.__E, T = window.__T, W = 300, H = 200, one = new E.Raster(W, H), tiled = new T.TiledRaster(W, H, 64);
      const fills = (c) => {
        c.fillStyle = 'rgba(30, 120, 220, 0.8)'; c.fillRect(10, 10, 250, 170);
        c.clearRect(100, 50, 70, 90);
        c.globalCompositeOperation = 'multiply'; c.fillStyle = '#66cc33'; c.fillRect(60, 40, 128, 70);
      };
      fills(one.ctx); tiled.drawOn(0, 0, W, H, fills);
      return { same: window.__same(one.ctx.getImageData(0, 0, W, H).data, tiled.read(0, 0, W, H).data) };
    }""")
    assert r["same"], r


def test_antialiased_shapes_drawn_across_tile_edges_look_the_same(page):
    # Not byte-exact, and not claimed to be: the browser may draw a path cut by a tile's edge another way than the
    # whole path, so a few edge pixels differ (measured: 99.8% of values within 2 levels over white). Such drawing is
    # therefore done on one scratch canvas and written into tiles in the stages that paint (26.6d); this holds drawOn
    # to what it does give, seen as a person sees it.
    page.evaluate(SETUP)
    r = page.evaluate("""() => {
      const E = window.__E, T = window.__T, W = 1200, H = 800, one = new E.Raster(W, H), tiled = new T.TiledRaster(W, H, 512);
      const art = (c) => { c.save(); c.scale(4, 4);
        c.fillStyle = 'rgba(30, 120, 220, 0.8)'; c.beginPath(); c.arc(150, 100, 70, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#e04020'; c.lineWidth = 9; c.beginPath(); c.moveTo(10, 190); c.lineTo(290, 12); c.stroke(); c.restore(); };
      art(one.ctx); tiled.drawOn(0, 0, W, H, art);
      const sa = E.createSurface(W, H), ca = E.ctxOf(sa), sb = E.createSurface(W, H), cb = E.ctxOf(sb);
      ca.fillStyle = cb.fillStyle = '#ffffff'; ca.fillRect(0, 0, W, H); cb.fillRect(0, 0, W, H);
      ca.drawImage(one.canvas, 0, 0); tiled.drawTo(cb, [1, 0, 0, 1, 0, 0]);
      const a = ca.getImageData(0, 0, W, H).data, b = cb.getImageData(0, 0, W, H).data;
      let near = 0; for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) <= 2) near++;
      return { share: near / a.length };
    }""")
    assert r["share"] >= 0.995, r


def test_drawn_out_at_actual_size_as_one_canvas(page):
    page.evaluate(SETUP)
    r = page.evaluate("""() => {
      const E = window.__E, T = window.__T, W = 300, H = 200, one = new E.Raster(W, H), tiled = new T.TiledRaster(W, H, 64);
      one.ctx.fillStyle = '#204080'; one.ctx.fillRect(20, 20, 200, 150); one.ctx.fillStyle = 'rgba(250, 200, 40, 0.7)';
      one.ctx.beginPath(); one.ctx.arc(170, 90, 60, 0, 6.3); one.ctx.fill();
      const px = one.ctx.getImageData(0, 0, W, H), copy = new E.Raster(W, H);
      copy.ctx.putImageData(px, 0, 0); tiled.write(px, 0, 0);   // both by the same round trip: drawTo alone is tested
      const a = E.createSurface(360, 260), ca = E.ctxOf(a), b = E.createSurface(360, 260), cb = E.ctxOf(b);
      ca.fillStyle = cb.fillStyle = '#ffffff'; ca.fillRect(0, 0, 360, 260); cb.fillRect(0, 0, 360, 260);
      ca.drawImage(copy.canvas, 23, 17); tiled.drawTo(cb, [1, 0, 0, 1, 23, 17]);
      return { same: window.__same(ca.getImageData(0, 0, 360, 260).data, cb.getImageData(0, 0, 360, 260).data) };
    }""")
    assert r["same"], r


def test_an_empty_tile_costs_nothing(page):
    page.evaluate(SETUP)
    r = page.evaluate("""() => {
      const T = window.__T, tiled = new T.TiledRaster(30000, 20000);   // 600 MP: past any one canvas
      const before = tiled.bytes;
      const img = new ImageData(100, 100); img.data.fill(255);
      tiled.write(img, 4200, 4200);                                     // inside one tile (4,096 to 6,143)
      tiled.write(img, 2000, 9000);                                     // across two (x crosses 2,048)
      return { before, tiles: tiled.tileCount, bytes: tiled.bytes, grid: tiled.cols * tiled.rows, back: tiled.read(4250, 4250, 1, 1).data[0] };
    }""")
    assert r["before"] == 0 and r["grid"] == 150, r
    assert r["tiles"] == 3 and r["bytes"] == 3 * 2048 * 2048 * 4, r      # only the tiles drawn into
    assert r["back"] == 255, r
