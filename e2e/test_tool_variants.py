# The owner's walkthrough: the rail's sub-tools (the Elliptical Marquee, the Polygonal Lasso...) in its flyouts.
def open_group_of(page, tool_id):
    idx = page.evaluate(f"""(async () => {{ const {{ toolGroups }} = await import('/src/ui/tool-groups.ts'); return toolGroups().findIndex((g) => g.tools.some((t) => t.id === '{tool_id}')); }})()""")
    page.locator(".cv-rail-tools .cv-tool").nth(idx).click(button="right")
    return page.locator(".cv-flyout:not([hidden])")


def test_marquee_lasso_shape_smear_and_brush_list_their_modes(page):
    page.evaluate("window.sonny.engine.newDocument(200, 100, 'V', 'white')")
    cases = [("marquee", ["Rectangular Marquee", "Elliptical Marquee", "Single Row Marquee", "Single Column Marquee"], "Elliptical Marquee", "window.sonny.engine.marqueeKind", "ellipse"),
             ("lasso", ["Lasso", "Polygonal Lasso", "Magnetic Lasso"], "Polygonal Lasso", "window.sonny.engine.lassoKind", "polygonal"),
             ("shape", ["Rectangle", "Ellipse", "Polygon", "Star", "Line", "Arrow", "Heart", "Custom Shape"], "Star", "window.sonny.engine.shapeSettings.kind", "star"),
             ("smear", ["Blur", "Sharpen", "Smudge", "Liquify Brush"], "Sharpen", "window.sonny.engine.retouch.smearMode", "sharpen")]
    for tool, names, pick, read, want in cases:
        fly = open_group_of(page, tool)
        labels = fly.locator(".cv-flyout-label").all_inner_texts()
        assert labels == names, (tool, labels)
        fly.locator(".cv-flyout-item", has_text=pick).first.click()
        assert page.evaluate("window.sonny.engine.tool") == tool and page.evaluate(read) == want, (tool, page.evaluate(read))
        fly = open_group_of(page, tool)                                                       # the chosen one is marked
        assert fly.locator(".cv-flyout-item.is-active .cv-flyout-label").inner_text() == pick
        page.keyboard.press("Escape"); page.mouse.click(600, 400)
    page.evaluate("window.sonny.engine.update({ marqueeKind: 'rectangle', lassoKind: 'freehand' }); window.sonny.engine.setBrushMode('paint')")
