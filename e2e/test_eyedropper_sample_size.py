SETUP = """async () => { const e = window.sonny.engine, E = await import('/src/engine/index.ts'); e.newDocument(60, 40, 'E', 'transparent');
  const W = 60, H = 40, red = new Uint8Array(W * H);
  for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) if (((x >> 1) + (y >> 1)) % 2 === 0) red[y * W + x] = 255;   // 2 px red squares
  e.fg = { r: 20, g: 40, b: 220 }; e.applySelection(E.SelectionMask.cropped(0, 0, 40, 40, new Uint8Array(1600).fill(255)), 'replace', 's'); e.fill('fg');
  e.fg = { r: 220, g: 20, b: 20 }; e.applySelection(E.SelectionMask.cropped(0, 0, W, H, red), 'replace', 's'); e.fill('fg'); e.deselect();
  e.setTool('eyedropper'); if (e.tool !== 'eyedropper') throw new Error('tool');
  const v = e.current.viewport, b = document.querySelector('.cv-stage').getBoundingClientRect(); return [b.left + v.panX, b.top + v.panY, v.zoom]; }"""
FG = "(() => { const c = window.sonny.engine.fg; return [c.r, c.g, c.b]; })()"


def test_eyedropper_sample_size_averages_a_square(page):
    s = page.evaluate(SETUP)
    click = lambda x, y: page.mouse.click(s[0] + (x + 0.5) * s[2], s[1] + (y + 0.5) * s[2])
    size = page.locator(".cv-opt-group:not([hidden]) .cv-opt", has_text="Sample Size").locator("select")
    assert size.input_value() == "1"                                     # Point Sample by default
    click(0, 0); assert page.evaluate(FG) == [220, 20, 20]             # a red pixel exactly
    click(2, 0); assert page.evaluate(FG) == [20, 40, 220]             # a blue one
    size.select_option("11")                                            # 11 by 11 over the checkerboard: near an even mix
    click(20, 20)
    r, g, b = page.evaluate(FG)
    assert 100 <= r <= 140 and 100 <= b <= 140 and 25 <= g <= 35, (r, g, b)
    click(45, 20)                                                        # past the pattern: transparent, weighted out entirely
    size.select_option("11")
    click(42, 20)                                                        # straddling: only the opaque pixels count
    r, g, b = page.evaluate(FG)
    assert 20 <= r <= 220 and 20 <= b <= 220 and r + b > 200, (r, g, b)
