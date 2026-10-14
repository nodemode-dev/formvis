IN = "(sel) => { const s = document.querySelector(sel); return s ? (s.closest('.cv-props-col') ? 'side' : s.closest('.cv-layers') ? 'dock' : 'elsewhere') : null; }"
RESET = "localStorage.removeItem('formvis.dock'); localStorage.removeItem('formvis.propsOpenW'); localStorage.removeItem('formvis.dock.heights')"


def drag_head(page, sel, to_x, to_y):
    h = page.locator(f"{sel} > .cv-panel-head > span").first.bounding_box()                # the header's empty part: the whole group
    page.mouse.move(h["x"] + h["width"] / 2, h["y"] + h["height"] / 2); page.mouse.down()
    page.mouse.move(to_x, to_y, steps=12); page.mouse.up()


def test_panels_move_between_the_columns_and_stay(page):
    try:
        page.evaluate("window.formvis.engine.newDocument(300, 200, 'D', 'white')")
        assert page.evaluate(IN, "section.cv-brushes") == "side" and page.evaluate(IN, "section.cv-navigator") == "dock"
        lay = page.locator(".cv-layers-panel").bounding_box()
        drag_head(page, "section.cv-brushes", lay["x"] + 80, lay["y"] + 2)                    # into the dock, above Layers
        assert page.evaluate(IN, "section.cv-brushes") == "dock"
        side = page.locator(".cv-props-col").bounding_box()
        drag_head(page, "section.cv-navigator", side["x"] + 100, side["y"] + side["height"] - 30)   # into the side column
        assert page.evaluate(IN, "section.cv-navigator") == "side"
        page.reload(); page.wait_for_function("window.formvis && window.formvis.engine")
        assert page.evaluate(IN, "section.cv-brushes") == "dock" and page.evaluate(IN, "section.cv-navigator") == "side"   # remembered
    finally:
        page.evaluate(RESET); page.reload(); page.wait_for_function("window.formvis && window.formvis.engine")


def test_merge_and_separate_the_columns(page):
    try:
        page.evaluate("window.formvis.engine.newDocument(300, 200, 'M', 'white'); window.formvis.commands.run('merge-columns')")
        page.wait_for_timeout(200)
        assert not page.locator(".cv-props-col").is_visible()
        assert all(page.evaluate(IN, f"section.cv-{g}") == "dock" for g in ["properties", "brushes", "paragraph", "character"])
        page.evaluate("window.formvis.commands.run('merge-columns')")                          # separate
        page.wait_for_timeout(200)
        assert page.locator(".cv-props-col").is_visible() and page.evaluate(IN, "section.cv-brushes") == "side"
    finally:
        page.evaluate(RESET); page.reload(); page.wait_for_function("window.formvis && window.formvis.engine")


def test_the_side_column_is_as_wide_as_dragged(page):
    try:
        page.evaluate("window.formvis.engine.newDocument(300, 200, 'W', 'white')")
        w0 = page.locator(".cv-props-col").bounding_box()["width"]
        g = page.locator(".cv-props-resize").bounding_box()
        page.mouse.move(g["x"] + 3, g["y"] + 200); page.mouse.down(); page.mouse.move(g["x"] - 57, g["y"] + 200, steps=6); page.mouse.up()
        w1 = page.locator(".cv-props-col").bounding_box()["width"]
        assert abs(w1 - (w0 + 60)) <= 3, (w0, w1)
        page.reload(); page.wait_for_function("window.formvis && window.formvis.engine")
        page.evaluate("window.formvis.engine.newDocument(300, 200, 'W2', 'white')")
        assert abs(page.locator(".cv-props-col").bounding_box()["width"] - w1) <= 3               # remembered
    finally:
        page.evaluate(RESET); page.reload(); page.wait_for_function("window.formvis && window.formvis.engine")


TABS = "(sel) => [...document.querySelectorAll(sel + ' > .cv-group-head .cv-group-tab')].map((t) => t.textContent)"


