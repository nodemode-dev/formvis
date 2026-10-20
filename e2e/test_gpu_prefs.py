GPU_STATUS = "document.querySelector('.cv-st-gpu').textContent"
DLG = ".cv-scrim:not([hidden]) .cv-dialog"


def reset(page):
    page.evaluate("localStorage.removeItem('formvis.prefs'); localStorage.removeItem('formvis.gpu.starting')")
    page.reload(); page.wait_for_function("window.formvis && window.formvis.engine")


def test_the_gpu_is_detected_and_automatic_skips_a_software_one(page):
    try:
        reset(page)
        page.wait_for_function(f"{GPU_STATUS}.startsWith('GPU:')")
        assert page.evaluate(GPU_STATUS) == "GPU: CPU"                                    # this sandbox has only software GPUs
        assert "software" in page.evaluate("document.querySelector('.cv-st-gpu').title")
        page.keyboard.press("Control+Comma")
        page.locator(DLG + " .cv-prefs-railtab", has_text="Performance").click()
        name = page.locator(DLG + " .cv-gpu-name").inner_text()
        assert "(software)" in name, name
        sel = page.locator(DLG + " .cv-prefs-page:not([hidden]) .cv-field", has_text="Renderer").locator("select")
        sel.select_option(label="WebGL2")
        page.wait_for_function(f"{GPU_STATUS} === 'GPU: WebGL2'")                          # named: used, software or not
        assert "In use: WebGL2" in page.locator(DLG + " .cv-gpu-mode").inner_text()
        page.locator(DLG + " .cv-prefs-page:not([hidden]) .cv-field", has_text="Use Graphics Processor").locator("input").uncheck()
        page.wait_for_function(f"{GPU_STATUS} === 'GPU: CPU'")
        page.locator(DLG + " .cv-dialog-foot button", has_text="Done").click()
    finally:
        reset(page)


def test_a_start_that_never_finished_turns_the_gpu_off(page):
    try:
        reset(page)
        page.evaluate("localStorage.setItem('formvis.gpu.starting', '1')")               # as if the last start crashed
        page.reload(); page.wait_for_function("window.formvis && window.formvis.engine")
        page.wait_for_function(f"{GPU_STATUS}.startsWith('GPU:')")
        assert page.evaluate("JSON.parse(localStorage.getItem('formvis.prefs')).useGpu") is False
        assert page.evaluate("localStorage.getItem('formvis.gpu.starting')") is None       # this start finished
        assert "Use Graphics Processor is off" in page.evaluate("document.querySelector('.cv-st-gpu').title")
        assert page.get_by_text("did not start last time").count() >= 1
    finally:
        reset(page)
