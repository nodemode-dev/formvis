DLG = ".cv-scrim:not([hidden]) .cv-dialog"
MODE = DLG + " .cv-engine-mode"


def reset(page):
    page.evaluate("localStorage.removeItem('formvis.prefs')")
    page.evaluate("fetch('http://127.0.0.1:8190/api/compute', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ device: 'auto' }) })")
    page.reload(); page.wait_for_function("window.formvis && window.formvis.engine")


def test_the_engine_processor_is_chosen_and_the_engine_says_what_it_uses(page):
    try:
        reset(page)
        page.keyboard.press("Control+Comma")
        page.locator(DLG + " .cv-prefs-tab", has_text="Performance").click()
        # This sandbox's ONNX Runtime has neither CUDA nor Core ML: Automatic runs on the CPU and says why.
        page.wait_for_function(f"document.querySelector('{MODE}').textContent.startsWith('Engine: CPU')")
        assert "Automatic" in page.locator(MODE).inner_text()
        sel = page.locator(DLG + " .cv-prefs-page:not([hidden]) .cv-field", has_text="Engine processor").locator("select")
        sel.select_option(label="CUDA")
        page.wait_for_function(f"document.querySelector('{MODE}').textContent.includes('CUDA is chosen, but')")
        assert "uses the CPU" in page.locator(MODE).inner_text()
        assert page.evaluate("fetch('http://127.0.0.1:8190/api/compute').then((r) => r.json()).then((j) => j.preference)") == "cuda"
        sel.select_option(label="CPU")
        page.wait_for_function(f"document.querySelector('{MODE}').textContent.includes('CPU is chosen')")
        page.locator(DLG + " .cv-dialog-foot button", has_text="Done").click()
    finally:
        reset(page)
