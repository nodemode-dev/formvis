# Preference pages (Enhanced Controls, Plugins, Camera Raw Defaults, Scratch Disks) and export rows (CMYK export, Save for Web WBMP, CLI convert), each driven through the running page and engine.
import base64
import io
import json
import os
import subprocess
from pathlib import Path

import pytest
from PIL import Image

from e2e.files2_support import steady

DLG = ".cv-scrim:not([hidden]) .cv-dialog"
REPO = Path(os.environ.get("FORMVIS_REPO", Path(__file__).resolve().parents[1]))

HOOK = """() => {
  if (window.__hooked) { window.__got = []; return; }
  window.__hooked = true; window.__got = [];
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    const name = this.download, href = this.href;
    if (!name) return click.call(this);
    fetch(href).then((r) => r.arrayBuffer()).then((buf) => { let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); window.__got.push({ name, b64: btoa(s) }); });
  };
}"""
EXPORT_CMYK = """async (fmt) => {
  window.__got = [];
  window.formvis.commands.run('export-as'); await new Promise((r) => setTimeout(r, 600));
  const dlg = document.querySelector('.cv-scrim:not([hidden]) .cv-dialog'), sels = () => [...dlg.querySelectorAll('select')];
  const set = (s, v) => { s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); };
  set(sels()[2], fmt); await new Promise((r) => setTimeout(r, 400));
  const prof = sels().find((s) => [...s.options].some((o) => /CMYK/.test(o.textContent)));
  set(prof, [...prof.options].find((o) => /CMYK/.test(o.textContent)).value); await new Promise((r) => setTimeout(r, 300));
  [...dlg.querySelectorAll('.cv-dialog-foot button')].find((b) => b.textContent === 'Export').click();
  for (let i = 0; i < 100 && !window.__got.length; i++) await new Promise((r) => setTimeout(r, 250));
  return window.__got[0] || null;
}"""
SAVE_FOR_WEB_WBMP = """async () => {
  window.__got = [];
  window.formvis.commands.run('save-for-web'); await new Promise((r) => setTimeout(r, 800));
  const dlg = document.querySelector('.cv-scrim:not([hidden]) .cv-dialog');
  const f = [...dlg.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === 'wbmp'));
  f.value = 'wbmp'; f.dispatchEvent(new Event('change', { bubbles: true })); await new Promise((r) => setTimeout(r, 800));
  const note = /1 bit, black and white/.test(dlg.textContent);
  [...dlg.querySelectorAll('.cv-dialog-foot button')].find((b) => b.textContent.startsWith('Save')).click();
  for (let i = 0; i < 100 && !window.__got.length; i++) await new Promise((r) => setTimeout(r, 250));
  return { got: window.__got[0] || null, note };
}"""


def stored(page):
    return json.loads(page.evaluate("localStorage.getItem('formvis.prefs') || '{}'"))


def reload(page):
    page.reload()
    page.wait_for_function("window.formvis && window.formvis.engine")
    page.wait_for_timeout(600)


def open_section(page, section):
    page.evaluate("window.formvis.commands.run('settings')")
    page.locator(f"{DLG} .cv-prefs-railtab[data-section='{section}']").click()
    page.wait_for_timeout(300)


def box(page, label):
    return page.locator(f"{DLG} label", has_text=label).locator("input[type=checkbox]").first


def choose(page, label, value):
    page.locator(f"{DLG} label.cv-field", has_text=label).locator("select").first.select_option(value)
    page.wait_for_timeout(200)


@pytest.fixture()
def clean(page):
    page.evaluate("localStorage.removeItem('formvis.prefs')")
    reload(page)
    yield
    page.evaluate("localStorage.removeItem('formvis.prefs')")
    reload(page)


@pytest.mark.parametrize("label,key", [("Trackpad Pinch Zoom", "pinchZoom"), ("Trackpad Rotate Gesture", "trackpadRotate"), ("Touch Gestures", "touchGestures")])
def test_pc_ui_0126_enhanced_controls_gesture_boxes_are_kept_after_a_reload(page, clean, label, key):
    open_section(page, "Enhanced Controls")
    before = box(page, label).is_checked()
    box(page, label).click()
    page.wait_for_timeout(250)
    assert stored(page)[key] is (not before)
    reload(page)
    open_section(page, "Enhanced Controls")
    assert box(page, label).is_checked() is (not before)


def test_pc_ui_0126_scrubby_slider_acceleration_is_stored(page, clean):
    open_section(page, "Enhanced Controls")
    r = page.locator(f"{DLG} .cv-slider", has_text="Scrubby Slider Acceleration").locator("input[type=range]").first
    r.evaluate("e => { e.value = '60'; e.dispatchEvent(new Event('input', {bubbles: true})); e.dispatchEvent(new Event('change', {bubbles: true})); }")
    page.wait_for_timeout(250)
    assert stored(page)["scrubAccel"] == 60


def test_pc_ui_0124_show_extension_panels_is_stored_and_announced_to_the_page(page, clean):
    open_section(page, "Plugins")
    page.evaluate("window.__ev = []; window.addEventListener('formvis:ext-panels', (e) => window.__ev.push(e.detail))")
    before = box(page, "Show Extension Panels").is_checked()
    box(page, "Show Extension Panels").click()
    page.wait_for_timeout(250)
    assert stored(page)["showExtPanels"] is (not before)
    assert page.evaluate("window.__ev") == [not before]


