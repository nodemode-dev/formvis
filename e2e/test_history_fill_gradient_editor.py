def test_history_fill_restores_the_opening_pixels_inside_the_selection(page):
    r = page.evaluate("""async () => {
      const e = window.formvis.engine, E = await import('/src/engine/index.ts'), sel = (x, y, w, h) => E.SelectionMask.cropped(x, y, w, h, new Uint8Array(w * h).fill(255));
      e.newDocument(120, 80, 'H', 'white');
      e.fg = { r: 220, g: 30, b: 30 }; e.fill('fg');
      e.fg = { r: 30, g: 30, b: 220 }; e.applySelection(sel(0, 0, 60, 80), 'replace', 's'); e.fill('fg');
      e.applySelection(sel(20, 20, 40, 40), 'replace', 's');
      e.fillWith({ history: true }, 'normal', 1, false);
      const c = e.flattened().getContext('2d'), px = (x, y) => Array.from(c.getImageData(x, y, 1, 1).data).slice(0, 3);
      return { inside: px(30, 30), outsideBlue: px(5, 5), outsideRed: px(100, 40), step: e.historySteps.names.slice(-1)[0] };
    }""")
    assert r == {"inside": [255, 255, 255], "outsideBlue": [30, 30, 220], "outsideRed": [220, 30, 30], "step": "Fill"}, r


def test_gradient_editor_adds_a_stop_and_saves(page):
    page.evaluate("(() => { const e = window.formvis.engine; e.newDocument(200, 100, 'G', 'white'); e.fg = { r: 0, g: 0, b: 0 }; e.bg = { r: 255, g: 255, b: 255 }; e.gradientSettings.style = 'background'; e.setTool('gradient'); if (e.tool !== 'gradient') throw new Error('tool'); })()")
    page.evaluate("document.querySelector('.cv-opt-more:not([hidden])[aria-expanded=false]')?.click()")
    page.locator(".cv-opt-group:not([hidden]) button, .cv-opt-pop-sect[style*=contents] button", has_text="Edit").first.click()
    d = page.locator(".cv-scrim:not([hidden]) .cv-dialog")
    d.locator(".cv-grad-strip").last.wait_for(state="visible")                                 # the opacity strip is first, the colour strip last
    box = d.locator(".cv-grad-strip").last.bounding_box()
    page.mouse.click(box["x"] + box["width"] * 0.5, box["y"] + box["height"] / 2)
    d.locator(".cv-field", has_text="Stop color").locator("input[type=color]").evaluate("(i) => { i.value = '#ff0000'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); }")
    d.locator("input[type=text]").fill("Black red white")
    d.locator("button", has_text="New").click()
    stored = page.evaluate("JSON.parse(localStorage.getItem('formvis.gradients')).map((g) => [g.label, g.stops.length])")
    assert stored == [["Black red white", 3]], stored
    d.locator(".cv-dialog-foot button", has_text="OK").click()
    page.wait_for_timeout(200)
    mid = page.evaluate("""(() => { const e = window.formvis.engine; e.beginGradient({ x: 0, y: 50 }); e.updateGradient({ x: 0, y: 50 }, { x: 200, y: 50 }); e.commitGradient();
      return Array.from(e.flattened().getContext('2d').getImageData(100, 50, 1, 1).data).slice(0, 3); })()""")
    assert mid[0] > 200 and mid[1] < 60 and mid[2] < 60, mid
