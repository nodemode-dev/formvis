import json
import urllib.error
import urllib.request

import pytest
from PIL import Image

BASE = "http://127.0.0.1:8190"
META = {"io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": {"name": "covcli-eng", "version": "1"}, "io.modelcontextprotocol/clientCapabilities": {}}


def post(body, headers=None):
    h = {"Content-Type": "application/json", "MCP-Protocol-Version": "2026-07-28", **(headers or {})}
    r = urllib.request.urlopen(urllib.request.Request(BASE + "/mcp", json.dumps(body).encode(), h), timeout=60)
    return r.headers, json.loads(r.read())


def rpc(method, params=None):
    return post({"jsonrpc": "2.0", "id": 1, "method": method, "params": {**(params or {}), "_meta": META}})[1]


def call(name, /, **args):
    return rpc("tools/call", {"name": name, "arguments": args})["result"]


def text(r):
    return " ".join(c.get("text", "") for c in r["content"])


def limits(**values):
    req = urllib.request.Request(BASE + "/api/agents/limits", json.dumps(values).encode(), {"Content-Type": "application/json"})
    try:
        r = urllib.request.urlopen(req, timeout=10)
        return r.status, json.loads(r.read())
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read())


def test_resources_list_read_and_the_command_template():
    uris = {r["uri"] for r in rpc("resources/list")["result"]["resources"]}
    assert {"formvis://document", "formvis://layers", "formvis://selection", "formvis://commands", "formvis://jobs", "formvis://plugins", "formvis://history"} <= uris
    tpl = rpc("resources/templates/list")["result"]["resourceTemplates"]
    assert tpl[0]["uriTemplate"] == "formvis://command/{id}"
    one = json.loads(rpc("resources/read", {"uri": "formvis://command/invert"})["result"]["contents"][0]["text"])
    assert one["id"] == "invert" and one["label"] == "Invert" and one["when"].startswith("Use when")
    everything = json.loads(rpc("resources/read", {"uri": "formvis://commands"})["result"]["contents"][0]["text"])
    assert everything["total"] == len(everything["commands"]) > 1000 and any(c["id"] == "invert" for c in everything["commands"])
    assert "jobs" in json.loads(rpc("resources/read", {"uri": "formvis://jobs"})["result"]["contents"][0]["text"])


