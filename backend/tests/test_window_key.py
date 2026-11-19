import json

import pytest
from starlette.websockets import WebSocketDisconnect

from app.core import seal, window_key


def _write_operations(app):
    for path, item in app.openapi()["paths"].items():
        for method in item:
            if method.upper() not in ("GET", "HEAD", "OPTIONS"):
                yield method.upper(), path


def test_every_write_route_needs_the_window_key_unless_it_is_on_the_open_list(bare):
    from app.main import app

    answered = []
    for method, path in _write_operations(app):
        if path in window_key.OPEN:
            continue
        url = path
        for part in [p for p in path.split("/") if p.startswith("{")]:
            url = url.replace(part, "x")
        res = bare.request(method, url)
        if res.status_code != 403:
            answered.append(f"{method} {path} {res.status_code}")
        else:
            assert res.json() == {"detail": window_key.REFUSED}
    assert answered == []


def test_the_open_list_is_short_and_named():
    assert window_key.OPEN == ("/mcp", "/api/window/key", "/api/merge/panorama", "/api/merge/hdr")


def test_the_development_bootstrap_answers_once(bare, monkeypatch):
    monkeypatch.setitem(window_key.STATE, "claimed", False)
    monkeypatch.setitem(window_key.STATE, "secondClaim", False)
    first = bare.post("/api/window/key")
    assert first.status_code == 200 and first.json()["key"] == window_key.KEY
    assert bare.post("/api/window/key").status_code == 409
    assert bare.get("/api/window/key").json() == {"claimed": True, "secondClaim": True, "packaged": False}


def test_packaged_mode_has_no_bootstrap(bare, monkeypatch):
    monkeypatch.setenv(window_key.STDOUT_ENV, "1")
    monkeypatch.setitem(window_key.STATE, "claimed", False)
    assert bare.post("/api/window/key").status_code == 404
    assert window_key.STATE["claimed"] is False


def test_approval_policy_and_the_bridge_poll_need_the_key(bare, client):
    assert bare.post("/api/agents/approve", json={"id": "1", "allow": True}).status_code == 403
    assert bare.post("/api/agents/policy", json={"client": "x", "policy": "allow"}).status_code == 403
    assert bare.get("/api/agents").status_code == 403
    assert bare.get("/api/mcp/bridge/next?allowed=1").status_code == 403
    assert client.post("/api/agents/approve", json={"id": "1", "allow": True}).status_code == 404
    assert client.get("/api/agents").status_code == 200


@pytest.mark.parametrize("first", [None, {"type": "key", "key": "wrong"}])
def test_a_socket_without_the_key_gets_nothing(bare, first, monkeypatch):
    monkeypatch.setattr(window_key, "SOCKET_WAIT", 0.5)
    with pytest.raises(WebSocketDisconnect) as closed:
        with bare.websocket_connect("/api/agents/stream", headers={"host": "127.0.0.1:8190"}) as ws:
            if first is not None:
                ws.send_text(json.dumps(first))
            ws.receive_text()
    assert closed.value.code == 4403


def test_a_socket_with_the_key_is_the_window(bare):
    with bare.websocket_connect("/api/agents/stream", headers={"host": "127.0.0.1:8190"}) as ws:
        ws.send_text(json.dumps({"type": "key", "key": window_key.KEY}))
        assert json.loads(ws.receive_text())["type"] == "state"


def test_each_claude_tab_has_its_own_token_and_it_dies_with_the_tab():
    from app.services import agents

    one, two = agents.issue_inapp(), agents.issue_inapp()
    assert one != two and agents.is_inapp(one) and agents.is_inapp(two)
    agents.revoke_inapp(one)
    assert not agents.is_inapp(one) and agents.is_inapp(two)
    agents.revoke_inapp(two)


class _Memory:
    priority = 1

    def __init__(self):
        self.store = {}

    def get_password(self, service, username):
        return self.store.get((service, username))

    def set_password(self, service, username, password):
        self.store[(service, username)] = password


def _reload(agents):
    agents._loaded = False
    agents._policies.clear()
    agents._stored["allowed"] = None
    agents._seal["state"] = "unsealed"
    agents._load()


def test_a_hand_edit_of_the_stored_choice_is_caught(tmp_path, monkeypatch):
    import keyring
    from keyring.backend import KeyringBackend

    from app.services import agents

    class Memory(_Memory, KeyringBackend):
        pass

    monkeypatch.setenv("FORMVIS_DATA_DIR", str(tmp_path))
    previous = keyring.get_keyring()
    keyring.set_keyring(Memory())
    seal.reset()
    try:
        agents.set_policy("Codex", "allow")
        _reload(agents)
        assert agents.state()["seal"] == "ok" and agents.policy_of("Codex") == "allow"
        stored = json.loads((tmp_path / "agents.json").read_text())
        stored["policies"]["Cursor"] = "allow"
        (tmp_path / "agents.json").write_text(json.dumps(stored))
        _reload(agents)
        state = agents.state()
        assert state["sealBroken"] is True and agents.policy_of("Cursor") == "ask" and agents.policy_of("Codex") == "ask"
    finally:
        keyring.set_keyring(previous)
        seal.reset()
        _reload(agents)


def test_with_no_keychain_the_stored_choice_stands(tmp_path, monkeypatch):
    import keyring
    from keyring.backends import fail

    from app.services import agents

    monkeypatch.setenv("FORMVIS_DATA_DIR", str(tmp_path))
    previous = keyring.get_keyring()
    keyring.set_keyring(fail.Keyring())
    seal.reset()
    try:
        (tmp_path / "agents.json").write_text(json.dumps({"policies": {"Cursor": "allow"}}))
        _reload(agents)
        assert agents.state()["seal"] == "unavailable" and agents.policy_of("Cursor") == "allow"
    finally:
        keyring.set_keyring(previous)
        seal.reset()
        _reload(agents)
