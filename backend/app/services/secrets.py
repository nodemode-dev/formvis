"""API keys (1.52.5, the capability plan): kept in the system's password store (macOS Keychain, Windows Credential
Manager, the Secret Service on Linux) through keyring (MIT), or, where there is none, in a file readable only by the
user, as before. A password store that fails leaves the key in the file: a key is never lost.

The password store is reached only when the person saves or removes a key, or runs a feature that needs a key they
saved (1.98.9). Opening the app and every status check answer from keys.json, which records which keys were saved
there and their last four characters, never a key."""

import json
import os
import threading

from app.core import config

SERVICE = "formvis"

#: Keys this session read from the password store or saved there, so a later status check need not ask again.
_held: dict[str, str] = {}
#: Names the password store had nothing for (or refused) this session, so a use does not ask again until a save.
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
    temp = path.with_suffix(".tmp")
    fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        json.dump(d, f)
    os.replace(temp, path)


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


def get(name: str, file_read, file_clear) -> str | None:
    """The key called `name`, for a feature about to use it. The password store is asked only for a key saved there
    through `put`; a file copy stays in its file until the key is saved again. `file_clear` is kept for the callers."""
    if _entry(name) is None or name in _asked:
        return file_read()
    if name in _held:
        return _held[name]
    kr = _store()
    value = None
    if kr:
        try:
            value = kr.get_password(SERVICE, name)
        except Exception:
            value = None
    if value:
        _held[name] = value
        return value
    _asked.add(name)
    return file_read()


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
        if kr:
            try:
                kr.set_password(SERVICE, name, value)
                if kr.get_password(SERVICE, name) == value:
                    _index_write({**_index(), name: {"last4": _last4(value)}})
                    _held[name] = value
                    file_clear()
                    return "system"
            except Exception:
                pass
        _held.pop(name, None)
        d = _index()
        if d.pop(name, None) is not None:
            _index_write(d)
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
        d = _index()
        if d.pop(name, None) is not None:
            _index_write(d)
        _held.pop(name, None)
        _asked.discard(name)
        file_clear()