def test_a_session_may_subscribe_to_a_resource_and_only_to_a_listed_one():
    lone = rpc("resources/subscribe", {"uri": "formvis://jobs"})
    assert "Subscriptions belong to a session" in lone["error"]["message"]
    head, init = post({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-11-25", "capabilities": {}, "clientInfo": {"name": "covcli-eng", "version": "1"}}}, {"MCP-Protocol-Version": "2025-11-25"})
    assert init["result"]["capabilities"]["resources"]["subscribe"] is True
    sid = head["Mcp-Session-Id"]
    ids = {"MCP-Protocol-Version": "2025-11-25", "Mcp-Session-Id": sid}
    assert post({"jsonrpc": "2.0", "id": 2, "method": "resources/subscribe", "params": {"uri": "formvis://jobs"}}, ids)[1]["result"] == {}
    bad = post({"jsonrpc": "2.0", "id": 3, "method": "resources/subscribe", "params": {"uri": "formvis://nothing"}}, ids)[1]
    assert "Give the uri of a resource" in bad["error"]["message"]
    assert post({"jsonrpc": "2.0", "id": 4, "method": "resources/unsubscribe", "params": {"uri": "formvis://jobs"}}, ids)[1]["result"] == {}


def test_every_tool_schema_is_strict_and_a_bad_argument_is_refused_before_it_runs():
    tools = rpc("tools/list")["result"]["tools"]
    assert len(tools) > 100 and all(t["inputSchema"].get("additionalProperties") is False for t in tools)
    assert "Unknown argument bogus; allowed: status, limit" in text(call("jobs_list", bogus=1))
    assert "which is not allowed; use one of: all, active, finished" in text(call("jobs_list", status="nope"))
    assert "the least allowed is 1" in text(call("jobs_list", limit=0))
    assert call("jobs_list", limit=0)["isError"] is True


def test_jobs_list_and_cancel_answer_without_a_window_and_say_when_nothing_matches():
    r = call("jobs_list", status="all")
    assert not r.get("isError") and isinstance(r["structuredContent"]["jobs"], list)
    gone = call("jobs_cancel", id="no-such-job")
    assert gone["isError"] and "No active job matches" in text(gone)
    assert "Give the job id" in text(call("jobs_cancel"))


@pytest.fixture()
def window(page):
    """list_commands is answered by an open window that allows this client; without one the call waits for a window."""
    pol = lambda p: urllib.request.urlopen(urllib.request.Request(BASE + "/api/agents/policy", json.dumps({"client": "covcli-eng", "policy": p}).encode(), {"Content-Type": "application/json"}), timeout=10)
    pol("allow")
    page.evaluate("() => { localStorage.setItem('formvis.prefs', JSON.stringify({ ...JSON.parse(localStorage.getItem('formvis.prefs') || '{}'), agentsAllowed: true })); window.dispatchEvent(new CustomEvent('formvis:agents', { detail: true })); }")
    page.wait_for_timeout(1500)
    yield page
    pol("ask")


def test_replies_are_cut_at_the_text_budget_with_a_note(tmp_path, window):
    assert limits(text_chars=10)[0] == 422 and limits(image_bytes=10)[0] == 422
    try:
        assert limits(text_chars=1000)[1]["text_chars"] == 1000
        r = call("list_commands")
        assert not r.get("isError") and "structuredContent" not in r
        assert "over the 1,000 character cap and was left out" in text(r)
        assert call("file_roots")["structuredContent"]["text_chars"] == 1000
    finally:
        assert limits(text_chars=200000)[1]["text_chars"] == 200000


def test_files_outside_the_folders_agents_may_use_are_refused(tmp_path):
    inside, outside = tmp_path / "ok", tmp_path / "out"
    inside.mkdir()
    outside.mkdir()
    Image.new("RGB", (8, 8)).save(inside / "a.png")
    Image.new("RGB", (8, 8)).save(outside / "b.png")
    assert limits(roots=["relative/path"])[0] == 422
    try:
        assert limits(roots=[str(inside)])[1]["roots"] == [str(inside)]
        fine = call("file_info", path=str(inside / "a.png"))
        assert not fine.get("isError") and '"width": 8' in text(fine)
        refused = call("file_info", path=str(outside / "b.png"))
        assert refused["isError"] and "is outside the folders agents may use here" in text(refused) and str(inside) in text(refused)
        assert "outside the folders" in text(call("file_info", path="/etc/x.png"))
        roots = call("file_roots")["structuredContent"]
        assert roots["restricted"] is True and roots["roots"] == [str(inside)] and "/etc" in roots["system_folders_refused"]
    finally:
        assert limits(roots=[])[1]["roots"] == []


def test_control_call_takes_the_dotted_names_and_checks_the_params():
    r = call("control_call", method="app.roots", params={})
    assert not r.get("isError") and "reply carries at most" in text(r)
    bad = call("control_call", method="app.open", params={"bogus": 1})
    assert bad["isError"] and "control_call app.open was not run: Unknown argument params.bogus; allowed: path, into, svg_width, reference" in text(bad)
    names = {t["name"]: t for t in rpc("tools/list")["result"]["tools"]}
    assert {"app.open", "app.save", "app.export", "app.roots", "ui.pointer"} <= set(names["control_call"]["inputSchema"]["properties"]["method"]["enum"])


@pytest.mark.parametrize("method", ["app.open", "app.save", "app.export"])
def test_control_file_methods_refuse_a_path_that_is_not_there_or_not_a_picture(method, tmp_path):
    note = tmp_path / "notes.txt"
    note.write_text("x")
    r = call("control_call", method=method, params={"path": str(note)}) if method == "app.open" else call("control_call", method=method, params={"path": str(tmp_path / "x.exe")})
    assert r["isError"]
    gone = call("control_call", method="app.open", params={"path": str(tmp_path / "missing.png")})
    assert gone["isError"] and "missing.png" in text(gone)
