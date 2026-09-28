SETUP = """async () => { const E = await import('/src/engine/index.ts'), e = window.formvis.engine; e.newDocument(200, 100, 'C', 'white');
  e.fg = { r: 255, g: 0, b: 0 }; e.applySelection(E.SelectionMask.cropped(0, 0, 100, 100, new Uint8Array(10000).fill(255)), 'replace', 's'); e.fill('fg');
  e.fg = { r: 0, g: 0, b: 255 }; e.applySelection(E.SelectionMask.cropped(100, 0, 100, 100, new Uint8Array(10000).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect(); }"""
# What the screen shows at a document point: the scene canvas read through the page's own filter.
SEEN = """([x, y]) => new Promise((res) => { const c = document.querySelector('.cv-stage .cv-scene'), v = window.formvis.engine.current.viewport, p = v.toScreen(x, y), dpr = c.width / c.clientWidth;
  const o = document.createElement('canvas'); o.width = c.width; o.height = c.height; const g = o.getContext('2d');
  g.filter = document.querySelector('.cv-stage').classList.contains('has-channel-view') ? 'url(#cv-channel-view)' : 'none'; g.drawImage(c, 0, 0);
  res(Array.from(g.getImageData(Math.round(p.x * dpr), Math.round(p.y * dpr), 1, 1).data).slice(0, 3)); })"""
PIX = "([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data).slice(0, 3)"


def open_channels(page):
    page.evaluate(SETUP)
    page.locator(".cv-layers-panel .cv-group-tab[data-tab='channels']").click()
    return page.locator(".cv-channels")


def test_a_channel_shows_alone_in_grey_and_the_pixels_stay(page):
    try:
        ch = open_channels(page)
        ch.locator(".cv-ch-row[data-ch='r']").click()
        assert page.evaluate(SEEN, [50, 50]) == [255, 255, 255] and page.evaluate(SEEN, [150, 50]) == [0, 0, 0]
        assert page.evaluate(PIX, [150, 50]) == [0, 0, 255]                                  # the document is untouched
        ch.locator(".cv-ch-row[data-ch='rgb']").click()
        ch.locator(".cv-ch-row[data-ch='b'] .cv-ch-eye").click()                             # hide Blue
        assert page.evaluate(SEEN, [150, 50]) == [0, 0, 0] and page.evaluate(SEEN, [50, 50]) == [255, 0, 0]
        ch.locator(".cv-ch-row[data-ch='rgb'] .cv-ch-eye").click()                           # all shown again
        assert not page.evaluate("document.querySelector('.cv-stage').classList.contains('has-channel-view')")
    finally:
        page.locator(".cv-layers-panel .cv-group-tab[data-tab='layers']").click()


def test_cmd_click_loads_a_channel_as_a_selection_and_thumbnails_are_grey(page):
    try:
        ch = open_channels(page)
        ch.locator(".cv-ch-row[data-ch='r']").click(modifiers=["ControlOrMeta"])
        sel = page.evaluate("(() => { const s = window.formvis.engine.current.selection, at = (x, y) => (x < s.x || y < s.y || x >= s.x + s.w || y >= s.y + s.h ? 0 : s.data[(y - s.y) * s.w + (x - s.x)]); return [at(50, 50), at(150, 50)]; })()")
        assert sel == [255, 0], sel
        assert page.evaluate("window.formvis.engine.historySteps.names.slice(-1)[0]") == "Load Selection"
        page.wait_for_timeout(400)
        px = page.evaluate("(() => { const d = document.querySelector(\".cv-ch-row[data-ch='r'] .cv-ch-thumb\").getContext('2d').getImageData(0, 0, 44, 30).data; return [d[(15 * 44 + 6) * 4], d[(15 * 44 + 6) * 4 + 1], d[(15 * 44 + 38) * 4]]; })()")
        assert px[0] > 200 and px[1] > 200 and px[2] < 40, px                                  # red: white, then black, in grey
    finally:
        page.locator(".cv-layers-panel .cv-group-tab[data-tab='layers']").click()
