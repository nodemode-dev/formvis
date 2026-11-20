import json
import logging
import os
import sys
from pathlib import Path

if sys.stdin is None:
    sys.stdin = open(os.devnull, encoding="utf-8")
if sys.stdout is None:
    sys.stdout = open(os.devnull, "w", encoding="utf-8")
if sys.stderr is None:
    sys.stderr = open(os.devnull, "w", encoding="utf-8")

PORT_NAME = "engine.port"


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
    # The whole app is imported as the server would import it, so a module that fails at import (a data file left out
    # of the bundle, 1.95.7) fails the build here instead of the engine failing to start on the person's computer.
    try:
        import app.main  # noqa: F401
        from app.services import fal_run

        info["app"] = "ok"
        info["fal_models"] = len(fal_run.models())
    except Exception as exc:
        info["app"] = f"failed: {exc!r}"
        print(json.dumps(info))
        return 1
    info["heic"] = heic_check()
    problem = heic_problem(info["heic"], os.environ.get("FORMVIS_REQUIRE_HEIC") == "1")
    if problem:
        info["heic"]["problem"] = problem
    print(json.dumps(info))
    if (getattr(sys, "frozen", False) and info["heic"]["gpl"]) or problem:
        return 1
    return 0 if info["fal_models"] else 1


DECODE_ONLY_DECODERS = ["libde265"]
DECODE_ONLY_ENCODERS = {"mask"}


def heic_problem(heic: dict, required: bool) -> str:
    """Why a build that must carry HEIC decoding (the freeze scripts set FORMVIS_REQUIRE_HEIC=1 when they built it) does
    not: no decoder, a decoder other than libde265, or any encoder beyond libheif's mask. Empty when it is right or not
    required."""
    if not required:
        return ""
    if heic.get("decoder", "none") == "none":
        return f"no HEIC decoder in this build ({heic.get('error', 'pillow_heif did not import')})"
    if heic.get("decoders") != DECODE_ONLY_DECODERS:
        return f"HEIC decoders are {heic.get('decoders')}, not {DECODE_ONLY_DECODERS}"
    if not set(heic.get("encoders", [])) <= DECODE_ONLY_ENCODERS:
        return f"HEIC encoders {sorted(set(heic.get('encoders', [])) - DECODE_ONLY_ENCODERS)} are in this build"
    return ""


def heic_check() -> dict:
    """The HEIC decoder this engine carries. A frozen engine must not hold a GPL encoder (x265, x264): the PyPI
    pillow-heif wheel links one, so `setup/heif_decode.py` builds a decode-only libheif for the desktop."""
    try:
        import pillow_heif
    except Exception as exc:
        return {"decoder": "none", "gpl": [], "error": str(exc)}
    found = pillow_heif.libheif_info()
    encoders = sorted((found.get("encoders") or {}).keys())
    return {"decoder": "libheif " + pillow_heif.libheif_version(), "encoders": encoders,
            "decoders": sorted((found.get("decoders") or {}).keys()),
            "gpl": [e for e in encoders if e.lower() in ("x265", "x264")]}


def watch_parent(data) -> None:
    """Exits when the process that started this one is gone (1.86.2). The one-file build runs as two processes: the
    launcher unpacks about a gigabyte into a temporary _MEI folder and starts this server as its child. When the desktop
    shell had to force the launcher closed, nothing told this server, which kept running with the CPU, memory and port it
    held, and the folder stayed behind; each launch could add another. The launcher would have removed the folder, so
    with it gone this process does. From 2.6.0 the shell named in FORMVIS_SHELL_PID is watched on Windows too, and the
    lock and the port file are given up before leaving."""
    from app.core import runtime, startup

    shell = startup.shell_pid()
    if not shell and os.name == "posix":
        shell = os.getppid()
    if shell <= 1:
        return
    import shutil

    def leave() -> None:
        logging.getLogger("formvis").info("the app that started this engine is gone (process %s), stopping", shell)
        runtime.release(data)
        try:
            if json.loads((data / PORT_NAME).read_text(encoding="utf-8")).get("pid") == os.getpid():
                (data / PORT_NAME).unlink()
        except (OSError, ValueError, AttributeError):
            pass
        unpacked = getattr(sys, "_MEIPASS", "")
        if os.name == "posix" and os.path.basename(unpacked).startswith("_MEI"):
            shutil.rmtree(unpacked, ignore_errors=True)
        os._exit(0)

    startup.watch(shell, leave)


def sweep_stale_unpacks() -> None:
    """Removes the temporary folders earlier launches left behind (1.86.3). The one-file launcher names its folder
    `_MEI` + its process id as eight hex digits + six random characters, and deletes it when it exits; a launcher that
    was forced closed never did. The owner's Mac held 31 such folders, about 5.3 GB, one per launch of every build that
    day. A folder whose process is gone belongs to nobody, whichever program made it; one whose id is in use is kept
    (the id may have been reused, so this is conservative), and so is this engine's own. Runs in the background so the
    engine starts at once."""
    unpacked = getattr(sys, "_MEIPASS", "")
    if os.name != "posix" or not os.path.basename(unpacked).startswith("_MEI"):
        return
    import re
    import shutil
    import threading

    def alive(pid: int) -> bool:
        try:
            os.kill(pid, 0)
        except ProcessLookupError:
            return False
        except PermissionError:
            return False   # another user's process now holds the id, so this user's launcher is gone
        return True

    def run() -> None:
        root, own = os.path.dirname(unpacked), os.path.basename(unpacked)
        try:
            names = os.listdir(root)
        except OSError:
            return
        for name in names:
            m = re.fullmatch(r"_MEI([0-9a-f]{8})[A-Za-z0-9]{6}", name)
            if not m or name == own or alive(int(m.group(1), 16)):
                continue
            shutil.rmtree(os.path.join(root, name), ignore_errors=True)

    threading.Thread(target=run, name="formvis-unpack-sweep", daemon=True).start()


