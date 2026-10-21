# SC-ED-0167: the Lights tool of a Relight layer: Delete removes the selected light, H hides the handles, the wheel
# changes the selected light's intensity (Shift: diffusion), and a click on empty canvas adds a light.

DOC_W, DOC_H = 400, 300


def start(page):
    page.evaluate(f"window.formvis.engine.newDocument({DOC_W}, {DOC_H}, 'R', 'white')")
    page.evaluate("window.formvis.engine.setTool('relight')")
    page.wait_for_selector("html.cv-relighting", timeout=20000)
    page.wait_for_selector(".cv-relight-row", timeout=20000)


def rows(page):
    return page.evaluate("[...document.querySelectorAll('.cv-relight-row')].map(r => r.querySelector('.cv-relight-name').textContent + (r.classList.contains('is-on') ? '*' : ''))")


def value(page, label):
    return int(page.evaluate("(l) => document.querySelector(`.cv-relight [data-part=light] input[aria-label='${l} value']`).value", label))


def at(page, fx, fy):
    return page.evaluate("""([fx, fy, w, h]) => {
      const v = window.formvis.engine.current.viewport, r = [...document.querySelectorAll('.cv-stage canvas')].pop().getBoundingClientRect();
      const a = v.toScreen(0, 0), b = v.toScreen(w, h);
      return [r.x + a.x + (b.x - a.x) * fx, r.y + a.y + (b.y - a.y) * fy];
    }""", [fx, fy, DOC_W, DOC_H])


def test_click_on_empty_canvas_adds_a_light(page):
    start(page)
    assert rows(page) == ["Light 1*"]
    page.mouse.click(*at(page, 0.7, 0.85))
    page.wait_for_function("document.querySelectorAll('.cv-relight-row').length === 2", timeout=5000)
    assert rows(page) == ["Light 1", "Light 2*"]


def test_wheel_changes_intensity_and_shift_wheel_diffusion(page):
    start(page)
    intensity, diffusion = value(page, "Intensity"), value(page, "Diffusion")
    page.mouse.move(*at(page, 0.5, 0.9))
    page.mouse.wheel(0, -100)
    page.wait_for_function(f"document.querySelector(\".cv-relight [data-part=light] input[aria-label='Intensity value']\").value === '{intensity + 3}'", timeout=5000)
    assert value(page, "Diffusion") == diffusion
    page.keyboard.down("Shift")
    page.mouse.wheel(0, -100)
    page.keyboard.up("Shift")
    page.wait_for_function(f"document.querySelector(\".cv-relight [data-part=light] input[aria-label='Diffusion value']\").value === '{diffusion + 3}'", timeout=5000)
    assert value(page, "Intensity") == intensity + 3
    page.mouse.wheel(0, 100)
    page.wait_for_function(f"document.querySelector(\".cv-relight [data-part=light] input[aria-label='Intensity value']\").value === '{intensity}'", timeout=5000)


def test_delete_removes_the_selected_light_and_the_last_one_stays(page):
    start(page)
    page.mouse.click(*at(page, 0.7, 0.85))
    page.wait_for_function("document.querySelectorAll('.cv-relight-row').length === 2", timeout=5000)
    page.keyboard.press("Delete")
    page.wait_for_function("document.querySelectorAll('.cv-relight-row').length === 1", timeout=5000)
    assert rows(page) == ["Light 1*"]
    page.keyboard.press("Backspace")
    page.wait_for_timeout(300)
    assert rows(page) == ["Light 1*"]
    assert page.evaluate("document.documentElement.classList.contains('cv-relighting')")


def test_h_hides_the_handles_but_keeps_the_session(page):
    start(page)
    page.wait_for_timeout(500)
    x0, y0 = at(page, 0, 0)
    x1, y1 = at(page, 1, 1)
    clip = {"x": x0, "y": y0, "width": x1 - x0, "height": y1 - y0}
    shown = page.screenshot(clip=clip)
    page.keyboard.press("h")
    page.wait_for_timeout(300)
    hidden = page.screenshot(clip=clip)
    assert hidden != shown
    page.mouse.click(*at(page, 0.3, 0.85))
    page.wait_for_timeout(300)
    assert rows(page) == ["Light 1*"]
    page.keyboard.press("h")
    page.wait_for_timeout(300)
    assert page.screenshot(clip=clip) == shown
    assert page.evaluate("document.documentElement.classList.contains('cv-relighting')")


def test_keys_do_nothing_while_a_text_field_has_focus(page):
    start(page)
    page.mouse.click(*at(page, 0.7, 0.85))
    page.wait_for_function("document.querySelectorAll('.cv-relight-row').length === 2", timeout=5000)
    page.focus(".cv-relight-hex")
    page.keyboard.press("Backspace")
    page.keyboard.press("h")
    page.wait_for_timeout(300)
    assert len(rows(page)) == 2
