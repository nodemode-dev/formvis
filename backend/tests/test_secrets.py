"""API keys in the system's password store (1.52.5), with an in-memory stand-in store installed through keyring."""

import json
import os
import stat

import keyring
import pytest
from keyring.backend import KeyringBackend
from keyring.backends import fail
from keyring.errors import PasswordDeleteError

from app.core import config
from app.localgen import model_manager
from app.services import comfyui_auth, generative, llm, secrets


def make_memory(broken: bool = False, refusals: int = 0):
    """An in-memory stand-in store. keyring registers every store class as it is defined and picks the best at its
    first use, so this class is defined only here, after the fixture has recorded keyring's real choice: defined at
    import, it became the machine's store for every other test in the run."""
    class Memory(KeyringBackend):
        priority = 5

        def __init__(self):
            super().__init__()
            self.d = {}
            self.calls = []
            self.refusals = refusals

        def get_password(self, service, user):
            self.calls.append(("get", user))
            if self.refusals:
                self.refusals -= 1
                raise RuntimeError("the person chose Deny")
            return self.d.get((service, user))

        def set_password(self, service, user, password):
            self.calls.append(("set", user))
            if broken:
                raise RuntimeError("the store refused")
            self.d[(service, user)] = password

        def delete_password(self, service, user):
            self.calls.append(("delete", user))
            if (service, user) not in self.d:
                raise PasswordDeleteError()
            del self.d[(service, user)]
    return Memory()


@pytest.fixture()
def store():
    old = keyring.get_keyring()
    m = make_memory()
    keyring.set_keyring(m)
    yield m
    keyring.set_keyring(old)


def test_the_fal_key_goes_to_the_store_and_is_forgotten_there(client, store):
    r = client.put("/api/generative/key", json={"key": "fal-123"}).json()
    assert r["configured"] and r["store"] == "system" and store.d[("formvis", "fal")] == "fal-123"
    assert not (config.data_dir() / "generative.json").exists()                          # no file copy
    client.delete("/api/generative/key")
    assert ("formvis", "fal") not in store.d and client.get("/api/generative/status").json()["configured"] is False


def test_an_old_file_key_stays_in_its_file_and_the_store_is_not_asked(client, store):
    path = config.data_dir() / "generative.json"
    path.write_text(json.dumps({"falKey": "old-key"}))
    assert client.get("/api/generative/status").json()["configured"] is True
    assert ("formvis", "fal") not in store.d and path.exists()                           # a status check never reaches the store (1.98.9)
    (config.data_dir() / "llm.json").write_text(json.dumps({"baseUrl": "http://127.0.0.1:9/v1", "model": "m", "key": "sk-old"}))
    s = client.get("/api/llm/status").json()
    assert s["hasKey"] and s["store"] == "system" and ("formvis", "llm") not in store.d
    assert json.loads((config.data_dir() / "llm.json").read_text())["key"] == "sk-old" and llm._key() == "sk-old"


def test_the_language_model_key_is_kept_and_forgotten_in_the_store(client, store):
    client.post("/api/llm/settings", data={"base_url": "http://127.0.0.1:9/v1", "model": "m", "key": "sk-new"})
    assert store.d[("formvis", "llm")] == "sk-new" and "key" not in json.loads((config.data_dir() / "llm.json").read_text())
    assert client.post("/api/llm/settings", data={"base_url": "http://127.0.0.1:9/v1", "model": "m2"}).json()["hasKey"] is True   # kept
    assert client.post("/api/llm/settings", data={"base_url": "http://127.0.0.1:9/v1", "model": "m2", "forget_key": "true"}).json()["hasKey"] is False
    assert ("formvis", "llm") not in store.d


def test_with_no_store_or_a_failing_one_the_key_stays_in_the_file(client):
    old = keyring.get_keyring()
    try:
        for backend in (fail.Keyring(), make_memory(broken=True)):
            keyring.set_keyring(backend)
            r = client.put("/api/generative/key", json={"key": "fal-file"}).json()
            path = config.data_dir() / "generative.json"
            assert r["configured"] and json.loads(path.read_text())["falKey"] == "fal-file" and stat.S_IMODE(os.stat(path).st_mode) == 0o600
            assert r["store"] == ("file" if isinstance(backend, fail.Keyring) else "system")    # a failing store is still a store; the key is safe in the file
            client.delete("/api/generative/key")
    finally:
        keyring.set_keyring(old)


def keys_index() -> dict:
    return json.loads((config.data_dir() / "keys.json").read_text())


def mode(path) -> int:
    return stat.S_IMODE(os.stat(path).st_mode)


STATUS = ("/api/generative/status", "/api/llm/status", "/api/models/token", "/api/comfyui/auth", "/api/fal/models", "/api/generate")


def status_calls(client, store) -> list:
    before = len(store.calls)
    for url in STATUS:
        client.get(url)
    client.get("/api/comfyui/status", params={"target": "http://127.0.0.1:9"})
    return store.calls[before:]


def test_a_fal_key_in_generative_json_moves_to_the_store_on_first_use(client, store):
    path = config.data_dir() / "generative.json"
    path.write_text(json.dumps({"falKey": "fal-file-key-1234"}))
    assert client.get("/api/generative/status").json()["configured"] is True and store.calls == []
    assert generative._key() == ("fal-file-key-1234", "settings")
    assert store.d[("formvis", "fal")] == "fal-file-key-1234" and not path.exists()
    assert keys_index() == {"fal": {"last4": "1234"}} and mode(config.data_dir() / "keys.json") == 0o600


