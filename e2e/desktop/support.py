"""Runs the Linux desktop shell (the Tauri 2 app in src-tauri) for real: a debug binary, a private X server (Xvfb), the system's
WebKitGTK, and a throw-away home folder. The engine sidecar is replaced by engine_stub.py, which serves the built frontend and
answers the window's agent bridge; everything else goes to the engine already running on 8190.

The binary is built without bundling (the command is in conftest.py); a test that finds no binary, no Xvfb or no built frontend
is skipped with the reason."""
import ctypes
import http.client
import json
import os
import shutil
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

REPO = Path(os.environ.get("FORMVIS_REPO", Path(__file__).resolve().parents[2]))
STUB = Path(__file__).resolve().parent / "engine_stub.py"
ENGINE_PORT = int(os.environ.get("FORMVIS_E2E_ENGINE_PORT", "8190"))
BOOT_SECONDS = 120


def find_binary() -> Path | None:
    for candidate in (
        os.environ.get("FORMVIS_DESKTOP_BIN"),
        os.environ.get("CARGO_TARGET_DIR") and str(Path(os.environ["CARGO_TARGET_DIR"]) / "debug" / "formvis"),
        str(REPO / "src-tauri" / "target" / "debug" / "formvis"),
    ):
        if candidate and Path(candidate).is_file() and os.access(candidate, os.X_OK):
            return Path(candidate)
    return None


def find_dist() -> Path | None:
    for candidate in (os.environ.get("FORMVIS_DESKTOP_DIST"), str(REPO / "frontend" / "dist")):
        if candidate and (Path(candidate) / "index.html").is_file():
            return Path(candidate)
    return None


def engine_up() -> bool:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{ENGINE_PORT}/api/version", timeout=3) as r:
            return r.status == 200
    except (OSError, ValueError):
        return False


def skip_reason() -> str | None:
    if not sys.platform.startswith("linux"):
        return "the desktop shell tests run on Linux"
    if shutil.which("Xvfb") is None:
        return "Xvfb is not installed"
    if find_binary() is None:
        return "no debug desktop binary: build it with cargo build in src-tauri (see e2e/desktop/conftest.py) or set FORMVIS_DESKTOP_BIN"
    if find_dist() is None:
        return "no built frontend: run npx vite build in frontend (or set FORMVIS_DESKTOP_DIST)"
    if not engine_up():
        return f"no engine answering on 127.0.0.1:{ENGINE_PORT}"
    return None


