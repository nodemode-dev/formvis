"""The engine's own run: command-line switches, the log file with rotation and the single instance per data folder."""
import json
import logging
import os
import time
from logging.handlers import RotatingFileHandler
from pathlib import Path

from app.core import startup

LOG_NAME = "formvis-engine.log"
LOCK_NAME = "engine.lock"
LOG_BYTES = 1_048_576
LOG_KEEP = 3
STARTED = time.time()
_FORMAT = "%(asctime)s %(levelname)s %(name)s %(message)s"
_LOGGERS = ("formvis", "uvicorn", "uvicorn.error", "uvicorn.access")


AlreadyRunning = startup.Busy


def apply_switches(argv: list[str]) -> list[str]:
    """Reads the switches the engine honours and turns them into the environment its config reads; gives back the
    arguments it did not know. --user-data-dir PATH, --portable, --port N, --no-comfy, --tiles, --no-tiles and
    --log-level LEVEL, each also as --name=value."""
    rest: list[str] = []
    items = list(argv)
    valued = {"--user-data-dir": "FORMVIS_DATA_DIR", "--port": "FORMVIS_PORT", "--log-level": "FORMVIS_LOG_LEVEL"}
    flags = {"--portable": ("FORMVIS_PORTABLE", "1"), "--no-comfy": ("FORMVIS_NO_COMFY", "1"), "--tiles": ("FORMVIS_TILES", "on"), "--no-tiles": ("FORMVIS_TILES", "off")}
    i = 0
    while i < len(items):
        arg = items[i]
        name, eq, value = arg.partition("=")
        if name in valued:
            if not eq:
                i += 1
                value = items[i] if i < len(items) else ""
            if value:
                os.environ[valued[name]] = value
        elif arg in flags:
            os.environ[flags[arg][0]] = flags[arg][1]
        else:
            rest.append(arg)
        i += 1
    return rest


def switches() -> dict:
    """The switches in effect, for Help > System Info and the agents."""
    return {
        "portable": os.environ.get("FORMVIS_PORTABLE") == "1",
        "noComfy": os.environ.get("FORMVIS_NO_COMFY") == "1",
        "tiles": os.environ.get("FORMVIS_TILES") or "auto",
        "logLevel": os.environ.get("FORMVIS_LOG_LEVEL", "INFO").upper(),
    }


def log_path(data: Path) -> Path:
    folder = data / "Logs"
    folder.mkdir(parents=True, exist_ok=True)
    return folder / LOG_NAME


def start_logging(data: Path) -> Path:
    """Logs the engine and the server to Logs/formvis-engine.log in the data folder, about a megabyte each, three older
    files kept (FORMVIS_LOG_BYTES changes the size, FORMVIS_LOG_LEVEL the level). The entry calls this before the lock is
    asked for and the web app calls it again at startup: a second call for the same file keeps the handler and puts it
    back on the server's loggers, which the server's own log setup clears."""
    path = log_path(data)
    for held in logging.getLogger("formvis").handlers:
        if held.get_name() == "formvis-file" and getattr(held, "baseFilename", "") == os.path.abspath(path):
            for name in _LOGGERS:
                if held not in logging.getLogger(name).handlers:
                    logging.getLogger(name).addHandler(held)
            return path
    stop_logging()
    try:
        size = int(os.environ.get("FORMVIS_LOG_BYTES", "") or LOG_BYTES)
    except ValueError:
        size = LOG_BYTES
    level = getattr(logging, os.environ.get("FORMVIS_LOG_LEVEL", "INFO").upper(), logging.INFO)
    handler = RotatingFileHandler(path, maxBytes=max(size, 1024), backupCount=LOG_KEEP, encoding="utf-8")
    handler.setFormatter(logging.Formatter(_FORMAT))
    handler.set_name("formvis-file")
    for name in _LOGGERS:
        log = logging.getLogger(name)
        log.addHandler(handler)
        if name == "formvis" or log.level == logging.NOTSET or log.level > level:
            log.setLevel(level)
    logging.getLogger("formvis").info("engine started, pid %s, data folder %s", os.getpid(), data)
    return path


def stop_logging() -> None:
    for name in _LOGGERS:
        log = logging.getLogger(name)
        for handler in list(log.handlers):
            if handler.get_name() == "formvis-file":
                log.removeHandler(handler)
                handler.close()


def log_tail(data: Path, lines: int = 200) -> str:
    path = log_path(data)
    try:
        with path.open("rb") as f:
            f.seek(0, os.SEEK_END)
            end = f.tell()
            f.seek(max(0, end - 262_144))
            text = f.read().decode("utf-8", "replace")
    except OSError:
        return ""
    return "\n".join(text.splitlines()[-max(1, min(lines, 5000)):])


def _alive(pid: int) -> bool:
    return startup.alive(pid)


def claim(data: Path) -> Path:
    """Takes the data folder for this process (core/startup.py claim). Raises AlreadyRunning when an engine whose app is
    still there holds it; a lock left by a process that is gone is replaced, and an engine left running without its app
    is ended first."""
    lock, replaced = startup.claim(data, startup.shell_pid())
    if replaced:
        logging.getLogger("formvis").warning("an engine left running without its app was stopped (process %s)", replaced)
    return lock


def release(data: Path) -> None:
    lock = data / LOCK_NAME
    try:
        if int(json.loads(lock.read_text()).get("pid", 0)) == os.getpid():
            lock.unlink()
    except (OSError, ValueError, AttributeError):
        pass
