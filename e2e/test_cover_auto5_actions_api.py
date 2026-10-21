import json
import time
import urllib.request

import pytest

from e2e.act_support import open_panel, record
from e2e.files2_support import PIXEL, SCENE

META = {"io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": {"name": "covauto5", "version": "1"}, "io.modelcontextprotocol/clientCapabilities": {}}


def tool(name, /, **args):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"_meta": META, "name": name, "arguments": args}}).encode()
    req = urllib.request.Request("http://127.0.0.1:8190/mcp", body, {"Content-Type": "application/json", "MCP-Protocol-Version": "2026-07-28"})
    return json.loads(urllib.request.urlopen(req, timeout=120).read())["result"]


def policy(p):
    urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:8190/api/agents/policy", json.dumps({"client": "covauto5", "policy": p}).encode(), {"Content-Type": "application/json"}), timeout=10)


@pytest.fixture()
def agent(page):
    policy("allow")
    page.evaluate("() => { localStorage.setItem('formvis.prefs', JSON.stringify({ ...JSON.parse(localStorage.getItem('formvis.prefs') || '{}'), agentsAllowed: true })); window.dispatchEvent(new CustomEvent('formvis:agents', { detail: true })); }")
    for _ in range(60):
        try:
            if tool("ping")["structuredContent"].get("allowed"):
                break
        except Exception:
            pass
        time.sleep(0.5)
    yield page
    policy("ask")


def returned(name, **params):
    r = tool("run_command", id="list-actions", params=params) if name == "list" else tool("run_command", id=name, params=params)
    return r


def test_list_actions_lists_every_action_and_returns_the_steps_of_a_named_one(agent):
    agent.evaluate(SCENE)
    open_panel(agent)
    record(agent, "InvertAct", ["invert"])
    record(agent, "FlipAct", ["invert", "flip-canvas-h"])
    listed = tool("run_command", id="list-actions")["structuredContent"]["result"]["returned"]
    assert listed["recording"] is None
    assert [(a["name"], a["steps"], a["off"]) for a in listed["actions"]] == [("InvertAct", 1, 0), ("FlipAct", 2, 0)]
    got = tool("run_command", id="list-actions", params={"name": "FlipAct"})
    assert "structuredContent" in got, got
    one = got["structuredContent"]["result"]["returned"]
    assert one["name"] == "FlipAct" and [(s["n"], s["label"], s["on"]) for s in one["steps"]] == [(1, "Invert", True), (2, "Flip Canvas Horizontal", True)]
    bad = tool("run_command", id="list-actions", params={"name": "Nope"})
    assert bad["isError"] and 'There is no action named "Nope"' in bad["content"][0]["text"]
    before = agent.evaluate(PIXEL, [2, 2])[:3]
    played = tool("run_command", id="play-action", params={"name": "InvertAct"})["structuredContent"]["result"]["returned"]
    assert played == {"played": True, "from": 1}
    agent.wait_for_timeout(1500)
    after = agent.evaluate(PIXEL, [2, 2])[:3]
    assert after == [255 - c for c in before]
