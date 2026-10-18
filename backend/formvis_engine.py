import json
import os
import sys


def resource_dir() -> str:
    return getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))


def selfcheck() -> int:
    info = {"python": sys.version.split()[0]}
    for name in ("PIL", "fastapi", "uvicorn", "numpy", "cv2"):
        try:
            module = __import__(name)
            info[name.lower()] = getattr(module, "__version__", "ok")
        except Exception as exc:
            info[name.lower()] = f"missing: {exc}"
    from app import __version__

    info["formvis"] = __version__
    info["dist_bundled"] = os.path.isdir(os.path.join(resource_dir(), "frontend_dist"))
    print(json.dumps(info))
    return 0


def watch_parent() -> None:
    """Exits when the process that started this one is gone (1.86.2). The one-file build runs as two processes: the
    launcher unpacks about a gigabyte into a temporary _MEI folder and starts this server as its child. When the desktop
    shell had to force the launcher closed, nothing told this server, which kept running with the CPU, memory and port it
    held, and the folder stayed behind; each launch could add another. The launcher would have removed the folder, so
    with it gone this process does."""
    if os.name != "posix":
        return
    parent = os.getppid()
    if parent <= 1:
        return
    import shutil
    import threading
    import time

    def run() -> None:
        while os.getppid() == parent:
            time.sleep(2)
        unpacked = getattr(sys, "_MEIPASS", "")
        if os.path.basename(unpacked).startswith("_MEI"):
            shutil.rmtree(unpacked, ignore_errors=True)
        os._exit(0)

    threading.Thread(target=run, name="formvis-parent-watch", daemon=True).start()


def main() -> int:
    if "--selfcheck" in sys.argv:
        return selfcheck()
    watch_parent()
    bundled = os.path.join(resource_dir(), "frontend_dist")
    if os.path.isdir(bundled):
        os.environ.setdefault("FORMVIS_DIST", bundled)
    os.environ.setdefault("FORMVIS_DESKTOP", "1")
    import uvicorn

    from app.main import app as fastapi_app

    port = int(os.environ.get("FORMVIS_PORT", "0") or 0)
    uvicorn.run(fastapi_app, host="127.0.0.1", port=port, log_level="info")
    return 0


if __name__ == "__main__":
    import multiprocessing
    multiprocessing.freeze_support()
    sys.exit(main())
