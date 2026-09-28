SETUP = """(shape) => { const e = window.formvis.engine; e.newDocument(300, 120, 'B', 'transparent'); e.addLayer(); e.setTool('brush'); e.setBrushMode('paint');
  e.fg = { r: 220, g: 20, b: 20 }; e.bg = { r: 20, g: 40, b: 220 };
  e.brushShape = { ...e.brushShape, spacing: null, ...shape }; }"""
STROKE = """([a, b, size, hardness]) => { const e = window.formvis.engine; e.setBrush({ diameter: size, hardness, opacity: 1 });
  e.beginStroke({ x: a[0], y: a[1] }, false, 1); for (let i = 1; i <= 30; i++) e.strokeTo({ x: a[0] + (b[0] - a[0]) * i / 30, y: a[1] + (b[1] - a[1]) * i / 30 }, 1); e.endStroke(); }"""
DAB = """([x, y, size, hardness]) => { const e = window.formvis.engine; e.setBrush({ diameter: size, hardness, opacity: 1 }); e.beginStroke({ x, y }, false, 1); e.endStroke(); }"""
ROW = "([y, x0, x1]) => { const d = window.formvis.engine.activeLayer.raster.ctx.getImageData(x0, y, x1 - x0, 1).data, out = []; for (let i = 0; i < d.length; i += 4) out.push([d[i], d[i + 1], d[i + 2], d[i + 3]]); return out; }"
OFF = "{ color: { on: false, fgBg: 0, hue: 0, saturation: 0, brightness: 0 }, transfer: { on: false, opacity: 0, flow: 0, control: 'off' }, noise: false, wetEdges: false }"


def test_color_dynamics_mixes_towards_the_background(page):
    page.evaluate(SETUP, {"color": {"on": True, "fgBg": 100, "hue": 0, "saturation": 0, "brightness": 0}, "spacing": 30})
    page.evaluate(STROKE, [[20, 60], [280, 60], 24, 1])
    row = [p for p in page.evaluate(ROW, [60, 20, 280]) if p[3] > 200]
    blues = [p for p in row if p[2] > p[0]]
    assert len(row) > 100 and blues and len(blues) < len(row), (len(row), len(blues))           # red to blue, both there


def test_transfer_varies_each_dabs_opacity(page):
    page.evaluate(SETUP, {"transfer": {"on": True, "opacity": 100, "flow": 0, "control": "off"}, "spacing": 200})
    page.evaluate(STROKE, [[20, 60], [280, 60], 20, 1])
    alphas = sorted({p[3] for p in page.evaluate(ROW, [60, 20, 280]) if p[3] > 0})
    assert len(alphas) >= 3 and alphas[0] < alphas[-1] - 60, alphas                             # dabs of different opacity


def test_wet_edges_lighten_the_middle_and_noise_roughens_the_edge(page):
    page.evaluate(SETUP, {"wetEdges": True})
    page.evaluate(DAB, [60, 60, 60, 1])
    centre, rim = page.evaluate(ROW, [60, 60, 61])[0][3], page.evaluate(ROW, [60, 86, 87])[0][3]
    assert centre < rim - 40, (centre, rim)                                                     # lighter in the middle
    def edge_roughness(noise):
        page.evaluate(SETUP, {"noise": noise, "wetEdges": False})                              # noise alone
        page.evaluate(DAB, [150, 60, 60, 0.2])
        ring = [p[3] for p in page.evaluate(ROW, [60, 150, 182])]                              # the centre out past the edge
        return sum(abs(a - b) for a, b in zip(ring, ring[1:]))
    assert edge_roughness(True) > edge_roughness(False) * 1.5                                   # rougher with noise


def test_with_everything_off_a_stroke_is_as_before(page):
    page.evaluate(SETUP, {**{}, "spacing": None})
    page.evaluate("(off) => { const e = window.formvis.engine; e.brushShape = { ...e.brushShape, ...off }; }", {"color": {"on": False, "fgBg": 0, "hue": 0, "saturation": 0, "brightness": 0}, "transfer": {"on": False, "opacity": 0, "flow": 0, "control": "off"}, "noise": False, "wetEdges": False})
    page.evaluate(STROKE, [[20, 60], [280, 60], 20, 1])
    core = page.evaluate(ROW, [60, 40, 260])
    # Solid foreground, as before this build (compositing rounds a channel by one: 220, 19, 19).
    assert all(p[3] == 255 and all(abs(u - v) <= 1 for u, v in zip(p[:3], [220, 20, 20])) for p in core), {tuple(p) for p in core}


def test_the_panel_shows_the_new_sections(page):
    page.evaluate("window.formvis.engine.newDocument(100, 60, 'P', 'white'); window.formvis.engine.setTool('brush')")
    page.evaluate("window.formvis.commands.run('brush-settings')")
    heads = page.locator(".cv-scrim:not([hidden]) .cv-prefs-sub").all_inner_texts()
    for h in ["Color Dynamics", "Transfer", "Noise and Wet Edges"]:
        assert h in heads, heads
    page.keyboard.press("Escape")