def test_a_tab_moves_to_another_group_stays_and_resets(page):
    try:
        page.evaluate("window.formvis.engine.newDocument(300, 200, 'T', 'white')")
        tab = page.locator("section.cv-swatches .cv-group-tab", has_text="Color").bounding_box()
        nav = page.locator("section.cv-navigator > .cv-group-head").bounding_box()
        page.mouse.move(tab["x"] + 10, tab["y"] + 10); page.mouse.down()
        page.mouse.move(nav["x"] + nav["width"] / 2, nav["y"] + nav["height"] / 2, steps=12); page.mouse.up()
        assert page.evaluate(TABS, "section.cv-navigator") == ["Navigator", "Color"]
        assert page.evaluate(TABS, "section.cv-swatches") == ["Swatches"]
        assert page.locator("section.cv-navigator .cv-color-sv").is_visible()                  # its page came along, shown
        page.reload(); page.wait_for_function("window.formvis && window.formvis.engine")
        assert page.evaluate(TABS, "section.cv-navigator") == ["Navigator", "Color"]             # remembered
        page.evaluate("window.formvis.commands.run('reset-panels')")
        assert page.evaluate(TABS, "section.cv-swatches") == ["Swatches", "Color"] and page.evaluate(TABS, "section.cv-navigator") == ["Navigator"]
    finally:
        page.evaluate(RESET + "; localStorage.removeItem('formvis.tabHomes')"); page.reload(); page.wait_for_function("window.formvis && window.formvis.engine")


def test_the_layers_groups_tabs_move_both_ways(page):
    try:
        page.evaluate("window.formvis.engine.newDocument(300, 200, 'X', 'white')")
        def drag_tab(tab_sel, text, to_sel):
            t = page.locator(tab_sel, has_text=text).first.bounding_box(); h = page.locator(f"{to_sel} > .cv-group-head").bounding_box()
            page.mouse.move(t["x"] + 10, t["y"] + 10); page.mouse.down()
            page.mouse.move(h["x"] + h["width"] / 2, h["y"] + h["height"] / 2, steps=12); page.mouse.up()
        drag_tab("section.cv-layers-panel .cv-group-tab", "Channels", "section.cv-navigator")            # out of the Layers group
        assert page.evaluate(TABS, "section.cv-navigator") == ["Navigator", "Channels"]
        page.wait_for_timeout(400)
        assert page.evaluate("document.querySelector('section.cv-navigator .cv-ch-thumb').getContext('2d').getImageData(20, 15, 1, 1).data[3]") > 0   # it works there
        drag_tab("section.cv-swatches .cv-group-tab", "Color", "section.cv-layers-panel")                  # into it
        assert page.evaluate(TABS, "section.cv-layers-panel") == ["Layers", "Paths", "Color"]
    finally:
        page.evaluate(RESET + "; localStorage.removeItem('formvis.tabHomes')"); page.reload(); page.wait_for_function("window.formvis && window.formvis.engine")


def test_a_tab_detaches_into_a_new_group_that_stays_and_goes_when_emptied(page):
    try:
        page.evaluate("window.formvis.engine.newDocument(300, 200, 'N', 'white')")
        t = page.locator("section.cv-swatches .cv-group-tab", has_text="Color").bounding_box()
        lay = page.locator("section.cv-layers-panel").bounding_box()
        page.mouse.move(t["x"] + 10, t["y"] + 10); page.mouse.down()
        page.mouse.move(lay["x"] + 100, lay["y"] - 8, steps=12)                               # over the Swatches body, above Layers
        assert page.evaluate("document.querySelector('.cv-dock-marker').dataset.label") == "New group"   # said while dragging
        page.mouse.up()
        new = page.evaluate("[...document.querySelectorAll('.cv-layers > section')].filter((s) => /^cv-g[0-9a-z]+$/.test(s.className.split(' ')[0])).map((s) => s.className.split(' ')[0])")
        assert len(new) == 1, new
        assert page.evaluate(TABS, f"section.{new[0]}") == ["Color"] and page.evaluate(TABS, "section.cv-swatches") == ["Swatches"]
        order = page.evaluate("[...document.querySelectorAll('.cv-layers > section')].filter((s) => !s.hidden && getComputedStyle(s).display !== 'none').map((s) => s.className.split(' ')[0])")
        assert order.index(new[0]) == order.index("cv-layers-panel") - 1, order                 # where it was dropped
        page.reload(); page.wait_for_function("window.formvis && window.formvis.engine")
        assert page.evaluate(TABS, f"section.{new[0]}") == ["Color"]                             # kept
        t = page.locator(f"section.{new[0]} .cv-group-tab", has_text="Color").bounding_box()
        sw = page.locator("section.cv-swatches > .cv-group-head").bounding_box()
        # a single-tab group moves whole by its tab, so drag it back by moving the tab into Swatches from the other side:
        page.evaluate(f"(async () => {{ const {{ PanelGroup }} = await import('/src/ui/panel-group.ts'); PanelGroup.moveTab('color', PanelGroup.all.get('{new[0][3:]}'), PanelGroup.all.get('swatches')); PanelGroup.saveHomes(); }})()")
        page.wait_for_timeout(200)
        assert page.locator(f"section.{new[0]}").count() == 0 and page.evaluate("localStorage.getItem('formvis.customGroups')") == "[]"   # gone when emptied
    finally:
        page.evaluate(RESET + "; localStorage.removeItem('formvis.tabHomes'); localStorage.removeItem('formvis.customGroups')"); page.reload(); page.wait_for_function("window.formvis && window.formvis.engine")


