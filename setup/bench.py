"""./formvis bench (1.61.5, the register's H4): formvis's performance benchmark on this computer's real graphics,
recorded with the machine it ran on, for sending back.

It starts formvis's window server if it is not running (and stops it after), opens the installed Google Chrome in a
visible window (a hidden browser draws on a software GPU, which would measure nothing real), runs the tests of Help >
Performance Benchmark on every display path this browser has (CPU, CPU region redraw, WebGL2, WebGPU) with more
frames than the dialog uses, asks the browser which graphics adapter it drew with, times the native renderer's brush
benchmark when Rust is installed, and writes bench-results/<date>-<machine>.md (to read and send) and .json.

Options: --frames N (default 60), --no-native (skip the native renderer), --window (a visible Chrome window, for when
the background run reports it drew with software graphics). By default nothing opens: Chrome runs in the background
with its GPU switched on (1.61.6), and the results say which adapter actually drew, and warn if it was software.
"""
from __future__ import annotations

import argparse
import datetime
import json
import os
import platform
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
URLS = [os.environ["FORMVIS_BENCH_URL"]] if os.environ.get("FORMVIS_BENCH_URL") else ["http://localhost:5190/", "http://127.0.0.1:5190/"]
OUT = ROOT / "bench-results"


def say(text: str) -> None:
    print(f"[formvis] {text}", flush=True)


def up() -> str | None:
    """The address formvis's window server answers on, or None (1.61.6). Vite listens on localhost, which on macOS is
    IPv6 (::1) only, so asking 127.0.0.1 alone missed a running server (the owner's first run on a Mac)."""
    for url in URLS:
        try:
            with urllib.request.urlopen(url, timeout=2) as r:
                if r.status == 200:
                    return url
        except OSError:
            continue
    return None


def run(cmd: list[str], **kw) -> str:
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=kw.pop("timeout", 10), **kw).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return ""


def machine() -> dict:
    system = platform.system()
    if system == "Darwin":
        os_name = f"macOS {platform.mac_ver()[0]}"
        cpu = run(["sysctl", "-n", "machdep.cpu.brand_string"])
        model = run(["sysctl", "-n", "hw.model"])
        memory = int(run(["sysctl", "-n", "hw.memsize"]) or 0)
    elif system == "Linux":
        os_name = platform.platform()
        info = Path("/proc/cpuinfo").read_text(errors="replace") if Path("/proc/cpuinfo").exists() else ""
        cpu = (re.search(r"model name\s*:\s*(.+)", info) or re.search(r"Hardware\s*:\s*(.+)", info) or [None, ""])[1].strip()
        model = ""
        mem = re.search(r"MemTotal:\s*(\d+)", Path("/proc/meminfo").read_text()) if Path("/proc/meminfo").exists() else None
        memory = int(mem[1]) * 1024 if mem else 0
    else:
        os_name, cpu, model, memory = platform.platform(), platform.processor(), "", 0
    return {"os": os_name, "arch": platform.machine(), "cpu": cpu or platform.processor() or platform.machine(), "model": model,
            "cores": os.cpu_count(), "memory_gb": round(memory / 1e9, 1) if memory else None}


def playwright_module():
    try:
        from playwright.sync_api import sync_playwright
        return sync_playwright
    except ImportError:
        say("installing Playwright (it drives the browser for the benchmark)")
        if subprocess.run([sys.executable, "-m", "pip", "install", "-q", "playwright"]).returncode != 0:
            sys.exit(f"[formvis] could not install Playwright: run '{sys.executable} -m pip install playwright'")
        from playwright.sync_api import sync_playwright
        return sync_playwright


# The GPU switched on for a browser running in the background (1.61.6): Metal through ANGLE on macOS, the blocklist
# ignored, WebGPU allowed. Whether it took is read back from the adapters, never assumed.
GPU_ARGS = ["--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-webgpu"] + (["--use-angle=metal"] if sys.platform == "darwin" else [])


def open_browser(p, window: bool):
    for kw, which in (({"channel": "chrome"}, "Google Chrome"), ({}, "Playwright's Chromium")):
        try:
            return p.chromium.launch(headless=not window, args=GPU_ARGS, **kw), which
        except Exception:
            continue
    sys.exit("[formvis] no browser to run in: install Google Chrome, or run "
             f"'{sys.executable} -m playwright install chromium'")


BENCH_JS = """async (frames) => {
  const B = await import('/src/gpu/bench.ts'), e = window.formvis.engine;
  const gl = document.createElement('canvas').getContext('webgl2'), ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
  const webgl = gl ? String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) : null;
  let webgpu = null;
  try {
    const a = navigator.gpu ? await navigator.gpu.requestAdapter() : null;
    if (a) { const i = a.info || (a.requestAdapterInfo ? await a.requestAdapterInfo() : {}); webgpu = [i.vendor, i.architecture, i.device, i.description].filter(Boolean).join(' ') || 'available'; }
  } catch { webgpu = null; }
  const res = await B.runBenchmark(e, frames, 10);
  return { res, text: B.benchText(res, webgpu || webgl || 'unknown'), webgl, webgpu, ua: navigator.userAgent };
}"""


