DLG = ".cv-scrim:not([hidden]) .cv-newdoc"


def open_dialog(page):
    page.evaluate("window.sonny.commands.run('new')")
    page.wait_for_selector(DLG)
    return page.locator(DLG)


def test_it_opens_on_web_large_with_the_name_ready_to_type(page):
    d = open_dialog(page)
    assert d.locator(".cv-nd-card.is-on .cv-nd-name").inner_text() == "Web Large 1920 × 1080"
    assert d.locator("input[aria-label='Width']").input_value() == "1920" and d.locator("input[aria-label='Height']").input_value() == "1080"
    assert page.evaluate("document.activeElement.getAttribute('aria-label')") == "Name"
    assert page.evaluate("(() => { const i = document.activeElement; return i.selectionStart === 0 && i.selectionEnd === i.value.length; })()")
    assert d.locator(".cv-nd-size").inner_text().startswith("1920 × 1080")
    assert d.locator(".cv-nd-meta").inner_text() == "RGB Color · 8 bit · 5.9 MB"          # the target's own example
    page.keyboard.press("Escape")


def test_categories_search_orientation_link_and_units(page):
    d = open_dialog(page)
    d.locator(".cv-nd-cat", has_text="Social").click()
    assert "Instagram Square" in d.locator(".cv-nd-cards").inner_text()
    d.locator(".cv-nd-search").fill("iphone")                                              # across every category
    names = d.locator(".cv-nd-card .cv-nd-name").all_inner_texts()
    assert names and all("iPhone" in n for n in names), names
    d.locator(".cv-nd-card", has_text="iPhone 15 Pro Max").click()
    assert d.locator("input[aria-label='Width']").input_value() == "1290"
    d.locator("button[aria-label='Landscape']").click()                                    # the sides swap
    assert d.locator("input[aria-label='Width']").input_value() == "2796" and d.locator("input[aria-label='Height']").input_value() == "1290"
    w = d.locator("input[aria-label='Width']")
    w.fill("1398"); w.press("Tab")                                                          # linked: the height follows
    assert d.locator("input[aria-label='Height']").input_value() == "645"
    d.locator(".cv-nd-search").fill("")
    d.locator(".cv-nd-cat", has_text="Photo").click()
    d.locator(".cv-nd-card", has_text="Landscape 4 × 6").click()
    d.locator("select[aria-label='Unit']").select_option("in")                               # 1800 px at 300 ppi
    assert d.locator("input[aria-label='Width']").input_value() == "6" and d.locator("input[aria-label='Height']").input_value() == "4"
    page.keyboard.press("Escape")


def test_create_makes_the_document_with_its_resolution_and_an_artboard(page):
    d = open_dialog(page)
    d.locator(".cv-nd-cat", has_text="Print").click()
    d.locator(".cv-nd-card", has_text="A5").click()
    d.locator("input[aria-label='Name']").fill("Flyer")
    d.locator("input[aria-label='Artboards']").check()
    d.locator(".cv-dialog-foot button", has_text="Create").click()
    got = page.evaluate("(() => { const p = window.sonny.engine.current; return { w: p.doc.width, h: p.doc.height, r: p.doc.resolution, boards: window.sonny.engine.artboards().length }; })()")
    assert got == {"w": 1748, "h": 2480, "r": 300, "boards": 1}, got
    assert not page.locator(DLG).count()


def test_previews_fit_their_cards_and_color_mode_opens(page):
    d = open_dialog(page)
    d.locator(".cv-nd-cat", has_text="Social").click()
    assert page.evaluate("[...document.querySelectorAll('.cv-nd-card')].every((c) => { const a = c.getBoundingClientRect(), b = c.querySelector('.cv-nd-page').getBoundingClientRect(); return b.left >= a.left - 0.5 && b.right <= a.right + 0.5; })")
    assert page.evaluate("[...document.querySelectorAll('.cv-newdoc select.cv-dd-native')].every((s) => getComputedStyle(s).opacity === '0')")   # no stray line
    d.locator(".cv-dd-btn[aria-label='Color Mode']").click()
    assert page.locator(".cv-dd-pop:not([hidden]) .cv-dd-item", has_text="RGB Color").is_visible()
    page.keyboard.press("Escape"); page.keyboard.press("Escape")
