import pytest

OPEN = ".cv-scrim:not([hidden])"
STATS = """() => { const e = window.formvis.engine, pv = e.preview, s = pv ? pv.surface : e.flattened(); const d = s.getContext('2d').getImageData(0, 0, s.width, s.height).data; let sum = 0; for (let i = 0; i < d.length; i += 4) sum += d[i]; return [!!pv, sum]; }"""
SCENE = """() => { const e = window.formvis.engine; e.newDocument(100, 60, 'F', 'white'); const k = e.activeLayer.raster.ctx;
  k.fillStyle = 'rgb(60,60,60)'; k.fillRect(0, 0, 50, 60); k.fillStyle = 'rgb(190,190,190)'; k.fillRect(50, 0, 50, 60); e.activeLayer.raster.touch(); e.refresh(); }"""
CASES = [
    ("filter-gaussianBlur", "Radius (px)", 100),
    ("filter-unsharpMask", "Amount (%)", 40),
    ("filter-addNoise", "Amount (%)", 100),
    ("filter-motionBlur", "Distance (px)", 60),
    ("filter-ripple", "Amount (%)", 40),
]


def row(page, label):
    return page.locator(f"{OPEN} .cv-slider:visible", has=page.locator(f"span:text-is('{label}')")).first


def value(page, label):
    return float(row(page, label).locator("input.cv-num").input_value())


def scrub(page, label, dx, key=None):
    box = row(page, label).locator("span").first.bounding_box()
    x, y = box["x"] + 10, box["y"] + box["height"] / 2
    page.mouse.move(x, y)
    page.mouse.down()
    if key:
        page.keyboard.down(key)
    page.mouse.move(x + dx / 2, y, steps=4)
    page.mouse.move(x + dx, y, steps=4)
    page.mouse.up()
    if key:
        page.keyboard.up(key)
    page.wait_for_timeout(400)


def settle(page, want):
    for _ in range(40):
        page.wait_for_timeout(250)
        if page.evaluate("!!window.formvis.engine.preview") == want:
            break
    page.wait_for_timeout(300)


def begin(page, command):
    page.evaluate(SCENE)
    assert page.evaluate(f"window.formvis.commands.run('{command}')")
    page.wait_for_timeout(700)


@pytest.mark.parametrize("command,label,dx", CASES)
def test_preview_checkbox_sits_left_of_cancel_and_toggles_original_and_filtered(page, command, label, dx):
    begin(page, command)
    foot = page.locator(f"{OPEN} .cv-dialog-foot")
    assert foot.evaluate("f => [...f.children].map(c => c.textContent.trim())") == ["Preview", "Cancel", "OK"]
    box = page.locator(f"{OPEN} .cv-dialog-foot .cv-adjust-preview input")
    assert box.is_checked()
    scrub(page, label, dx)
    settle(page, True)
    shown, filtered = page.evaluate(STATS)
    assert shown
    box.uncheck()
    settle(page, False)
    shown, original = page.evaluate(STATS)
    assert not shown and original == 750000 and filtered != original
    box.check()
    settle(page, True)
    assert page.evaluate(STATS)[0]
    foot.locator("button", has_text="Cancel").click()


@pytest.mark.parametrize("command,label,dx", CASES)
def test_label_scrub_with_shift_and_alt_and_double_click_resets(page, command, label, dx):
    begin(page, command)
    default = value(page, label)
    scrub(page, label, dx)
    plain = value(page, label)
    assert plain != default
    scrub(page, label, dx, "Shift")
    coarse = value(page, label)
    assert abs(coarse - plain) > abs(plain - default)
    scrub(page, label, -dx, "Alt")
    fine = value(page, label)
    assert abs(fine - coarse) < abs(coarse - plain)
    row(page, label).locator("span").first.dblclick()
    page.wait_for_timeout(300)
    assert value(page, label) == default
    scrub(page, label, dx)
    assert value(page, label) != default
    row(page, label).locator("input[type=range]").dblclick()
    page.wait_for_timeout(300)
    assert value(page, label) == default
    page.locator(f"{OPEN} .cv-dialog-foot button", has_text="Cancel").click()


def test_preview_state_is_remembered_for_the_session(page):
    begin(page, "filter-gaussianBlur")
    page.locator(f"{OPEN} .cv-dialog-foot .cv-adjust-preview input").uncheck()
    page.locator(f"{OPEN} .cv-dialog-foot button", has_text="Cancel").click()
    page.wait_for_timeout(300)
    assert page.evaluate("window.formvis.commands.run('filter-motionBlur')")
    page.wait_for_timeout(500)
    assert not page.locator(f"{OPEN} .cv-dialog-foot .cv-adjust-preview input").is_checked()
    page.locator(f"{OPEN} .cv-dialog-foot .cv-adjust-preview input").check()
    page.locator(f"{OPEN} .cv-dialog-foot button", has_text="Cancel").click()