def native_bench() -> str:
    if not shutil.which("cargo"):
        return "not run: Rust is not installed (https://rustup.rs adds it; then run ./formvis bench again)"
    say("the native renderer's brush benchmark (the first build takes a few minutes)")
    target = os.environ.get("CARGO_TARGET_DIR") or str(Path(tempfile.gettempdir()) / "formvis-render-target")
    out = subprocess.run(["cargo", "run", "--release", "--quiet", "--bin", "brush_bench"], cwd=ROOT / "native" / "formvis-render",
                         capture_output=True, text=True, timeout=1800, env={**os.environ, "CARGO_TARGET_DIR": target})
    return out.stdout.strip() if out.returncode == 0 else f"failed: {(out.stderr or out.stdout).strip()[-600:]}"


def main() -> int:
    ap = argparse.ArgumentParser(prog="./formvis bench", description="formvis's drawing paths timed on this computer's graphics")
    ap.add_argument("--frames", type=int, default=60)
    ap.add_argument("--no-native", action="store_true")
    ap.add_argument("--window", action="store_true")
    args = ap.parse_args()

    started, url = None, up()
    if not url:
        say("starting formvis's window server in the background (stopped again when the benchmark ends)")
        OUT.mkdir(exist_ok=True)
        log_path = OUT / "window-server.log"
        log = open(log_path, "w")
        try:
            started = subprocess.Popen(["npm", "run", "dev"], cwd=ROOT / "frontend", stdout=log, stderr=subprocess.STDOUT,
                                       start_new_session=True, shell=os.name == "nt")
        except OSError:
            sys.exit("[formvis] npm was not found, so the window server cannot start: install Node.js (./formvis doctor checks it)")
        for _ in range(120):
            url = up()
            if url or started.poll() is not None:
                break
            time.sleep(1)
        log.close()
        if not url:
            tail = log_path.read_text(errors="replace").strip().splitlines()[-15:] or ["(it printed nothing)"]
            sys.exit("[formvis] the window server did not answer on port 5190 within 2 minutes; its last lines:\n  " + "\n  ".join(tail))
    try:
        sync_playwright = playwright_module()
        with sync_playwright() as p:
            browser, which = open_browser(p, args.window)
            say(f"running in {which}, {'in a window' if args.window else 'in the background with its GPU on'}; this takes a few minutes")
            page = browser.new_page(viewport={"width": 1400, "height": 900})
            page.goto(url)
            page.wait_for_function("window.formvis && window.formvis.engine", timeout=120000)
            page.wait_for_timeout(1500)
            got = page.evaluate(BENCH_JS, args.frames)
            browser_version = browser.version
            browser.close()
    finally:
        if started:
            try:
                if hasattr(os, "killpg"):
                    os.killpg(started.pid, signal.SIGTERM)
                else:
                    started.terminate()
            except OSError:
                pass

    # Software graphics named by the browser itself (SwiftShader, llvmpipe, Microsoft Basic Render): never sent as a GPU's numbers.
    soft = [a for a in (got["webgl"], got["webgpu"]) if a and re.search(r"swiftshader|llvmpipe|software|basic render", a, re.I)]
    native = "not run (--no-native)" if args.no_native else native_bench()
    m = machine()
    stamp = datetime.datetime.now().strftime("%Y-%m-%d-%H%M")
    slug = re.sub(r"[^a-z0-9]+", "-", f"{m['cpu']} {m['model']}".lower()).strip("-")[:48] or "machine"
    OUT.mkdir(exist_ok=True)
    base = OUT / f"{stamp}-{slug}"
    record = {"formvis": (ROOT / "frontend" / "src" / "version.ts").read_text().split("'")[1], "when": stamp, "machine": m,
              "browser": f"{which} {browser_version}", "background": not args.window, "software": soft, "webgl": got["webgl"], "webgpu": got["webgpu"],
              "user_agent": got["ua"], "frames": args.frames, "rows": got["res"]["rows"], "notes": got["res"]["notes"], "native": native}
    base.with_suffix(".json").write_text(json.dumps(record, indent=2))
    rows = "\n".join(f"| {r['test']} | {r['path']} | {r['medianMs']} | {r['p90Ms']} | {r['frames']} |" for r in got["res"]["rows"])
    notes = "\n".join(f"- {n}" for n in got["res"]["notes"]) or "- none"
    base.with_suffix(".md").write_text(f"""# formvis benchmark, {stamp}

| | |
|---|---|
| formvis | {record['formvis']} |
| Computer | {m['model'] or m['arch']}, {m['cpu']}, {m['cores']} cores, {m['memory_gb']} GB |
| System | {m['os']} ({m['arch']}) |
| Browser | {record['browser']}, {'in a window' if args.window else 'in the background'}{', SOFTWARE graphics: these numbers do not show the GPU' if soft else ''} |
| WebGL2 draws on | {got['webgl'] or 'not available'} |
| WebGPU adapter | {got['webgpu'] or 'not available'} |

| Test | Path | Median ms | 90th percentile ms | Frames |
|---|---|---|---|---|
{rows}

Notes from the benchmark:

{notes}

Native renderer (brush benchmark):

```text
{native}
```
""")
    print()
    print(got["text"])
    print()
    say(f"native renderer: {native.splitlines()[-1] if native else 'nothing printed'}")
    say(f"written: {base.with_suffix('.md')} (and .json beside it)")
    if soft:
        say(f"the browser drew with software graphics ({soft[0]}), so these numbers do not show your GPU;")
        say("run ./formvis bench --window to measure with a visible Chrome window instead, then send that file")
    else:
        say("send that .md file back; it holds the numbers and the machine they were measured on")
    return 0


if __name__ == "__main__":
    sys.exit(main())