def test_a_language_model_key_in_llm_json_moves_to_the_store_on_first_use(client, store):
    path = config.data_dir() / "llm.json"
    path.write_text(json.dumps({"baseUrl": "http://127.0.0.1:9/v1", "model": "m", "key": "sk-file-key-5678"}))
    assert llm._key() == "sk-file-key-5678"
    assert store.d[("formvis", "llm")] == "sk-file-key-5678" and "key" not in json.loads(path.read_text())
    assert keys_index() == {"llm": {"last4": "5678"}} and "sk-file" not in (config.data_dir() / "keys.json").read_text()


def test_the_hugging_face_token_file_moves_to_the_store_on_first_use(client, store, monkeypatch):
    path = config.data_dir() / "huggingface_token.txt"
    monkeypatch.setattr(model_manager, "HF_TOKEN_FILE", path)
    path.write_text("hf_filetoken9012")
    assert model_manager.hf_token() == "hf_filetoken9012"
    assert store.d[("formvis", "huggingface")] == "hf_filetoken9012" and not path.exists()
    assert keys_index() == {"huggingface": {"last4": "9012"}}


def test_the_comfyui_secret_file_moves_to_the_store_on_first_use(client, store):
    path = config.data_dir() / "comfyui_auth.json"
    path.write_text(json.dumps({"mode": "bearer", "secret": "comfy-secret-3456"}))
    assert comfyui_auth.headers(probe=True) == {"Authorization": "Bearer comfy-secret-3456"} and store.calls == []
    assert comfyui_auth.headers() == {"Authorization": "Bearer comfy-secret-3456"}
    assert store.d[("formvis", "comfyui")] == "comfy-secret-3456" and "secret" not in json.loads(path.read_text())
    assert keys_index() == {"comfyui": {"last4": "3456"}}


def test_a_key_saved_by_1_98_8_is_found_on_first_use_and_status_then_shows_it(client, store):
    store.d[("formvis", "fal")] = "fal-keychain-7777"
    assert client.get("/api/generative/status").json()["configured"] is False and store.calls == []
    assert generative._key() == ("fal-keychain-7777", "settings") and store.calls == [("get", "fal")]
    assert keys_index() == {"fal": {"last4": "7777"}} and mode(config.data_dir() / "keys.json") == 0o600
    secrets._held.clear()
    s = client.get("/api/generative/status").json()
    assert s["configured"] is True and s["last4"] == "7777" and store.calls == [("get", "fal")]


def test_a_name_the_store_has_nothing_for_is_asked_once_a_session(client, store):
    assert generative._key() == (None, None) and generative._key() == (None, None)
    assert store.calls == [("get", "fal")]


def test_status_checks_never_reach_the_store_before_or_after_migration(client, store, monkeypatch):
    monkeypatch.setattr(model_manager, "HF_TOKEN_FILE", config.data_dir() / "huggingface_token.txt")
    (config.data_dir() / "generative.json").write_text(json.dumps({"falKey": "fal-file-key-1234"}))
    (config.data_dir() / "llm.json").write_text(json.dumps({"baseUrl": "http://127.0.0.1:9/v1", "model": "m", "key": "sk-file-key-5678"}))
    (config.data_dir() / "huggingface_token.txt").write_text("hf_filetoken9012")
    (config.data_dir() / "comfyui_auth.json").write_text(json.dumps({"mode": "bearer", "secret": "comfy-secret-3456"}))
    assert status_calls(client, store) == []
    generative._key(), llm._key(), model_manager.hf_token(), comfyui_auth.headers()
    assert set(keys_index()) == {"fal", "llm", "huggingface", "comfyui"}
    secrets._held.clear()
    assert status_calls(client, store) == []
    assert client.get("/api/generative/status").json()["last4"] == "1234" and client.get("/api/models/token").json() == {"hasKey": True, "last4": "9012", "store": "system"}


def test_a_refused_read_is_asked_again_on_the_next_use(client, store):
    client.put("/api/generative/key", json={"key": "fal-saved-4321"})
    secrets._held.clear()
    store.refusals = 1
    assert generative._key() == (None, None)
    assert client.get("/api/generative/status").json()["configured"] is True
    assert generative._key() == ("fal-saved-4321", "settings")


def test_a_saved_key_gone_from_the_store_no_longer_shows_as_set(client, store):
    client.put("/api/generative/key", json={"key": "fal-saved-4321"})
    secrets._held.clear()
    del store.d[("formvis", "fal")]
    assert generative._key() == (None, None)
    assert client.get("/api/generative/status").json()["configured"] is False
    assert generative._key() == (None, None) and store.calls.count(("get", "fal")) == 2


def test_keys_json_is_written_through_a_unique_temp_file(client, store, tmp_path):
    fixed = config.data_dir() / "keys.tmp"
    outside = tmp_path / "outside.txt"
    outside.write_text("untouched")
    fixed.symlink_to(outside)
    assert client.put("/api/generative/key", json={"key": "fal-temp-0001"}).json()["store"] == "system"
    assert outside.read_text() == "untouched" and keys_index() == {"fal": {"last4": "0001"}}
    fixed.unlink()
    fixed.mkdir()
    assert client.post("/api/llm/settings", data={"base_url": "http://127.0.0.1:9/v1", "model": "m", "key": "sk-temp-0002"}).json()["hasKey"] is True
    assert keys_index() == {"fal": {"last4": "0001"}, "llm": {"last4": "0002"}} and mode(config.data_dir() / "keys.json") == 0o600
    assert sorted(p.name for p in config.data_dir().iterdir() if p.name.startswith(".keys-")) == []
