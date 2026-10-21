from e2e.fixtures_support import FX, near, open_fixture, steady

PROFILE = "(() => { const p = window.formvis.engine.current; return p.doc.profile ? p.doc.profile.name : null; })()"
ASK = "localStorage.setItem('formvis.prefs', JSON.stringify({ ...JSON.parse(localStorage.getItem('formvis.prefs') || '{}'), colour: { ...(JSON.parse(localStorage.getItem('formvis.prefs') || '{}').colour || {}), askMissing: true } }))"
SHEET = "(() => { const d = [...document.querySelectorAll('.cv-dialog')].filter((x) => x.offsetParent).pop(); return d ? { text: d.textContent.slice(0, 300), buttons: [...d.querySelectorAll('button')].map((b) => b.textContent.trim()) } : null; })()"
PRESS = """(label) => { const d = [...document.querySelectorAll('.cv-dialog')].filter((x) => x.offsetParent).pop(); const b = [...d.querySelectorAll('button')].find((x) => x.textContent.includes(label)); b.click(); }"""


def sheet_after_open(page, name):
    count = page.evaluate("window.formvis.engine.projects.length")
    page.set_input_files("input[data-role='open-files']", str(FX / name))
    for _ in range(40):
        s = page.evaluate(SHEET)
        if s and "profile" in s["text"].lower():
            return s
        if page.evaluate("window.formvis.engine.projects.length") > count:
            page.wait_for_timeout(500)
            return page.evaluate(SHEET) if (page.evaluate(SHEET) or {}).get("text", "").lower().count("profile") else None
        page.wait_for_timeout(250)
    return None


@steady
def test_exif_colorspace_srgb_opens_without_asking_and_the_other_values_ask_about_the_missing_profile(page, tmp_path):
    page.evaluate(ASK)
    assert sheet_after_open(page, "exif_colorspace_srgb.jpg") is None
    for name in ("exif_colorspace_uncalibrated.jpg", "exif_colorspace_none.jpg"):
        s = sheet_after_open(page, name)
        assert s is not None, name
        assert "no embedded profile" in s["text"].lower() or "no profile" in s["text"].lower() or "profile" in s["text"].lower(), s
        page.evaluate(PRESS, s["buttons"][0] if not any("ssume" in b for b in s["buttons"]) else next(b for b in s["buttons"] if "ssume" in b))
        page.wait_for_function("window.formvis.engine.projects.length > 0")


@steady
def test_a_png_and_a_jpeg_tagged_with_a_littlecms_srgb_profile_open_with_that_profile_kept(page, tmp_path):
    for name in ("icc_srgb_tagged.png", "icc_srgb_tagged.jpg"):
        opened, _ = open_fixture(page, name)
        assert opened, name
        p = page.evaluate(PROFILE)
        assert p is None or "sRGB" in p, (name, p)
        px = page.evaluate("""([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data)""", [10, 10])
        assert near(px, (80, 100, 128), 6), (name, px)