def run_mcp(argv: list[str]) -> int:
    """`mcp` (1.90.9): the MCP stdio server of the packaged app, which the desktop binary starts when its first argument is
    `mcp` (the AppImage or the app bundle's binary, as an agent's configuration names it). It is setup/mcp_stdio.py, packed as
    data, pointed at the port the app's engine keeps in engine.port; with no engine running the app is started from
    FORMVIS_LAUNCHER, which the desktop binary passes. --user-data-dir and --portable point it at the data folder of an engine
    started with them."""
    from app.core import config, runtime
    argv = runtime.apply_switches(argv)
    if "--version" in argv:
        from app import __version__
        print(f"formvis {__version__}")
        return 0
    if "--headless" in argv:
        print("formvis mcp: --headless needs the repository launcher (./formvis mcp --headless); the packaged app has a window of its own.", file=sys.stderr)
        return 2
    os.environ["FORMVIS_PORT_FILE"] = str(config.data_dir() / PORT_NAME)
    setup_path()
    import mcp_stdio

    sys.argv = ["formvis mcp", *argv]
    mcp_stdio.main()
    return 0


def setup_path() -> None:
    """Puts the packed setup scripts (data in the one-file build, ../setup beside the source) on the import path."""
    for base in (resource_dir(), os.path.dirname(resource_dir())):
        folder = os.path.join(base, "setup")
        if os.path.isfile(os.path.join(folder, "mcp_stdio.py")):
            sys.path.insert(0, folder)
            return


def run_agents(argv: list[str]) -> int:
    """`agents install [claude|codex|cursor]` of the packaged app: setup/agents.py, which registers this app's own binary
    (`mcp` as its argument) with Claude Code, Codex and Cursor."""
    if argv and argv[0] != "install":
        print("formvis agents: the packaged app offers install only (agents install [claude|codex|cursor] [--dry-run]).", file=sys.stderr)
        return 2
    setup_path()
    import agents as agent_setup

    return agent_setup.main(argv or ["install"])


def announce_port(server, data) -> None:
    """Keeps the port the server really listens on, with this process id, in engine.port while it runs (the desktop app
    asks for a free port), so the packaged app's `mcp` mode finds an engine that chose its own."""
    import threading
    import time

    def run() -> None:
        for _ in range(600):
            if server.started and server.servers:
                break
            time.sleep(0.1)
        else:
            return
        try:
            port = server.servers[0].sockets[0].getsockname()[1]
            (data / PORT_NAME).write_text(json.dumps({"pid": os.getpid(), "port": port}), encoding="utf-8")
        except (OSError, IndexError):
            return

    threading.Thread(target=run, name="formvis-port-file", daemon=True).start()


def main() -> int:
    if len(sys.argv) > 1 and sys.argv[1] == "mcp":
        return run_mcp(sys.argv[2:])
    if len(sys.argv) > 1 and sys.argv[1] == "agents":
        return run_agents(sys.argv[2:])
    if "--selfcheck" in sys.argv:
        return selfcheck()
    from app.core import runtime

    runtime.apply_switches(sys.argv[1:])
    try:
        return serve()
    except Exception:
        logging.getLogger("formvis").exception("the engine stopped on an error")
        raise


def serve() -> int:
    from app.core import config, runtime, startup

    try:
        data = config.data_dir()
        logs = runtime.start_logging(data).parent
    except OSError as err:
        print(f"formvis cannot use its data folder: {err}", file=sys.stderr)
        return 5
    startup.keep_errors(logs)
    log = logging.getLogger("formvis")
    if startup.alone():
        beside = startup.app_beside(Path(sys.executable))
        if beside is not None and startup.open_app(beside):
            log.info("started without its app, so it opened %s and stopped", beside)
            return 0
        log.error("started without its app, and no app program was found near %s", sys.executable)
        print("formvis-engine is a part of FormVis and serves nothing on its own. Open FormVis instead.", file=sys.stderr)
        return 4
    try:
        runtime.claim(data)
    except runtime.AlreadyRunning as err:
        log.error("%s", err)
        print(err, file=sys.stderr)
        return 2
    watch_parent(data)
    sweep_stale_unpacks()
    bundled = os.path.join(resource_dir(), "frontend_dist")
    if os.path.isdir(bundled):
        os.environ.setdefault("FORMVIS_DIST", bundled)
    os.environ.setdefault("FORMVIS_DESKTOP", "1")
    import uvicorn

    from app.main import app as fastapi_app
    from app.core import window_key

    if window_key.stdout_mode():
        print(window_key.LINE + window_key.KEY, flush=True)
    port = int(os.environ.get("FORMVIS_PORT", "0") or 0)
    server = uvicorn.Server(uvicorn.Config(fastapi_app, host="127.0.0.1", port=port, log_level="info"))
    announce_port(server, data)
    try:
        server.run()
    finally:
        runtime.release(data)
        try:
            if json.loads((data / PORT_NAME).read_text(encoding="utf-8")).get("pid") == os.getpid():
                (data / PORT_NAME).unlink()
        except (OSError, ValueError, AttributeError):
            pass
    return 0 if server.started else 3


if __name__ == "__main__":
    import multiprocessing
    multiprocessing.freeze_support()
    sys.exit(main())
