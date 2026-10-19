"""./formvis perf: a budgeted scenario suite for the document engine, timed in the running window.

Scenarios (each repeated --runs times, default 5): open a 24 MP document, a pooled Gaussian Blur over its layer, undo of
that blur, a flattened composite of 150 layers, the same composite in a 16 bit document, and a Cancel of the blur a
quarter of the way in. It records p50 and p95 per scenario, the peak JavaScript heap the page held while it ran, and the
engine process's resident memory (peak) from /api/metrics.

Budgets sit in BUDGETS (milliseconds at p95). A run fails (exit 1) when a scenario is over its budget, or when --baseline
FILE names a saved run and any p50 is more than --threshold percent (default 25) slower than it. --save FILE writes this
run as the next baseline. The window must be open at FORMVIS_BENCH_URL (default http://localhost:5190/); Playwright for
Python drives it. Nothing here edits a project.
"""
from __future__ import annotations

import argparse
import json
import os
import platform
import statistics
import sys
import time
import urllib.request
from pathlib import Path

URL = os.environ.get("FORMVIS_BENCH_URL", "http://localhost:5190/")
ENGINE = os.environ.get("FORMVIS_ENGINE_URL", "http://127.0.0.1:8190")
BUDGETS = {"open-24mp": 3000, "blur-24mp": 20000, "undo-blur": 4000, "composite-150-layers": 8000, "composite-150-layers-16bit": 20000, "cancel-blur": 4000}

SCENARIOS = """async (name) => {
  const e = window.formvis.engine;
  const grad = (ctx, w, h) => { const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#f00'); g.addColorStop(1, '#00f'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); };
  const settings = { radius: 12, angle: 0, distance: 10, amount: 10, gaussian: false, monochromatic: false, distortion: 0, usmAmount: 100, usmRadius: 1, threshold: 0 };
  const blur = () => e.bandedFilterPool('Gaussian Blur', { kind: 'gaussianBlur', settings, seed: 1 }, (s) => s, 40, 0);
  const big = (w, h) => { e.newDocument(w, h, 'perf', 'white'); const l = e.current.activeLayer; grad(l.raster.ctx, w, h); l.raster.touch(); return l; };
  const stack = (n) => { e.newDocument(1200, 900, 'perf', 'white'); const cv = new OffscreenCanvas(1200, 900), cx = cv.getContext('2d'); grad(cx, 1200, 900); const img = cx.getImageData(0, 0, 1200, 900); for (let i = 0; i < n; i++) { e.addLayer({ name: 'L' + i }); e.replaceLayerPixels(e.current.activeLayer.id, img, 'fill'); } };
  const t0 = performance.now();
  if (name === 'open-24mp') big(6000, 4000);
  else if (name === 'blur-24mp') { big(6000, 4000); const t = performance.now(); const ok = await blur(); return { ms: performance.now() - t, ok }; }
  else if (name === 'undo-blur') { big(6000, 4000); await blur(); const t = performance.now(); e.undo(); return { ms: performance.now() - t }; }
  else if (name === 'composite-150-layers') { stack(150); const t = performance.now(); e.flattened(); return { ms: performance.now() - t }; }
  else if (name === 'composite-150-layers-16bit') { stack(150); if (!e.setDepth(16)) return { skipped: true }; const t = performance.now(); e.flattened(); return { ms: performance.now() - t }; }
  else if (name === 'cancel-blur') { big(6000, 4000); const p = blur(); await new Promise((r) => setTimeout(r, 400)); const t = performance.now(); e.cancelJob(); await p; return { ms: performance.now() - t, jobs: e.jobs.length }; }
  return { ms: performance.now() - t0 };
}"""


def rss() -> int:
    try:
        with urllib.request.urlopen(ENGINE + "/api/metrics", timeout=3) as r:
            return int(json.load(r).get("rss", 0))
    except Exception:
        return 0


def pct(values: list[float], q: float) -> float:
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int(round(q * (len(ordered) - 1))))]


def main() -> int:
    ap = argparse.ArgumentParser(prog="formvis perf")
    ap.add_argument("--runs", type=int, default=5)
    ap.add_argument("--only", help="comma separated scenario names")
    ap.add_argument("--baseline", help="a saved run to compare with")
    ap.add_argument("--save", help="write this run to FILE as a baseline")
    ap.add_argument("--threshold", type=float, default=25.0, help="percent a p50 may exceed the baseline")
    a = ap.parse_args()
    from playwright.sync_api import sync_playwright
    names = [n for n in BUDGETS if not a.only or n in a.only.split(",")]
    out: dict = {"when": time.strftime("%Y-%m-%dT%H:%M:%S"), "machine": platform.platform(), "cpus": os.cpu_count(), "runs": a.runs, "scenarios": {}}
    failed: list[str] = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={"width": 1400, "height": 900})
        page.goto(URL)
        page.wait_for_function("() => window.formvis && window.formvis.engine", timeout=90000)
        page.wait_for_timeout(2000)
        for name in names:
            times: list[float] = []
            heap = 0
            peak_rss = rss()
            for _ in range(a.runs):
                r = page.evaluate(f"({SCENARIOS})({json.dumps(name)})")
                if r.get("skipped"):
                    break
                times.append(float(r["ms"]))
                heap = max(heap, page.evaluate("() => (performance.memory ? performance.memory.usedJSHeapSize : 0)"))
                peak_rss = max(peak_rss, rss())
            if not times:
                out["scenarios"][name] = {"skipped": True}
                continue
            row = {"p50": round(statistics.median(times), 1), "p95": round(pct(times, 0.95), 1), "min": round(min(times), 1), "heapMB": round(heap / 1048576), "engineRssMB": round(peak_rss / 1048576), "budget": BUDGETS[name]}
            out["scenarios"][name] = row
            if row["p95"] > BUDGETS[name]:
                failed.append(f"{name}: p95 {row['p95']} ms is over its {BUDGETS[name]} ms budget")
        browser.close()
    if a.baseline and Path(a.baseline).exists():
        base = json.loads(Path(a.baseline).read_text()).get("scenarios", {})
        for name, row in out["scenarios"].items():
            was = base.get(name, {}).get("p50")
            if was and row.get("p50") and row["p50"] > was * (1 + a.threshold / 100):
                failed.append(f"{name}: p50 {row['p50']} ms is more than {a.threshold:g}% over the baseline {was} ms")
    print(json.dumps(out, indent=1))
    if a.save:
        Path(a.save).write_text(json.dumps(out, indent=1))
    for line in failed:
        print("FAIL " + line, file=sys.stderr)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
