# Image > Upscale on this computer (1.53.1), against the real engine and the real Real-ESRGAN model (downloaded by the
# engine's test of it into the models folder the engine uses); nothing stood in for.
DLG = ".cv-scrim:not([hidden]) .cv-dialog"


def test_upscale_runs_real_esrgan_on_this_computer(page):
    page.evaluate("window.formvis.engine.newDocument(60, 40, 'U', 'white'); (() => { const e = window.formvis.engine; e.fg = { r: 40, g: 120, b: 200 }; e.fill('fg'); })()")
    page.evaluate("window.formvis.commands.run('upscale-2x')")
    page.locator(DLG, has_text="Upscale 2x").wait_for()
    model = page.locator(f"{DLG} select[aria-label='Model']")
    page.wait_for_function("() => document.querySelector('.cv-scrim:not([hidden]) select[aria-label=Model]').value === 'local:ai-upscale'", timeout=15000)
    assert "on this computer" in page.locator(DLG).inner_text() and model.locator("option").all_inner_texts() == ["Real-ESRGAN (fal)", "Real-ESRGAN (this computer)"]
    page.locator(f"{DLG} .cv-dialog-foot button", has_text="Generate").click()   # the dialog's button in every mode
    page.wait_for_function("() => window.formvis.engine.projects.length === 2 && window.formvis.engine.current.doc.width === 120", timeout=60000)
    got = page.evaluate("(() => { const e = window.formvis.engine; return [e.current.doc.width, e.current.doc.height, Array.from(e.flattened().getContext('2d').getImageData(60, 40, 1, 1).data)]; })()")
    w, h, (r, g, b, a) = got
    assert (w, h) == (120, 80) and abs(r - 40) < 14 and abs(g - 120) < 14 and abs(b - 200) < 14 and a == 255, got


def test_preferences_show_real_esrgan_downloaded(page):
    page.evaluate("window.formvis.commands.run('settings')")
    page.locator(".cv-prefs-nav button, .cv-prefs-nav [role='tab']", has_text="Plugins").first.click()
    card = page.locator(f"{DLG} .cv-local-models [data-model='ai-upscale']")
    card.locator(".cv-local-state", has_text="downloaded, ready").wait_for(timeout=15000)
    assert card.get_by_role("button", name="Download Real-ESRGAN").is_disabled()
