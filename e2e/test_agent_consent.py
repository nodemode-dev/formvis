# Seamless start for outside agents (1.53.3): with agents not allowed, an agent's first call asks in the window;
# Allow runs it, returns its result, and keeps the setting.
import json
import threading
import urllib.request

DLG = ".cv-scrim:not([hidden]) .cv-dialog"
MODERN = {"io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": {"name": "test-agent", "version": "1"}}


def call(name, args, out):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"_meta": MODERN, "name": name, "arguments": args}}).encode()
    req = urllib.request.Request("http://127.0.0.1:8190/mcp", body, {"Content-Type": "application/json", "Accept": "application/json", "MCP-Protocol-Version": "2026-07-28"})
    out.append(json.loads(urllib.request.urlopen(req, timeout=120).read())["result"])


def test_the_first_call_asks_and_allow_runs_it(page):
    page.evaluate("() => { localStorage.setItem('formvis.prefs', JSON.stringify({ ...JSON.parse(localStorage.getItem('formvis.prefs') || '{}'), agentsAllowed: false })); window.dispatchEvent(new CustomEvent('formvis:agents', { detail: false })); window.formvis.engine.newDocument(64, 48, 'Asked', 'white'); }")
    page.wait_for_timeout(1500)                                                              # the window polls, saying agents are not allowed
    out = []
    t = threading.Thread(target=call, args=("get_document", {}, out)); t.start()
    ask = page.locator(DLG, has_text="Allow an outside agent to edit?")
    ask.wait_for(timeout=20000)
    assert "Claude Code, Codex or Cursor" in ask.inner_text()
    ask.locator(".cv-dialog-foot button").filter(has_text="Allow").first.click()
    t.join(60)
    assert out and not out[0].get("isError") and "64" in json.dumps(out[0]), out           # ran, with the document's size
    assert page.evaluate("JSON.parse(localStorage.getItem('formvis.prefs')).agentsAllowed") is True   # the setting kept