def test_moving_a_group_shows_a_ghost_and_says_move_here(page):
    page.evaluate("window.formvis.engine.newDocument(300, 200, 'G', 'white')")
    h = page.locator("section.cv-navigator > .cv-panel-head > span").first.bounding_box()
    lay = page.locator("section.cv-layers-panel").bounding_box()
    page.mouse.move(h["x"] + h["width"] / 2, h["y"] + h["height"] / 2); page.mouse.down()
    page.mouse.move(lay["x"] + 80, lay["y"] + lay["height"] / 2, steps=10)
    assert page.locator(".cv-drag-ghost").inner_text() == "Navigator"
    assert page.evaluate("document.querySelector('.cv-dock-marker').dataset.label") == "Move here"
    page.keyboard.press("Escape"); page.mouse.up()
    page.evaluate("localStorage.removeItem('formvis.dock')"); page.reload(); page.wait_for_function("window.formvis && window.formvis.engine")


def test_the_grip_sits_in_one_place_and_a_group_holds_seven_tabs_at_most(page):
    try:
        page.evaluate("window.formvis.engine.newDocument(300, 200, 'S', 'white'); window.formvis.engine.newFrame(); window.formvis.commands.run('panel-timeline')")   # frames, so the command shows the dock's Timeline (1.59.8)
        offs = page.evaluate("[...document.querySelectorAll('.cv-group-grip')].filter((g) => g.offsetParent).map((g) => Math.round(g.getBoundingClientRect().left - g.parentElement.getBoundingClientRect().left))")
        assert len(offs) >= 8 and len(set(offs)) == 1, offs                                     # the same place in every header
        # Fill the Navigator's group to seven tabs, then drag an eighth at it.
        page.evaluate("""(async () => { const { PanelGroup } = await import('/src/ui/panel-group.ts'), nav = PanelGroup.all.get('navigator');
          for (const [tid, from] of [['color', 'swatches'], ['brush-settings', 'brushes'], ['channels', 'layers-panel'], ['paths', 'layers-panel'], ['paragraph', 'paragraph'], ['character', 'character']]) PanelGroup.moveTab(tid, PanelGroup.all.get(from), nav); })()""")
        assert page.evaluate(TABS, "section.cv-navigator") == ["Navigator", "Color", "Brush Settings", "Channels", "Paths", "Paragraph", "Character"]
        # Brushes alone would move its whole group; with Swatches beside it, its tab drags itself.
        page.evaluate("(async () => { const { PanelGroup } = await import('/src/ui/panel-group.ts'); PanelGroup.moveTab('swatches', PanelGroup.all.get('swatches'), PanelGroup.all.get('brushes')); })()")
        t = page.locator("section.cv-brushes .cv-group-tab", has_text="Brushes").bounding_box()
        nav = page.locator("section.cv-navigator > .cv-group-head").bounding_box()
        page.mouse.move(t["x"] + 10, t["y"] + 10); page.mouse.down()
        page.mouse.move(nav["x"] + nav["width"] / 2, nav["y"] + nav["height"] / 2, steps=12)
        assert "is-tab-full" in page.locator("section.cv-navigator").get_attribute("class")          # it says it is full
        page.mouse.up()
        assert len(page.evaluate(TABS, "section.cv-navigator")) == 7 and "Brushes" in page.evaluate(TABS, "section.cv-brushes")   # refused
    finally:
        page.evaluate(RESET + "; localStorage.removeItem('formvis.tabHomes'); localStorage.removeItem('formvis.customGroups')"); page.reload(); page.wait_for_function("window.formvis && window.formvis.engine")
