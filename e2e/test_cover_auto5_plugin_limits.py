import json
import urllib.request

from e2e.files2_support import SCENE, start

TOP = "[...document.querySelectorAll('.cv-dialog')].filter((x) => x.offsetParent).pop()"


def folder(fid, name, perms, source):
    base = f"http://127.0.0.1:8190/api/plugins/folders/{fid}"
    for rel, text in (("plugin.json", json.dumps({"id": fid, "name": name, "version": "1.0.0", "main": "main.js", "api": 1, "permissions": perms})), ("main.js", source)):
        urllib.request.urlopen(urllib.request.Request(f"{base}/{rel}", data=text.encode(), method="PUT"), timeout=10).read()
    return base


def turn_on(page, fid, name):
    page.evaluate("window.formvis.commands.run('manage-plugins')")
    page.wait_for_selector(f".cv-dialog input[aria-label='{fid} on']")
    page.check(f".cv-dialog input[aria-label='{fid} on']")
    page.wait_for_function(f"{TOP}.innerText.includes('Turn on {name}?')", timeout=10000)
    page.get_by_role("button", name="Turn On", exact=True).click()


def test_a_plugin_that_never_returns_from_activate_is_stopped_after_five_seconds_and_the_window_stays_alive(page):
    base = folder("covauto5-loop", "Loop", ["commands"], "export function activate(formvis) { while (true) {} }")
    try:
        start(page)
        page.evaluate(SCENE)
        turn_on(page, "covauto5-loop", "Loop")
        page.wait_for_function(f"{TOP}.innerText.includes('activate took more than 5 seconds.')", timeout=20000)
        assert page.evaluate("1 + 1") == 2
        page.wait_for_function("[...document.querySelectorAll('.cv-toast')].some((t) => t.textContent === 'Loop: activate took more than 5 seconds.')", timeout=5000)
    finally:
        urllib.request.urlopen(urllib.request.Request(base, method="DELETE"), timeout=10).read()


def test_a_plugin_folder_runs_in_a_worker_without_the_page_storage_or_network(page):
    source = "export async function activate(formvis) { let r; try { await fetch('http://127.0.0.1:8190/api/plugins'); r = 'reached'; } catch (e) { r = 'blocked'; } formvis.ui.toast([typeof document, typeof window, typeof localStorage, r].join(',')); }"
    base = folder("covauto5-box", "Boxed", ["ui"], source)
    try:
        start(page)
        page.evaluate(SCENE)
        turn_on(page, "covauto5-box", "Boxed")
        page.wait_for_function("[...document.querySelectorAll('.cv-toast')].some((t) => t.textContent === 'undefined,undefined,undefined,blocked')", timeout=15000)
    finally:
        urllib.request.urlopen(urllib.request.Request(base, method="DELETE"), timeout=10).read()
