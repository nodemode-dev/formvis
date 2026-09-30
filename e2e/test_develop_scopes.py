# Develop's scopes (1.53.4): a histogram, waveform and vectorscope of the developed preview, live.
DLG = ".cv-scrim:not([hidden]) .cv-dialog"
PIXELS = """() => { const c = document.querySelector('.cv-scrim:not([hidden]) .cv-scopes-canvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let lit = 0, sum = 0; for (let i = 0; i < d.length; i += 4) { if (d[i + 3]) lit++; sum += ((i / 4) % c.width) * (d[i] + d[i + 1] + d[i + 2]); } return [lit, sum]; }"""   # each pixel weighted by its column, so a sideways shift registers


def test_scopes_follow_the_developed_preview(page):
    page.evaluate("""() => { const e = window.formvis.engine; e.newDocument(200, 100, 'D', 'white');
      const c = e.activeLayer.raster.ctx; c.fillStyle = 'rgb(200,40,40)'; c.fillRect(0, 0, 100, 100); c.fillStyle = 'rgb(40,60,200)'; c.fillRect(100, 0, 100, 100); e.activeLayer.raster.touch();
      window.formvis.commands.run('filter-develop'); }""")
    page.locator(f"{DLG} .cv-scopes").wait_for(timeout=15000)
    page.wait_for_function(f"() => ({PIXELS})()[0] > 50", timeout=15000)                     # drawn once the preview ran
    before = page.evaluate(PIXELS)
    page.evaluate("""() => { const r = document.querySelector('.cv-scrim:not([hidden]) input[type=range][aria-label="Exposure (EV)"]');
      r.value = '1.5'; r.dispatchEvent(new Event('input', { bubbles: true })); }""")        # as a drag does; the row may be in a closed group
    page.wait_for_function(f"(b) => {{ const now = ({PIXELS})(); return now[1] !== b[1]; }}", arg=before, timeout=15000)   # it moved with the slider
    page.locator(f"{DLG} select[aria-label='Scope']").select_option("vectorscope")
    lit = page.evaluate("""() => { const c = document.querySelector('.cv-scrim:not([hidden]) .cv-scopes-canvas'), W = c.width, H = c.height, d = c.getContext('2d').getImageData(0, 0, W, H).data;
      let ul = 0; for (let y = 0; y < H / 2; y++) for (let x = 0; x < W / 2; x++) { const i = (y * W + x) * 4; if (d[i] > 150 && d[i + 1] > 150) ul++; } return ul; }""")
    assert lit > 0                                                                               # red shows up and to the left of centre
