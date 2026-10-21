ALPHAS = "window.formvis.engine.current.doc.alphas.map((a) => ({ n: a.name, s: !!a.spot, o: a.opacity }))"


def setup(page):
    page.evaluate("window.formvis.engine.newDocument(120, 80, 'C', 'white')")
    page.evaluate("window.formvis.commands.run('panel-channels')")
    page.evaluate("window.formvis.commands.run('new-channel', { name: 'A1' })")
    page.evaluate("window.formvis.commands.run('new-channel', { name: 'A2', fill: 'white' })")
    page.evaluate("window.formvis.commands.run('new-spot-channel', { name: 'Gold', color: '#c8a000', solidity: 80 })")


def names(page):
    return page.locator(".cv-ch-alpha .cv-ch-name").all_text_contents()


def test_spot_channel_keeps_its_ink_and_solidity_and_shows_as_spot(page):
    setup(page)
    assert names(page) == ["A1", "A2", "Gold"]
    gold = page.evaluate("window.formvis.engine.current.doc.alphas[2]")
    assert gold["spot"] is True and gold["opacity"] == 80 and gold["color"] == {"r": 200, "g": 160, "b": 0}
    assert page.locator(".cv-ch-alpha").nth(2).evaluate("(r) => r.classList.contains('is-spot')")
    assert not page.locator(".cv-ch-alpha").nth(0).evaluate("(r) => r.classList.contains('is-spot')")


def test_channel_options_dialog_renames_and_sets_opacity_and_turns_alpha_into_spot(page):
    setup(page)
    page.locator(".cv-ch-alpha").nth(1).locator(".cv-ch-options").click()
    name = page.locator("input[aria-label='Channel name']")
    assert name.is_visible() and name.input_value() == "A2"
    name.fill("Opt2")
    page.locator("input[aria-label='Opacity in percent']").fill("30")
    page.get_by_role("button", name="OK").last.click()
    assert page.evaluate(ALPHAS)[1] == {"n": "Opt2", "s": False, "o": 30}
    page.locator(".cv-ch-alpha").nth(0).locator(".cv-ch-options").click()
    page.locator(".cv-field select:has(option[value='spot'])").first.evaluate("(s) => { s.value = 'spot'; s.dispatchEvent(new Event('change', { bubbles: true })); }")
    page.get_by_role("button", name="OK").last.click()
    assert page.evaluate(ALPHAS)[0]["s"] is True
    assert page.locator(".cv-ch-alpha").nth(0).evaluate("(r) => r.classList.contains('is-spot')")


def test_channels_rename_inline_reorder_by_drag_and_delete(page):
    setup(page)
    page.locator(".cv-ch-alpha").first.locator(".cv-ch-name").dblclick()
    page.locator(".cv-ch-rename").fill("Renamed")
    page.keyboard.press("Enter")
    assert names(page) == ["Renamed", "A2", "Gold"]
    page.locator(".cv-ch-alpha").nth(2).drag_to(page.locator(".cv-ch-alpha").nth(0))
    assert page.evaluate("window.formvis.engine.current.doc.alphas.map((a) => a.name)") == ["Gold", "Renamed", "A2"]
    page.locator(".cv-ch-alpha").nth(0).locator(".cv-ch-delete").click()
    assert page.evaluate("window.formvis.engine.current.doc.alphas.map((a) => a.name)") == ["Renamed", "A2"]
    assert names(page) == ["Renamed", "A2"]
