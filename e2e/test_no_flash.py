# The owner's rule: zero DOM flashes. During common actions nothing on screen may be torn down and rebuilt; only what
# is truly new content may go (a toast ending, another document's own layer rows, a dialog brought to the top).
WATCH = """() => { window.__rm = []; window.__mo?.disconnect(); window.__mo = new MutationObserver((ms) => { for (const m of ms) for (const n of m.removedNodes) if (n.nodeType === 1)
  window.__rm.push((n.className && n.className.toString ? n.className.toString() : n.tagName)); }); window.__mo.observe(document.body, { childList: true, subtree: true }); }"""
ALLOWED = ("cv-toast", "cv-layer", "cv-scrim")


def removed(page, action):
    page.evaluate(WATCH); action(); page.wait_for_timeout(350)
    return [r for r in page.evaluate("window.__rm") if not r.startswith(ALLOWED)]


def test_common_actions_rebuild_nothing(page):
    page.evaluate("window.formvis.engine.newDocument(600, 400, 'A', 'white'); window.formvis.engine.addLayer(); window.formvis.engine.newDocument(500, 300, 'B', 'white')")
    page.wait_for_timeout(400)
    tools = page.locator(".cv-rail-tools .cv-tool")
    r = page.locator(".cv-stage").bounding_box()

    def stroke():
        page.evaluate("window.formvis.engine.setTool('brush')")
        page.mouse.move(r["x"] + 300, r["y"] + 300); page.mouse.down(); page.mouse.move(r["x"] + 500, r["y"] + 350, steps=10); page.mouse.up()

    actions = {
        "rail: brush": lambda: tools.nth(6).click(),
        "rail: marquee": lambda: tools.nth(1).click(),
        "tab switch": lambda: page.locator(".cv-tab").nth(0).click(),
        "open Preferences": lambda: page.evaluate("window.formvis.commands.run('settings')"),
        "close dialog": lambda: page.keyboard.press("Escape"),
        "open Filter menu": lambda: page.locator(".cv-menu-btn", has_text="Filter").click(),
        "close menu": lambda: page.keyboard.press("Escape"),
        "paint a stroke": stroke,
        "select a layer": lambda: page.locator(".cv-layer").nth(1).click(),
        "brush size": lambda: page.evaluate("window.formvis.engine.setBrush({ diameter: 60 })"),
    }
    found = {name: removed(page, act) for name, act in actions.items()}
    assert all(not v for v in found.values()), {k: v for k, v in found.items() if v}
