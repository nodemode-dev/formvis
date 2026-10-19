"""The engine process's memory as the operating system counts it (working set, peak, private bytes) and the computer's."""
import os
import sys
import time

from app.core import config, runtime


def _kb(line: str) -> int:
    return int(line.split()[1]) * 1024


def _linux() -> dict:
    out: dict = {}
    with open("/proc/self/status") as f:
        for line in f:
            if line.startswith("VmRSS:"):
                out["rss"] = _kb(line)
            elif line.startswith("VmHWM:"):
                out["peak"] = _kb(line)
            elif line.startswith("RssAnon:"):
                out["private"] = _kb(line)
            elif line.startswith("Threads:"):
                out["threads"] = int(line.split()[1])
    with open("/proc/meminfo") as f:
        for line in f:
            if line.startswith("MemAvailable:"):
                out["available"] = _kb(line)
    return out


def _windows() -> dict:
    import ctypes
    from ctypes import wintypes

    class Counters(ctypes.Structure):
        _fields_ = [("cb", wintypes.DWORD), ("PageFaultCount", wintypes.DWORD), ("PeakWorkingSetSize", ctypes.c_size_t),
                    ("WorkingSetSize", ctypes.c_size_t), ("QuotaPeakPagedPoolUsage", ctypes.c_size_t), ("QuotaPagedPoolUsage", ctypes.c_size_t),
                    ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t), ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
                    ("PagefileUsage", ctypes.c_size_t), ("PeakPagefileUsage", ctypes.c_size_t), ("PrivateUsage", ctypes.c_size_t)]

    class Status(ctypes.Structure):
        _fields_ = [("dwLength", wintypes.DWORD), ("dwMemoryLoad", wintypes.DWORD), ("ullTotalPhys", ctypes.c_ulonglong), ("ullAvailPhys", ctypes.c_ulonglong)] + [(f"f{i}", ctypes.c_ulonglong) for i in range(4)]

    c = Counters()
    c.cb = ctypes.sizeof(c)
    ctypes.windll.psapi.GetProcessMemoryInfo(ctypes.windll.kernel32.GetCurrentProcess(), ctypes.byref(c), c.cb)
    s = Status()
    s.dwLength = ctypes.sizeof(s)
    ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(s))
    return {"rss": int(c.WorkingSetSize), "peak": int(c.PeakWorkingSetSize), "private": int(c.PrivateUsage), "available": int(s.ullAvailPhys)}


def _posix_other() -> dict:
    import resource
    import subprocess
    peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    out: dict = {"peak": int(peak) if sys.platform == "darwin" else int(peak) * 1024}
    try:
        out["rss"] = int(subprocess.run(["ps", "-o", "rss=", "-p", str(os.getpid())], capture_output=True, text=True, timeout=2).stdout.strip()) * 1024
    except (OSError, ValueError, subprocess.SubprocessError):
        pass
    return out


_GPU_TTL = 2.0
_gpu_seen: tuple[float, list[dict]] = (0.0, [])


def _nvidia_smi() -> list[dict]:
    import shutil
    import subprocess
    exe = shutil.which("nvidia-smi")
    if not exe:
        return []
    try:
        out = subprocess.run([exe, "--query-gpu=name,memory.used,memory.total", "--format=csv,noheader,nounits"], capture_output=True, text=True, timeout=3, check=False).stdout
    except (OSError, subprocess.SubprocessError):
        return []
    cards: list[dict] = []
    for line in out.splitlines():
        parts = [p.strip() for p in line.rsplit(",", 2)]
        if len(parts) != 3:
            continue
        try:
            cards.append({"name": parts[0], "used": int(float(parts[1])) * 1048576, "total": int(float(parts[2])) * 1048576, "source": "nvidia-smi"})
        except ValueError:
            continue
    return cards


def _wddm_counters() -> list[dict]:
    """Windows without nvidia-smi: the dedicated video memory each adapter reports to the performance counters."""
    import shutil
    import subprocess
    exe = shutil.which("typeperf")
    if not exe:
        return []
    try:
        out = subprocess.run([exe, r"\GPU Adapter Memory(*)\Dedicated Usage", "-sc", "1"], capture_output=True, text=True, timeout=5, check=False).stdout
    except (OSError, subprocess.SubprocessError):
        return []
    rows = [r for r in out.splitlines() if r.startswith('"')]
    if len(rows) < 2:
        return []
    names = [c.strip('"') for c in rows[0].split('","')]
    values = [c.strip('"') for c in rows[1].split('","')]
    cards: list[dict] = []
    for name, value in list(zip(names, values))[1:]:
        try:
            cards.append({"name": name.split("(")[-1].split(")")[0], "used": int(float(value)), "total": None, "source": "wddm"})
        except ValueError:
            continue
    return cards


def graphics_memory() -> list[dict]:
    """Video memory in bytes per graphics card, [] when none can be read: nvidia-smi where it is installed, else the
    Windows performance counters. Read at most every two seconds."""
    global _gpu_seen
    now = time.monotonic()
    if now - _gpu_seen[0] < _GPU_TTL:
        return _gpu_seen[1]
    cards = _nvidia_smi() or (_wddm_counters() if sys.platform == "win32" else [])
    _gpu_seen = (now, cards)
    return cards


def process_memory() -> dict:
    """Bytes, with a key left out when this system does not say: rss (working set), peak, private, available (the
    computer's free memory), threads, gpu (video memory per card, empty without a readable card)."""
    try:
        got = _windows() if sys.platform == "win32" else _linux() if sys.platform.startswith("linux") else _posix_other()
    except (OSError, ValueError, AttributeError):
        got = {}
    got.update({"pid": os.getpid(), "total": config.total_memory(), "uptime": int(time.time() - runtime.STARTED), "gpu": graphics_memory()})
    return got
