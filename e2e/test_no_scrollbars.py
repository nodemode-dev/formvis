# The owner's rule: zero scrollbars anywhere. Every element that can scroll must have scrollbar-width none (what decides
# whether a bar is drawn; the headless test browser hides bars itself, so measuring widths could not catch one).
BARS = """(() => { const out = []; for (const el of [document.documentElement, ...document.querySelectorAll('*')]) {
  const cs = getComputedStyle(el), scrolls = /(auto|scroll)/.test(cs.overflowY + cs.overflowX) || el.tagName === 'TEXTAREA' || el === document.documentElement;
  if (scrolls && cs.scrollbarWidth !== 'none') out.push((el.className || el.tagName).toString().slice(0, 50) + ': ' + cs.scrollbarWidth); }
  return out.slice(0, 8); })()"""


def test_no_scrollbar_is_drawn_in_dialogs_menus_or_panels(page):
    page.set_viewport_size({"width": 1100, "height": 600})                              # small: more things scroll
    try:
        page.evaluate("window.formvis.engine.newDocument(800, 600, 'S', 'white'); for (let i = 0; i < 30; i++) window.formvis.engine.addLayer()")
        page.evaluate("window.formvis.commands.run('panel-history'); window.formvis.commands.run('panel-timeline')")
        assert page.evaluate(BARS) == [], page.evaluate(BARS)                              # the panels, the long layer list
        page.evaluate("window.formvis.commands.run('settings')"); page.wait_for_timeout(200)
        assert page.evaluate(BARS) == [], page.evaluate(BARS)                              # Preferences
        page.keyboard.press("Escape")
        page.evaluate("window.formvis.commands.run('new')"); page.wait_for_timeout(200)
        assert page.evaluate(BARS) == [], page.evaluate(BARS)                              # New Document
        page.keyboard.press("Escape")
        page.locator(".cv-menu-btn", has_text="Filter").click(); page.wait_for_timeout(200)
        assert page.evaluate(BARS) == [], page.evaluate(BARS)                              # a long menu
        page.keyboard.press("Escape")
    finally:
        page.evaluate("window.formvis.commands.run('panel-history'); window.formvis.commands.run('panel-timeline')")
        page.set_viewport_size({"width": 1400, "height": 900})
