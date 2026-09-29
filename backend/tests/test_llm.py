"""Prompt improvement (1.51.5), against a stand-in OpenAI-compatible service."""

import json
import os
import stat
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

from app.core import config


@pytest.fixture()
def service():
    seen = {"bodies": [], "auth": []}

    class H(BaseHTTPRequestHandler):
        def log_message(self, *a): pass

        def _reply(self, code, obj):
            self.send_response(code); self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(json.dumps(obj).encode())

        def do_GET(self):
            seen["auth"].append(self.headers.get("Authorization"))
            if self.headers.get("Authorization") == "Bearer wrong": return self._reply(401, {})
            self._reply(200, {"data": [{"id": "llama3.2"}, {"id": "qwen2.5"}]} if self.path == "/v1/models" else {})

        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
            seen["bodies"].append(body); seen["auth"].append(self.headers.get("Authorization"))
            self._reply(200, {"choices": [{"message": {"content": 'Prompt: "A weathered red kite over a stormy sea, dramatic light"'}}]})

    server = ThreadingHTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_address[1]}/v1", seen
    server.shutdown()


def test_improving_sends_the_template_and_returns_the_prompt_alone(client, service):
    base, seen = service
    s = client.post("/api/llm/settings", data={"base_url": base, "model": "llama3.2", "key": "sk-test"}).json()
    assert s == {"configured": True, "baseUrl": base, "model": "llama3.2", "hasKey": True, "store": "file"}   # never the key; no password store here
    assert stat.S_IMODE(os.stat(config.data_dir() / "llm.json").st_mode) == 0o600
    assert client.get("/api/llm/models").json() == {"models": ["llama3.2", "qwen2.5"]}
    r = client.post("/api/llm/improve", data={"prompt": "a kite", "instructions": "Add weather and light."})
    assert r.json() == {"prompt": "A weathered red kite over a stormy sea, dramatic light"}                 # quotes and prefix gone
    body = seen["bodies"][-1]
    assert body["model"] == "llama3.2" and body["messages"][0]["role"] == "system" and body["messages"][0]["content"].startswith("Add weather and light.")
    assert "rewritten prompt only" in body["messages"][0]["content"] and body["messages"][1] == {"role": "user", "content": "a kite"}
    assert seen["auth"][-1] == "Bearer sk-test"
    assert client.post("/api/llm/settings", data={"base_url": base, "model": "qwen2.5"}).json()["hasKey"] is True   # kept when not given
    assert client.post("/api/llm/settings", data={"base_url": base, "model": "qwen2.5", "forget_key": "true"}).json()["hasKey"] is False


def test_clear_messages_when_something_is_wrong(client, service):
    base, _ = service
    client.post("/api/llm/settings", data={"base_url": base, "model": "llama3.2", "key": "wrong"})
    r = client.get("/api/llm/models")
    assert r.status_code == 502 and "refused the key" in r.json()["detail"]
    client.post("/api/llm/settings", data={"base_url": "http://127.0.0.1:9/v1", "model": "llama3.2", "forget_key": "true"})
    assert "Nothing answers" in client.post("/api/llm/improve", data={"prompt": "x"}).json()["detail"]
    assert client.post("/api/llm/improve", data={"prompt": "  "}).status_code == 400
    assert client.post("/api/llm/settings", data={"base_url": "file:///etc", "model": "m"}).status_code == 422


def test_the_assistants_step_carries_the_tools_and_returns_the_calls(client, service):
    base, seen = service
    client.post("/api/llm/settings", data={"base_url": base, "model": "llama3.2", "key": "sk-test"})
    r = client.post("/api/llm/chat", json={"messages": [{"role": "system", "content": "You edit pictures."}, {"role": "user", "content": "Add a layer called Sky."}]})
    assert r.status_code == 200 and r.json()["content"]                                                 # the stand-in answers with text
    body = seen["bodies"][-1]
    names = [t["function"]["name"] for t in body["tools"]]
    assert "add_layer" in names and "get_document" in names and body["tool_choice"] == "auto"            # the MCP catalogue, as functions
    assert body["tools"][0]["function"]["parameters"]["type"] == "object" and seen["auth"][-1] == "Bearer sk-test"
    assert body["messages"][1] == {"role": "user", "content": "Add a layer called Sky."}
    assert client.post("/api/llm/chat", json={"messages": []}).status_code == 400
