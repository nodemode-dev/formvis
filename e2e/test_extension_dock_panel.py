"""A Form extension's dock panel is a panel group like the app's own (fix/extension-dock-panels).

In 2.1.0 an extension panel was a bare section the dock never wired: no grip, it could not be dragged, it always sat
last, and its title wrapped into the empty grip slot. The panel is opened here through the same dock adapter that
FormExtensions uses (window.formvis.extDock in the dev build), so no engine, FormPortal or consent is involved.
"""

# Each shown section in the dock by its own class (cv-preset-panel and cv-group are shared, so skipped).
ORDER = "[...document.querySelectorAll('.cv-layers > section')].filter((s) => !s.hidden && !s.classList.contains('is-empty')).map((s) => [...s.classList].find((c) => c.startsWith('cv-') && !['cv-preset-panel', 'cv-group', 'cv-ext-group'].includes(c)).replace('cv-', ''))"
ID = "ext-demo-main"
SEC = f"section.cv-{ID}"


def test_extension_panel_is_a_movable_panel_group(page):
    try:
        page.evaluate("window.formvis.engine.newDocument(200, 100, 'D', 'white')")   # a document, so the Home screen is not over the dock
        page.evaluate("window.formvis.commands.run('extensions-panel')")
        before = page.evaluate(ORDER)
        assert before[-1] == "extensions", before
        assert page.evaluate(f"!!window.formvis.extDock.add('{ID}', 'Demo Ext').appendChild(Object.assign(document.createElement('div'), {{ style: 'height: 300px' }}))")

        # A real group: the grip, the tab chip with the name on one line, Minimize, and the dock's drag on its header.
        group = page.evaluate(f"""(() => {{
          const s = document.querySelector('{SEC}'), head = s.querySelector(':scope > .cv-panel-head'), tab = s.querySelector('.cv-group-tab');
          return {{ group: s.classList.contains('cv-group') && s.classList.contains('cv-ext-group'), grip: !!head.querySelector('.cv-group-grip'),
                   wired: head.classList.contains('cv-dock-grip'), min: !!head.querySelector('.cv-group-min'), tab: tab.textContent,
                   tabH: tab.getBoundingClientRect().height, headH: head.getBoundingClientRect().height }};
        }})()""")
        assert group["group"] and group["grip"] and group["wired"] and group["min"], group
        assert group["tab"] == "Demo Ext" and group["tabH"] <= 30 and group["headH"] <= 44, group   # one line, not wrapped

        # Placed right after the Extensions panel, not forced last.
        assert page.evaluate(ORDER) == [*before, ID]

        # Movable: dragged by its header's empty part (as test_docking) to the top of the dock, above the Navigator, and
        # remembered in the dock's order.
        page.locator(f"{SEC} > .cv-panel-head").scroll_into_view_if_needed()   # the dock column scrolls; it sits last
        h = page.locator(f"{SEC} > .cv-panel-head > span").first.bounding_box()
        n = page.locator(".cv-navigator > .cv-panel-head").bounding_box()      # scrolled above: the nearest gap is the top
        page.mouse.move(h["x"] + h["width"] / 2, h["y"] + h["height"] / 2); page.mouse.down()
        page.mouse.move(n["x"] + 60, n["y"] + 2, steps=14); page.mouse.up()
        assert page.evaluate(ORDER)[0] == ID, page.evaluate(ORDER)
        assert ID in page.evaluate("JSON.parse(localStorage.getItem('formvis.dock')).order")

        # Minimize folds it to its header, and the title can change in place.
        page.locator(f"{SEC} .cv-group-min").click()
        assert page.evaluate(f"document.querySelector('{SEC} > .cv-group-body').hidden")
        page.locator(f"{SEC} .cv-group-min").click()
        page.evaluate(f"window.formvis.extDock.setLabel('{ID}', 'Demo Ext: Settings')")
        assert page.locator(f"{SEC} .cv-group-tab").text_content() == "Demo Ext: Settings"

        # Closing takes the group, its tab and its Window command away.
        page.evaluate(f"window.formvis.extDock.remove('{ID}')")
        assert page.evaluate(f"!document.querySelector('{SEC}') && !document.querySelector('[data-tab=\"{ID}-tab\"]')")
        assert ID not in page.evaluate(ORDER)
        assert not page.evaluate(f"!!window.formvis.commands.get('panel-{ID}')")
        assert page.errors == []
    finally:
        page.evaluate("localStorage.removeItem('formvis.dock'); localStorage.removeItem('formvis.groups')")