def test_pc_au_0205_and_pc_ui_1010_outside_agents_switch_and_the_control_port_shown_is_the_engines(page, clean):
    open_section(page, "Plugins")
    page.evaluate("window.__ag = []; window.addEventListener('formvis:agents', (e) => window.__ag.push(e.detail))")
    assert stored(page).get("agentsAllowed", False) is False
    page.locator(f"{DLG} label.cv-dialog-row", has_text="Allow outside agents").click()
    page.wait_for_timeout(300)
    assert stored(page)["agentsAllowed"] is True
    assert page.evaluate("window.__ag") == [True]
    url = page.evaluate("fetch('/api/mcp/registration').then((r) => r.json()).then((j) => j.url)")
    assert page.locator(f"{DLG} .cv-mcp-port").first.inner_text() == url.rsplit(":", 1)[1].split("/")[0]
    page.locator(f"{DLG} label.cv-dialog-row", has_text="Allow outside agents").click()
    page.wait_for_timeout(300)
    assert stored(page)["agentsAllowed"] is False


def test_pc_ui_0127_and_pc_ui_1003_camera_raw_defaults_are_stored_and_shown_again_after_a_reload(page, clean):
    open_section(page, "Camera Raw Defaults")
    choose(page, "Default White Balance", "auto")
    choose(page, "Default Depth", "16")
    choose(page, "Color Space", "prophoto")
    choose(page, "Sharpen For", "screen")
    for label in ("Apply Auto Tone", "Open as a Smart Object", "Show the Camera Raw dialog on open"):
        box(page, label).click()
        page.wait_for_timeout(150)
    s = stored(page)
    assert (s["rawWb"], s["rawBits"], s["rawWide"], s["rawSharpen"], s["rawAutoTone"], s["rawSmart"], s["rawAsk"]) == ("auto", 16, True, "screen", True, True, False)
    reload(page)
    open_section(page, "Camera Raw Defaults")
    assert page.locator(f"{DLG} label.cv-field", has_text="Color Space").locator("select").first.input_value() == "prophoto"
    assert box(page, "Apply Auto Tone").is_checked()
    assert not box(page, "Show the Camera Raw dialog on open").is_checked()


def test_pc_ui_0119_and_pc_ui_0985_scratch_folder_is_taken_by_the_engine_and_given_back(page, clean, tmp_path):
    folder = tmp_path / "scratch"
    folder.mkdir()
    get = "fetch('/api/undo/scratch').then((r) => r.json())"
    open_section(page, "Scratch Disks")
    base = page.evaluate(get)
    try:
        page.locator(f"{DLG} input[aria-label='Scratch folder path']").fill(str(folder))
        page.locator(f"{DLG} .cv-scratch button", has_text="Use this folder").click()
        page.wait_for_function(f"fetch('/api/undo/scratch').then((r) => r.json()).then((j) => j.custom && j.folder.startsWith({json.dumps(str(folder))}))", timeout=15000)
        assert stored(page)["scratchFolder"] == str(folder)
        assert str(folder) in page.locator(f"{DLG} .cv-scratch .cv-note").inner_text()
    finally:
        page.locator(f"{DLG} .cv-scratch button", has_text="Use the data folder").click()
        page.wait_for_function("fetch('/api/undo/scratch').then((r) => r.json()).then((j) => !j.custom)", timeout=15000)
    assert page.evaluate(get)["folder"] == base["folder"]
    assert stored(page).get("scratchFolder", "") == ""


@steady
@pytest.mark.parametrize("fmt,pil", [("jpg", "JPEG"), ("tiff", "TIFF")])
def test_co_0238_export_as_with_a_cmyk_profile_writes_a_cmyk_file(page, tmp_path, fmt, pil):
    page.evaluate(HOOK)
    page.evaluate("window.formvis.engine.newDocument(64, 48, 'CmykOut', 'white')")
    r = page.evaluate(EXPORT_CMYK, fmt)
    assert r, f"nothing delivered for {fmt}"
    im = Image.open(io.BytesIO(base64.b64decode(r["b64"])))
    assert im.format == pil and im.mode == "CMYK" and im.size == (64, 48)


@steady
def test_pc_io_0134_save_for_web_wbmp_writes_a_one_bit_file_of_the_picture_size(page, tmp_path):
    page.evaluate(HOOK)
    page.evaluate("window.formvis.engine.newDocument(64, 48, 'WbOut', 'white')")
    r = page.evaluate(SAVE_FOR_WEB_WBMP)
    assert r["note"] and r["got"] and r["got"]["name"].endswith(".wbmp")
    b = base64.b64decode(r["got"]["b64"])
    assert list(b[:4]) == [0, 0, 64, 48] and len(b) == 4 + 8 * 48


def test_pc_io_0147_cli_convert_writes_the_named_format_from_a_picture_file(tmp_path):
    src = tmp_path / "in.jpg"
    Image.effect_noise((40, 30), 50).convert("RGB").save(src, quality=90)
    env = {**os.environ, "FORMVIS_URL": "http://127.0.0.1:8190"}

    def convert(*args):
        return subprocess.run([str(REPO / "formvis"), "cli", "convert", *args], env=env, cwd=REPO, capture_output=True, text=True, timeout=90)

    out = tmp_path / "out.png"
    p = convert(str(src), str(out))
    assert p.returncode == 0, p.stdout + p.stderr
    assert Image.open(out).format == "PNG" and Image.open(out).size == (40, 30)
    p = convert(str(src), "--to", "wbmp", "--out", str(tmp_path / "w"))
    assert p.returncode == 0, p.stdout + p.stderr
    wb = (tmp_path / "w" / "in.wbmp").read_bytes()
    assert list(wb[:4]) == [0, 0, 40, 30] and len(wb) == 4 + 5 * 30
    p = convert(str(src), "--to", "jpg", "--quality", "0.3", "--out", str(tmp_path / "q"))
    assert p.returncode == 0, p.stdout + p.stderr
    assert (tmp_path / "q" / "in.jpg").stat().st_size < src.stat().st_size
