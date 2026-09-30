"""ONNX Runtime sessions for the local models (1.53.4), kept at most KEEP at a time, least recently used dropped first:
SAM 2.1, U^2-Net, LaMa and Real-ESRGAN loaded together passed 3.9 GB and were killed on a 4 GB machine. A model used
again after being dropped is simply loaded again."""

import collections
import threading
import time

KEEP = 2
IDLE_SECONDS = 600   # a model unused this long is released (1.53.4): an engine idle after a fill kept 1.2 GB
_lock = threading.Lock()
_live: "collections.OrderedDict[str, object]" = collections.OrderedDict()
_used: dict[str, float] = {}
_sweeper: threading.Thread | None = None


def _sweep() -> None:
    while True:
        time.sleep(60)
        release_idle()


def release_idle(now: float | None = None) -> list[str]:
    """Drops every model unused for IDLE_SECONDS; the names dropped."""
    now = time.monotonic() if now is None else now
    with _lock:
        gone = [k for k in _live if now - _used.get(k, now) >= IDLE_SECONDS]
        for k in gone:
            _live.pop(k, None); _used.pop(k, None)
    return gone


def get(key: str, load):
    """The session(s) under `key`, loading them with `load()` when not held."""
    global _sweeper
    with _lock:
        if _sweeper is None:
            _sweeper = threading.Thread(target=_sweep, name="formvis-model-sweeper", daemon=True)
            _sweeper.start()
        if key in _live:
            _live.move_to_end(key)
            _used[key] = time.monotonic()
            return _live[key]
    value = load()
    with _lock:
        _live[key] = value
        _used[key] = time.monotonic()
        _live.move_to_end(key)
        while len(_live) > KEEP:
            gone, _ = _live.popitem(last=False)
            _used.pop(gone, None)
    return value


def held() -> list[str]:
    with _lock:
        return list(_live)


def release_all() -> None:
    with _lock:
        _live.clear(); _used.clear()
