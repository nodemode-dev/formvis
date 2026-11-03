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
from app.services import llm


def make_memory(broken: bool = False):
    """An in-memory stand-in store. keyring registers every store class as it is defined and picks the best at its
    first use, so this class is defined only here, after the fixture has recorded keyring's real choice: defined at
    import, it became the machine's store for every other test in the run."""
    class Memory(KeyringBackend):
        priority = 5

        def __init__(self):
            super().__init__()
            self.d = {}

        def get_password(self, service, user):
            return self.d.get((service, user))

        def set_password(self, service, user, password):
            if broken:
                raise RuntimeError("the store refused")
            self.d[(service, user)] = password

        def delete_password(self, service, user):
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
