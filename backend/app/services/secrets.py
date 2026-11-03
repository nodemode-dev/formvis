"""API keys (1.52.5, the capability plan): kept in the system's password store (macOS Keychain, Windows Credential
Manager, the Secret Service on Linux) through keyring (MIT), or, where there is none, in a file readable only by the
user, as before. A password store that fails leaves the key in the file: a key is never lost.

The password store is reached only when the person saves or removes a key, or runs a feature that needs a key
(1.98.9). Opening the app and every status check answer from keys.json, which records which keys were saved there and
their last four characters, never a key. A key found in a file is moved to the password store the first time a feature
uses it, and the file copy removed."""

import json
import os
import tempfile
import threading

from app.core import config

SERVICE = "formvis"

#: Keys this session read from the password store or saved there, so a later status check need not ask again.
_held: dict[str, str] = {}
#: Names keys.json does not list that the password store had nothing for this session, so a use asks only once.
_asked: set[str] = set()
_lock = threading.RLock()


def _index_path():
    return config.data_dir() / "keys.json"


def _index() -> dict:
    try:
        d = json.loads(_index_path().read_text())
        return d if isinstance(d, dict) else {}
    except (OSError, ValueError):
        return {}


def _index_write(d: dict) -> None:
    path = _index_path()
    fd, temp = tempfile.mkstemp(dir=path.parent, prefix=".keys-", suffix=".tmp")
    try:
        os.chmod(temp, 0o600)
        with os.fdopen(fd, "w") as f:
            json.dump(d, f)
        os.replace(temp, path)
    except BaseException:
        try:
            os.unlink(temp)
        except OSError:
            pass
        raise


def _index_set(name: str, value: str) -> None:
    _index_write({**_index(), name: {"last4": _last4(value)}})


def _index_drop(name: str) -> None:
    d = _index()
    if name in d:
        _index_write({k: v for k, v in d.items() if k != name})


def _entry(name: str) -> dict | None:
    e = _index().get(name)
    return e if isinstance(e, dict) else None


def _last4(value: str | None) -> str:
    return value[-4:] if value and len(value) >= 8 else ""


def _store():
    """The system's password store, or None where there is none (keyring's fail and null backends)."""
    try:
        import keyring
        from keyring.backends import fail, null
        kr = keyring.get_keyring()
    except Exception:
        return None
    if isinstance(kr, (fail.Keyring, null.Keyring)) or getattr(kr, "priority", 1) <= 0:
        return None
    return kr


def where() -> dict:
    kr = _store()
    return {"store": "system" if kr else "file", "backend": type(kr).__name__ if kr else "file readable only by you"}


def _ask(kr, name: str) -> tuple[str | None, bool]:
    """The stored key, and whether the password store answered at all (False when it refused or failed)."""
    try:
        return kr.get_password(SERVICE, name) or None, True
    except Exception:
        return None, False


def _keep(kr, name: str, value: str, file_clear) -> bool:
    """Saves `value` in the password store, read back, then names it in keys.json; the file copy goes last."""
    try:
        kr.set_password(SERVICE, name, value)
        if kr.get_password(SERVICE, name) != value:
            return False
        _index_set(name, value)
        _held[name] = value
        _asked.discard(name)
        file_clear()
        return True
    except Exception:
        return False


def _ask_once(kr, name: str) -> str | None:
    """A key an earlier version saved in the password store without a keys.json entry: asked once a session."""
    if name in _asked:
        return None
    value, answered = _ask(kr, name)
    if value:
        try:
            _index_set(name, value)
        except OSError:
            pass
        _held[name] = value
        return value
    if answered:
        _asked.add(name)
    return None


def get(name: str, file_read, file_clear) -> str | None:
    """The key called `name`, for a feature about to use it: held this session, from the password store when keys.json
    names it, from a file copy (moved to the password store on this first use), or a key an earlier version saved in
    the password store."""
    with _lock:
        if name in _held:
            return _held[name]
        kr = _store()
        if kr is None:
            return file_read()
        if _entry(name) is not None:
            value, answered = _ask(kr, name)
            if value:
                _held[name] = value
                return value
            if not answered:
                return file_read()
            _index_drop(name)
            _asked.add(name)
        legacy = file_read()
        if legacy:
            _keep(kr, name, legacy, file_clear)
            return legacy
        return _ask_once(kr, name)


def summary(name: str, file_read) -> tuple[bool, str, str | None]:
    """For a status check: whether a key called `name` is kept, its last four characters, and the key itself only when
    it is at hand without the password store (held this session, or in a file). Never asks the password store."""
    entry = _entry(name)
    if entry is not None:
        value = _held.get(name)
        return True, _last4(value) if value else str(entry.get("last4", "")), value
    value = file_read()
    return bool(value), _last4(value), value


def put(name: str, value: str, file_write, file_clear) -> str:
    """Keeps `value`; where it went: "system" or "file". The file copy goes only after keys.json names the key."""
    with _lock:
        _asked.discard(name)
        kr = _store()
        if kr and _keep(kr, name, value, file_clear):
            return "system"
        _held.pop(name, None)
        _index_drop(name)
        file_write(value)
        return "file"


def delete(name: str, file_clear) -> None:
    """Forgets the key called `name` when the person removes it: from the password store too, including a key an
    earlier version saved there and keys.json does not name."""
    with _lock:
        kr = _store()
        if kr:
            try:
                kr.delete_password(SERVICE, name)
            except Exception:
                pass   # it was not there
        _index_drop(name)
        _held.pop(name, None)
        _asked.discard(name)
        file_clear()
