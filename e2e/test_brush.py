STROKE = """([pressures, sizeMin]) => {
  const e = window.sonny.engine;
  e.newDocument(200, 100, 'B', 'white');
  e.addLayer();
  e.fg = { r: 0, g: 0, b: 0 }; e.setBrush({ diameter: 40, hardness: 1, opacity: 1 });
  e.brushDynamics = sizeMin === null ? { size: { enabled: false, strength: 1, min: 0, max: 1, sensors: [], combine: 'mul' }, flow: { enabled: false, strength: 1, min: 0, max: 1, sensors: [], combine: 'mul' } }
    : { size: { enabled: true, strength: 1, min: sizeMin, max: 1, sensors: [{ id: 'pressure' }], combine: 'mul' }, flow: { enabled: false, strength: 1, min: 0, max: 1, sensors: [], combine: 'mul' } };
  e.beginStroke({ x: 20, y: 50 }, false, pressures[0]);
  for (let i = 1; i <= 16; i++) e.strokeTo({ x: 20 + i * 10, y: 50 }, pressures[0] + (pressures[1] - pressures[0]) * i / 16);
  e.endStroke();
  const c = e.flattened().getContext('2d'), dark = (x, y) => c.getImageData(x, y, 1, 1).data[0] < 128;
  const half = (x) => { let n = 0; for (let y = 50; y < 100 && dark(x, y); y++) n++; return n; };
  return [half(30), half(170), e.historySteps.names.slice(-1)[0]];
}"""


def test_pen_pressure_drives_size_along_the_stroke(page):
    light_to_full = page.evaluate(STROKE, [[0.1, 1.0], 0.2])
    assert light_to_full[2] == "Brush"
    # radius 20 x (0.2 + 0.8 x pressure): about 5.6 px early on (pressure near 0.16), about 19 px near the end
    assert 4 <= light_to_full[0] <= 8, light_to_full
    assert 17 <= light_to_full[1] <= 21, light_to_full


def test_mouse_strokes_are_unchanged(page):
    plain = page.evaluate(STROKE, [[1, 1], None])
    with_dynamics_at_full = page.evaluate(STROKE, [[1, 1], 0.2])
    assert plain[:2] == with_dynamics_at_full[:2] and 19 <= plain[0] <= 21


def test_presets_set_the_brush(page):
    r = page.evaluate("""(() => {
      const e = window.sonny.engine;
      e.commands ? 0 : 0;
      window.sonny.commands.run('tool-brush');
      const sel = [...document.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === 'soft-air'));
      sel.value = 'soft-air'; sel.dispatchEvent(new Event('change', { bubbles: true }));
      return [e.brush.diameter, e.brush.hardness, e.brushDynamics.size.min, e.brushDynamics.flow.min, e.brushPresetId];
    })()""")
    assert r == [64, 0.05, 0.6, 0.15, "soft-air"]
