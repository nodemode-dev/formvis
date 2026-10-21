import json
import os
import time
import urllib.request

import pytest

from e2e.files2_support import PIXEL, SCENE, set_field, start

SRC = os.path.join(os.environ.get("FORMVIS_REPO", os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "examples", "plugins", "formvis-sample")
BASE = "http://127.0.0.1:8190/api/plugins/folders/covauto5-sample"
CMD = "window.formvis.commands.run('plugin:covauto5-sample:%s')"
TOP = "[...document.querySelectorAll('.cv-dialog')].filter((x) => x.offsetParent).pop()"
META = {"io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": {"name": "covauto5", "version": "1"}, "io.modelcontextprotocol/clientCapabilities": {}}


def put(rel, text):
    urllib.request.urlopen(urllib.request.Request(f"{BASE}/{rel}", data=text.encode(), method="PUT"), timeout=10).read()


def tool(name, /, **args):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"_meta": META, "name": name, "arguments": args}}).encode()
    return json.loads(urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:8190/mcp", body, {"Content-Type": "application/json", "MCP-Protocol-Version": "2026-07-28"}), timeout=60).read())["result"]


def policy(p):
    urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:8190/api/agents/policy", json.dumps({"client": "covauto5", "policy": p}).encode(), {"Content-Type": "application/json"}), timeout=10)


@pytest.fixture()
def sample(page):
    manifest = json.load(open(os.path.join(SRC, "plugin.json")))
    manifest["id"] = "covauto5-sample"
    put("plugin.json", json.dumps(manifest))
    put("main.js", open(os.path.join(SRC, "main.js")).read())
    start(page)
    page.evaluate(SCENE)
    page.evaluate("window.formvis.commands.run('manage-plugins')")
    page.check(".cv-dialog input[aria-label='covauto5-sample on']")
    page.wait_for_function(f"{TOP}.innerText.includes('Turn on Sample Plugin?')", timeout=10000)
    page.get_by_role("button", name="Turn On", exact=True).click()
    page.wait_for_function("window.formvis.commands.all().filter((c) => c.id.startsWith('plugin:covauto5-sample')).length >= 5", timeout=15000)
    page.keyboard.press("Escape")
    yield page
    policy("ask")
    urllib.request.urlopen(urllib.request.Request(BASE, method="DELETE"), timeout=10).read()


def px(page, x, y):
    return page.evaluate(PIXEL, [x, y])[:3]


def ok_button(page):
    page.get_by_role("button", name="OK", exact=True).click()


def test_the_sample_plugin_filters_change_pixels_with_cpu_and_webgl_paths(sample):
    assert px(sample, 12, 2) == [30, 40, 220]
    sample.evaluate(CMD % "filter:tint")
    sample.wait_for_function(f"{TOP} && {TOP}.innerText.includes('Sample Tint')", timeout=10000)
    set_field(sample, "Amount", "40")
    ok_button(sample)
    sample.wait_for_timeout(1500)
    assert px(sample, 12, 2) == [70, 40, 220] and px(sample, 2, 2) == [220, 30, 30]
    sample.evaluate("window.formvis.commands.run('undo')")
    sample.wait_for_timeout(500)
    assert px(sample, 12, 2) == [30, 40, 220]
    sample.evaluate(CMD % "filter:invert-mix")
    sample.wait_for_function(f"{TOP} && {TOP}.innerText.includes('Invert')", timeout=10000)
    ok_button(sample)
    sample.wait_for_timeout(1500)
    assert px(sample, 12, 2) == [225, 215, 35]


def test_the_sample_plugin_tool_swatch_command_panel_events_and_storage(sample):
    sample.evaluate(CMD % "tool:probe")
    sample.wait_for_timeout(500)
    box = sample.evaluate("(() => { const c = [...document.querySelectorAll('canvas')].map((e) => e.getBoundingClientRect()).sort((a, b) => b.width * b.height - a.width * a.height)[0]; return {x: c.x, y: c.y, width: c.width, height: c.height}; })()")
    sample.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    sample.wait_for_function("[...document.querySelectorAll('.cv-toast')].some((t) => /^Point \\d+, \\d+$/.test(t.textContent))", timeout=10000)
    sample.evaluate(CMD % "cmd:swatch")
    sample.wait_for_function(f"{TOP} && {TOP}.innerText.includes('Swatch')", timeout=10000)
    set_field(sample, "Size", "10")
    set_field(sample, "Name", "FromSwatch")
    ok_button(sample)
    sample.wait_for_function("window.formvis.engine.current.doc.layers.some((l) => l.name === 'FromSwatch')", timeout=10000)
    sample.wait_for_function("[...document.querySelectorAll('*')].some((e) => e.children.length === 0 && /Ex: 16 by 12, 3 layers\\. Edits seen: [1-9]/.test(e.textContent))", timeout=10000)


def test_the_sample_plugin_box_source_fills_a_new_box_from_its_words(sample):
    policy("allow")
    sample.evaluate("() => { localStorage.setItem('formvis.prefs', JSON.stringify({ ...JSON.parse(localStorage.getItem('formvis.prefs') || '{}'), agentsAllowed: true })); window.dispatchEvent(new CustomEvent('formvis:agents', { detail: true })); }")
    for _ in range(60):
        try:
            if tool("ping")["structuredContent"].get("allowed"):
                break
        except Exception:
            pass
        time.sleep(0.5)
    box = tool("boxes_add", x=0, y=0, width=8, height=6, kind="new", text="sky")["structuredContent"]
    assert box["kind"] == "new"
    sample.evaluate(CMD % "source:flat")
    sample.wait_for_function("window.formvis.engine.current.doc.layers.some((l) => l.name === 'New 1 (Flat colour)')", timeout=15000)
    sample.wait_for_timeout(500)
    assert px(sample, 2, 2) == [111, 160, 220]
