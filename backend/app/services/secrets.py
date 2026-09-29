"""API keys (1.52.5, the capability plan): kept in the system's password store (macOS Keychain, Windows Credential
Manager, the Secret Service on Linux) through keyring (MIT), or, where there is none, in a file readable only by the
user, as before. A key found in a file is moved to the password store the first time it is read, and the file copy
removed. A password store that fails leaves the key in the file: a key is never lost."""

SERVICE = "formvis"


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
    """The key called `name`: from the password store, moving a file copy there first if there is one."""
    kr = _store()
    if not kr:
        return file_read()
    try:
        value = kr.get_password(SERVICE, name)
    except Exception:
        value = None
    if value:
        return value
    legacy = file_read()
    if legacy:
        try:
            kr.set_password(SERVICE, name, legacy)
            if kr.get_password(SERVICE, name) == legacy:
                file_clear()   # moved, and read back before the file copy goes
        except Exception:
            pass
    return legacy


def put(name: str, value: str, file_write, file_clear) -> str:
    """Keeps `value`; where it went: "system" or "file"."""
    kr = _store()
    if kr:
        try:
            kr.set_password(SERVICE, name, value)
            if kr.get_password(SERVICE, name) == value:
                file_clear()
                return "system"
        except Exception:
            pass
    file_write(value)
    return "file"


def delete(name: str, file_clear) -> None:
    kr = _store()
    if kr:
        try:
            kr.delete_password(SERVICE, name)
        except Exception:
            pass   # it was not there
    file_clear()
