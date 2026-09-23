def test_remove_tool_takes_out_a_dot(page):
    s = page.evaluate("""() => {
      const e = window.sonny.engine;
      e.newDocument(200, 120, 'R', 'white');
      const l = e.current.activeLayer, c = l.raster.ctx;
      for (let x = 0; x < 200; x += 8) { c.fillStyle = (x / 8) % 2 ? 'rgb(90,120,150)' : 'rgb(110,140,170)'; c.fillRect(x, 0, 8, 120); }
      c.fillStyle = 'rgb(230,20,20)'; c.beginPath(); c.arc(100, 60, 7, 0, 7); c.fill(); l.raster.touch(); e.refresh();
      e.setTool('remove'); if (e.tool !== 'remove') throw new Error('tool'); e.setBrush({ diameter: 26, hardness: 1 });
      const v = e.current.viewport, r = document.querySelector('.cv-stage').getBoundingClientRect();
      return [r.left + v.panX, r.top + v.panY, v.zoom];
    }""")
    at = lambda x, y: (s[0] + x * s[2], s[1] + y * s[2])
    page.mouse.move(*at(94, 60)); page.mouse.down(); page.mouse.move(*at(100, 60), steps=3); page.mouse.move(*at(106, 60), steps=3); page.mouse.up()
    page.wait_for_timeout(500)
    reds = page.evaluate("(() => { const d = window.sonny.engine.flattened().getContext('2d').getImageData(88, 48, 24, 24).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 180 && d[i + 1] < 80) n++; return n; })()")
    assert reds == 0, reds
    assert page.evaluate("window.sonny.engine.historySteps.names.slice(-1)[0]") == "Remove"
    page.evaluate("window.sonny.engine.undo()")
    assert page.evaluate("window.sonny.engine.flattened().getContext('2d').getImageData(100, 60, 1, 1).data[0]") > 200


def test_remove_wires_and_cables(page):
    r = page.evaluate("""() => {
      const e = window.sonny.engine;
      e.newDocument(240, 140, 'W', 'white');
      const l = e.current.activeLayer, c = l.raster.ctx, g = c.createLinearGradient(0, 0, 0, 140);
      g.addColorStop(0, 'rgb(120,170,230)'); g.addColorStop(1, 'rgb(190,215,240)'); c.fillStyle = g; c.fillRect(0, 0, 240, 140);
      c.strokeStyle = 'rgb(35,35,35)'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, 30); c.quadraticCurveTo(120, 70, 240, 30); c.stroke();
      c.fillStyle = 'rgb(40,40,40)'; c.fillRect(160, 95, 40, 45); l.raster.touch(); e.refresh();
      const px = (x, y) => e.flattened().getContext('2d').getImageData(x, y, 1, 1).data[0];
      const before = [px(120, 50), px(180, 118)];
      if (!window.sonny.commands.run('remove-wires')) throw new Error('command');
      return new Promise((res) => setTimeout(() => res({ before, wire: px(120, 50), building: px(180, 118), step: e.historySteps.names.slice(-1)[0] }), 800));
    }""")
    assert r["before"][0] < 80 and r["wire"] > 110, r
    assert r["building"] < 60 and r["step"] == "Remove Wires and Cables", r