class XServer:
    """One Xvfb on a free display, owned by the test run."""

    def __init__(self, size: str = "1600x1000x24"):
        read, write = os.pipe()
        self.proc = subprocess.Popen(
            ["Xvfb", "-displayfd", str(write), "-screen", "0", size, "-nolisten", "tcp"],
            pass_fds=(write,), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        os.close(write)
        with os.fdopen(read) as pipe:
            number = pipe.readline().strip()
        if not number:
            self.proc.kill()
            raise RuntimeError("Xvfb did not report a display")
        self.display = f":{number}"
        self.size = tuple(int(n) for n in size.split("x")[:2])

    def stop(self) -> None:
        if self.proc.poll() is None:
            self.proc.terminate()
            try:
                self.proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.proc.kill()

    def screenshot(self, path: Path) -> Path:
        convert = shutil.which("import")
        if convert is None:
            raise RuntimeError("ImageMagick import is not installed")
        subprocess.run([convert, "-display", self.display, "-window", "root", str(path)], check=True, timeout=30)
        return path


def descendants(pid: int) -> list[int]:
    """The processes started by pid, children first collected breadth-first, read from /proc."""
    parents: dict[int, int] = {}
    for entry in Path("/proc").iterdir():
        if entry.name.isdigit():
            try:
                parents[int(entry.name)] = int((entry / "stat").read_text().rsplit(")", 1)[1].split()[1])
            except (OSError, ValueError, IndexError):
                continue
    found, queue = [], [pid]
    while queue:
        current = queue.pop(0)
        for child, parent in parents.items():
            if parent == current and child not in found:
                found.append(child)
                queue.append(child)
    return found


def command_of(pid: int) -> str:
    try:
        return (Path("/proc") / str(pid) / "cmdline").read_bytes().replace(b"\0", b" ").decode(errors="replace")
    except OSError:
        return ""


class Desktop:
    """A running shell: launch it, call bridge tools in its window, read what it did, close it."""

    def __init__(self, xserver: XServer, workdir: Path):
        self.xserver = xserver
        self.workdir = workdir
        self.home = workdir / "home"
        self.proc: subprocess.Popen | None = None
        self.stub_url = ""
        self.log = workdir / "shell.log"

    @property
    def config_file(self) -> Path:
        return self.home / ".config" / "ai.nodemode.formvis" / "window.json"

    def start_bus(self) -> str:
        """A private session bus: the single-instance hand-over of a second launch goes through it."""
        read, write = os.pipe()
        self.bus = subprocess.Popen(["dbus-daemon", "--session", "--nofork", f"--print-address={write}"], pass_fds=(write,),
                                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
        os.close(write)
        with os.fdopen(read) as pipe:
            return pipe.readline().strip()

    def launch(self, *args: str, boot: bool = True, extra_env: dict | None = None, bus: bool = False) -> None:
        if bus and getattr(self, "bus", None) is None:
            extra_env = {**(extra_env or {}), "DBUS_SESSION_BUS_ADDRESS": self.start_bus()}
        run = self.workdir / "run"
        run.mkdir(parents=True, exist_ok=True)
        exe = run / "formvis"
        if not exe.exists():
            try:
                os.link(find_binary(), exe)
            except OSError:
                os.symlink(find_binary(), exe)
        sidecar = run / "formvis-engine"
        sidecar.write_text(f'#!/bin/sh\nexec "{sys.executable}" "{STUB}" "$FORMVIS_STUB_DIST" "$FORMVIS_STUB_UPSTREAM"\n')
        sidecar.chmod(0o755)
        address = self.workdir / "stub-address"
        address.unlink(missing_ok=True)
        self.home.mkdir(parents=True, exist_ok=True)
        env = {
            "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
            "DISPLAY": self.xserver.display,
            "HOME": str(self.home),
            "XDG_CONFIG_HOME": str(self.home / ".config"),
            "XDG_DATA_HOME": str(self.home / ".local" / "share"),
            "XDG_CACHE_HOME": str(self.home / ".cache"),
            "GDK_BACKEND": "x11",
            "NO_AT_BRIDGE": "1",
            "FORMVIS_STUB_DIST": str(find_dist()),
            "FORMVIS_STUB_UPSTREAM": str(ENGINE_PORT),
            "FORMVIS_STUB_ADDRESS_FILE": str(address),
            **(extra_env or {}),
        }
        self.exe, self.run_dir, self.env = exe, run, env
        logfile = open(self.log, "ab")
        self.proc = subprocess.Popen([str(exe), *args], cwd=run, env=env, stdout=logfile, stderr=logfile, start_new_session=True)
        logfile.close()
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline and not address.exists():
            if self.proc.poll() is not None:
                raise RuntimeError(f"the shell exited at start with {self.proc.returncode}: {self.log.read_text(errors='replace')[-600:]}")
            time.sleep(0.2)
        self.stub_url = address.read_text().strip() if address.exists() else ""
        if boot:
            self.wait_booted()

    def second_launch(self, *args: str, timeout: float = 40.0) -> subprocess.CompletedProcess:
        """Starts the same program again with the same home and display, as a double-clicked project would; waits for it to end."""
        return subprocess.run([str(self.exe), *args], cwd=self.run_dir, env=self.env, capture_output=True, timeout=timeout)

    def alive(self) -> bool:
        return self.proc is not None and self.proc.poll() is None

    def state(self) -> dict:
        with urllib.request.urlopen(f"{self.stub_url}/__stub/state", timeout=10) as r:
            return json.load(r)

    def catalogue(self) -> dict:
        with urllib.request.urlopen(f"{self.stub_url}/__stub/catalogue", timeout=30) as r:
            return json.load(r)

    def wait_booted(self, timeout: float = BOOT_SECONDS) -> dict:
        deadline = time.monotonic() + timeout
        last: dict = {}
        while time.monotonic() < deadline:
            if not self.alive():
                raise RuntimeError(f"the shell exited with {self.proc.returncode if self.proc else None}")
            try:
                last = self.state()
                if last["polls"] and last["catalogue"]:
                    return last
            except (OSError, ValueError, KeyError):
                pass
            time.sleep(0.5)
        raise TimeoutError(f"the window did not boot in {timeout} s: {last}")

    def wait_for(self, check, timeout: float = 30.0, every: float = 0.3, what: str = "the condition"):
        deadline = time.monotonic() + timeout
        value = None
        while time.monotonic() < deadline:
            value = check()
            if value:
                return value
            time.sleep(every)
        raise TimeoutError(f"{what} did not come true in {timeout} s (last: {value!r})")

    def call(self, name: str, arguments: dict | None = None, timeout: float = 60.0) -> dict:
        """One bridge tool run in the window; its MCP result (content, structuredContent, isError)."""
        body = json.dumps({"name": name, "arguments": arguments or {}, "timeout": timeout}).encode()
        request = urllib.request.Request(f"{self.stub_url}/__stub/call", data=body, headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(request, timeout=timeout + 15) as r:
                return json.load(r)
        except urllib.error.HTTPError as err:
            return json.loads(err.read() or b"{}")

    def ok(self, name: str, arguments: dict | None = None, timeout: float = 60.0) -> dict:
        out = self.call(name, arguments, timeout)
        assert not out.get("isError"), f"{name} {arguments} failed: {out}"
        return out.get("structuredContent") or {}

    def text_of(self, out: dict) -> str:
        return " ".join(c.get("text", "") for c in out.get("content", []))

    def pids(self) -> list[int]:
        return descendants(self.proc.pid) if self.alive() else []

    def web_process(self) -> int | None:
        for pid in self.pids():
            if "WebKitWebProcess" in command_of(pid):
                return pid
        return None

    def screenshot(self, name: str) -> Path:
        return self.xserver.screenshot(self.workdir / f"{name}.png")

    def toplevel(self) -> "XWindow | None":
        return XWindow.find(self.xserver.display, "formvis")

    def quit(self, timeout: float = 30.0) -> bool:
        """The window's own Quit (Window > Exit through the bridge): the page settles documents, the shell flushes and exits."""
        if not self.alive():
            return True
        mine = self.pids()
        try:
            self.call("ui_window", {"action": "quit", "confirm": True}, timeout=10)
        except (OSError, ValueError, http.client.HTTPException):
            pass
        try:
            self.proc.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            return False
        self._sweep(mine)
        return True

    def stop(self) -> None:
        if self.proc is None:
            return
        mine = self.pids()
        if self.alive():
            os.kill(self.proc.pid, signal.SIGTERM)
            try:
                self.proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                os.kill(self.proc.pid, signal.SIGKILL)
        self._sweep(mine)
        bus = getattr(self, "bus", None)
        if bus is not None and bus.poll() is None:
            bus.terminate()
            bus.wait(timeout=10)

    def _sweep(self, mine: list[int] | None = None) -> None:
        for pid in mine or []:
            try:
                os.kill(pid, signal.SIGTERM)
            except OSError:
                pass


class XWindow:
    """A top-level window on the private X server, read and moved through libX11, as a window manager's user would."""

    def __init__(self, lib, display, window: int):
        self.lib, self.display, self.window = lib, display, window

    @staticmethod
    def _load():
        lib = ctypes.CDLL("libX11.so.6")
        lib.XOpenDisplay.restype = ctypes.c_void_p
        lib.XOpenDisplay.argtypes = [ctypes.c_char_p]
        lib.XDefaultRootWindow.restype = ctypes.c_ulong
        lib.XDefaultRootWindow.argtypes = [ctypes.c_void_p]
        lib.XQueryTree.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.POINTER(ctypes.c_ulong), ctypes.POINTER(ctypes.c_ulong),
                                   ctypes.POINTER(ctypes.POINTER(ctypes.c_ulong)), ctypes.POINTER(ctypes.c_uint)]
        lib.XFetchName.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.POINTER(ctypes.c_char_p)]
        lib.XGetGeometry.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.POINTER(ctypes.c_ulong), ctypes.POINTER(ctypes.c_int),
                                     ctypes.POINTER(ctypes.c_int), ctypes.POINTER(ctypes.c_uint), ctypes.POINTER(ctypes.c_uint),
                                     ctypes.POINTER(ctypes.c_uint), ctypes.POINTER(ctypes.c_uint)]
        lib.XMoveResizeWindow.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_int, ctypes.c_int, ctypes.c_uint, ctypes.c_uint]
        lib.XFlush.argtypes = [ctypes.c_void_p]
        lib.XSync.argtypes = [ctypes.c_void_p, ctypes.c_int]
        lib.XCloseDisplay.argtypes = [ctypes.c_void_p]
        return lib

    @classmethod
    def find(cls, display_name: str, title: str) -> "XWindow | None":
        try:
            lib = cls._load()
        except OSError:
            return None
        display = lib.XOpenDisplay(display_name.encode())
        if not display:
            return None
        root = lib.XDefaultRootWindow(display)
        matches = []
        pending = [root]
        while pending:
            parent = pending.pop(0)
            root_back, parent_back = ctypes.c_ulong(), ctypes.c_ulong()
            children, count = ctypes.POINTER(ctypes.c_ulong)(), ctypes.c_uint()
            if not lib.XQueryTree(display, parent, ctypes.byref(root_back), ctypes.byref(parent_back), ctypes.byref(children), ctypes.byref(count)):
                continue
            for i in range(count.value):
                child = children[i]
                name = ctypes.c_char_p()
                if lib.XFetchName(display, child, ctypes.byref(name)) and name.value and name.value.decode(errors="replace").endswith(title):
                    matches.append(cls(lib, display, child))
                pending.append(child)
        if not matches:
            lib.XCloseDisplay(display)
            return None
        return max(matches, key=lambda w: w.geometry()[2] * w.geometry()[3])

    def geometry(self) -> tuple[int, int, int, int]:
        """x, y, width, height."""
        root = ctypes.c_ulong()
        x, y = ctypes.c_int(), ctypes.c_int()
        w, h, border, depth = ctypes.c_uint(), ctypes.c_uint(), ctypes.c_uint(), ctypes.c_uint()
        self.lib.XGetGeometry(self.display, self.window, ctypes.byref(root), ctypes.byref(x), ctypes.byref(y), ctypes.byref(w), ctypes.byref(h), ctypes.byref(border), ctypes.byref(depth))
        return x.value, y.value, w.value, h.value

    def move_resize(self, x: int, y: int, width: int, height: int) -> None:
        self.lib.XMoveResizeWindow(self.display, self.window, x, y, width, height)
        self.lib.XSync(self.display, 0)

    def click(self, x: int, y: int) -> None:
        """A real left click at screen position x, y, sent through the XTEST extension."""
        test = ctypes.CDLL("libXtst.so.6")
        test.XTestFakeMotionEvent.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_ulong]
        test.XTestFakeButtonEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_int, ctypes.c_ulong]
        test.XTestFakeMotionEvent(self.display, 0, x, y, 0)
        self.lib.XSync(self.display, 0)
        time.sleep(0.15)
        test.XTestFakeButtonEvent(self.display, 1, 1, 0)
        self.lib.XSync(self.display, 0)
        time.sleep(0.08)
        test.XTestFakeButtonEvent(self.display, 1, 0, 0)
        self.lib.XSync(self.display, 0)

    def focus(self) -> None:
        """Without a window manager the keys go to the window under the pointer: the pointer is put on the window's middle."""
        test = ctypes.CDLL("libXtst.so.6")
        test.XTestFakeMotionEvent.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_ulong]
        x, y, width, height = self.geometry()
        test.XTestFakeMotionEvent(self.display, 0, x + width // 2, y + height // 2, 0)
        self.lib.XSync(self.display, 0)
        time.sleep(0.5)

    def keys(self, *names: str) -> None:
        """Real key presses through XTEST to the focused window: keysym names such as a, minus, Return; a name joined with + is held while the last one is pressed (Control_L+a)."""
        test = ctypes.CDLL("libXtst.so.6")
        test.XTestFakeKeyEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_int, ctypes.c_ulong]
        self.lib.XStringToKeysym.restype = ctypes.c_ulong
        self.lib.XStringToKeysym.argtypes = [ctypes.c_char_p]
        self.lib.XKeysymToKeycode.restype = ctypes.c_ubyte
        self.lib.XKeysymToKeycode.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
        for name in names:
            codes = [self.lib.XKeysymToKeycode(self.display, self.lib.XStringToKeysym(part.encode())) for part in name.split("+")]
            assert all(codes), f"no key for {name}"
            for code in codes:
                test.XTestFakeKeyEvent(self.display, code, 1, 0)
            for code in reversed(codes):
                test.XTestFakeKeyEvent(self.display, code, 0, 0)
            self.lib.XSync(self.display, 0)
            time.sleep(0.06)

    def close(self) -> None:
        self.lib.XCloseDisplay(self.display)
