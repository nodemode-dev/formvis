"""./formvis verify-local (1.61.8, the register's M7): formvis's two local image models each make one picture on this
computer, timed, and the result is written to send back.

For each model, Krea 2 (Apple silicon, or Windows and Linux with an NVIDIA GPU) and FLUX.2 [klein] 4B (Apple silicon):
- its licence is shown (name, version, link, summary) and accepted only by the person running this, as in Studio >
  Local models; a model whose licence is declined is skipped and said so;
- a model already installed (in the app or by an earlier run) is used as it is; otherwise the build for this
  computer's memory is chosen (the 4-bit builds with --small), its download size stated, and it is fetched only on a
  yes;
- it makes one 1,024 by 1,024 picture from a fixed prompt and seed, and the time is measured.
The results go to bench-results/local-<date>-<machine>.md (to send back) and .json, with the pictures beside them.

Options: --model krea2|klein|both (default both), --small (the 4-bit builds: about 20 GB in all rather than 31), --yes
(answer yes to every question: the licences and the downloads), --stand-in (the whole run with no download and no
model, for checking the command on a machine that cannot hold the models).
"""
from __future__ import annotations

import argparse
import datetime
import json
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "setup"))
from bench import machine  # noqa: E402  (the same record of the computer as ./formvis bench)

OUT = ROOT / "bench-results"
PROMPT = "a lighthouse on a rocky coast at dusk, waves breaking, warm light in the windows, photograph"
SEED = 7


def say(text: str) -> None:
    print(f"[formvis] {text}", flush=True)


def ask(question: str, yes: bool) -> bool:
    if yes:
        say(f"{question} yes (--yes)")
        return True
    try:
        return input(f"[formvis] {question} [y/N] ").strip().lower() in ("y", "yes")
    except EOFError:
        return False


def progress(label: str):
    last = [-1]

    def report(fraction: float, *_):
        pct = int(max(0.0, min(1.0, float(fraction))) * 100)
        if pct >= last[0] + 5 or pct == 100:
            last[0] = pct
            print(f"\r[formvis] {label}: {pct}%", end="\n" if pct == 100 else "", flush=True)
    return report


class StandIn:
    """No download and no model: a quick grey picture in the model's place, so the command's flow is checked."""

    def __init__(self, name: str):
        self.name = name

    def install(self, *_args, **_kw) -> None:
        time.sleep(0.2)

    def generate(self, path: Path, width: int, height: int) -> dict:
        from PIL import Image

        time.sleep(1.0)
        Image.new("RGB", (width, height), (128, 128, 128)).save(path)
        return {"stand_in": True}


def models(small: bool, stand_in: bool) -> list[dict]:
    """What each model needs here: its licence, whether it runs on this computer, its build and download."""
    if stand_in:
        return [{"key": key, "name": name, "here": True, "licence": None, "build": "stand-in", "bytes": 0, "installed": True, "runner": StandIn(name)}
                for key, name in (("krea2", "Krea 2"), ("klein", "FLUX.2 [klein] 4B"))]
    from app.localgen import klein, krea2

    out = []
    k_build = krea2.installed_build() or (("mlx-q4" if krea2.machine() == "macos-arm64" else None) if small else krea2.recommended())
    out.append({
        "key": "krea2", "name": "Krea 2", "here": bool(krea2.builds_here()), "module": krea2,
        "licence": {"name": f"{krea2.LICENCE_NAME} ({krea2.LICENCE_VERSION})", "url": krea2.LICENCE_URL, "summary": list(krea2.LICENCE_SUMMARY), "policy": krea2.USE_POLICY_URL},
        "accepted": bool(krea2.consent().get("licence")), "installed": bool(krea2.installed_build()),
        "build": k_build, "bytes": krea2.BUILDS[k_build]["size"] if k_build in krea2.BUILDS else 0,
    })
    v = "flux2-klein-4b"
    spec = klein.VARIANTS[v]
    l_build = klein.installed_build(v) or ("mlx-q4" if small or krea2.memory_gb() < 16 else "mlx-q8")
    out.append({
        "key": "klein", "name": spec["label"], "here": krea2.machine() == "macos-arm64", "module": klein, "variant": v,
        "licence": {"name": spec["licence"]["name"], "url": spec["licence"]["url"], "summary": list(spec["licence"]["summary"]), "policy": None},
        "accepted": bool(klein.consent().get(v, {}).get("licence")), "installed": bool(klein.installed_build(v)),
        "build": l_build, "bytes": spec["builds"][l_build]["bytes"],
    })
    return out


def run_one(m: dict, yes: bool, stand_in: bool) -> dict:
    row = {"model": m["name"], "build": m["build"], "download_gb": round(m["bytes"] / 1e9, 1)}
    if not m["here"]:
        return {**row, "result": "not for this computer (Krea 2 needs Apple silicon or an NVIDIA GPU; FLUX.2 [klein] 4B, Apple silicon)"}
    if not stand_in and not m["accepted"]:
        lic = m["licence"]
        say(f"{m['name']} is under the {lic['name']}: {lic['url']}")
        for line in lic["summary"]:
            say(f"  - {line}")
        if lic["policy"]:
            say(f"  its use policy: {lic['policy']}")
        if not ask(f"Accept the {lic['name']} for {m['name']}?", yes):
            return {**row, "result": "skipped: its licence was not accepted"}
        if m["key"] == "krea2":
            m["module"].record_consent(True)
        else:
            m["module"].record_consent(m["variant"], True)
    if not m["installed"]:
        if not m["build"]:
            return {**row, "result": "no build for this computer"}
        if not ask(f"Download {m['name']} ({m['build']}, about {m['bytes'] / 1e9:.1f} GB)?", yes):
            return {**row, "result": "skipped: the download was declined"}
        t = time.time()
        if stand_in:
            m["runner"].install()
        elif m["key"] == "krea2":
            m["module"].install(m["build"], progress(f"downloading {m['name']}"), lambda: False)
        else:
            m["module"].install(m["variant"], m["build"], progress(f"downloading {m['name']}"), lambda: False)
        row["download_minutes"] = round((time.time() - t) / 60, 1)
    OUT.mkdir(exist_ok=True)
    picture = OUT / f"local-{m['key']}.png"
    say(f"{m['name']}: one 1,024 by 1,024 picture (the first run loads the model, so it takes longest)")
    t = time.time()
    try:
        if stand_in:
            m["runner"].generate(picture, 1024, 1024)
        elif m["key"] == "krea2":
            m["module"].generate_to_file(PROMPT, picture, 1024, 1024, SEED)
        else:
            m["module"].generate_to_file(m["variant"], PROMPT, picture, 1024, 1024, SEED)
    except Exception as err:  # the model's own message, whatever it is
        return {**row, "result": f"failed: {str(err)[-400:]}"}
    seconds = round(time.time() - t, 1)
    return {**row, "result": "made one picture", "seconds": seconds, "picture": picture.name}


def main() -> int:
    ap = argparse.ArgumentParser(prog="./formvis verify-local", description="formvis's local image models, each run once on this computer")
    ap.add_argument("--model", choices=["krea2", "klein", "both"], default="both")
    ap.add_argument("--small", action="store_true")
    ap.add_argument("--yes", action="store_true")
    ap.add_argument("--stand-in", action="store_true")
    args = ap.parse_args()

    m = machine()
    say(f"this computer: {m['model'] or m['arch']}, {m['cpu']}, {m['memory_gb']} GB, {m['os']}")
    wanted = [x for x in models(args.small, args.stand_in) if args.model in ("both", x["key"])]
    todo = [x for x in wanted if x["here"] and not x["installed"]]
    if todo and not args.stand_in:
        total = sum(x["bytes"] for x in todo) / 1e9
        say(f"to download: {', '.join(f'{x['name']} {x['bytes'] / 1e9:.1f} GB' for x in todo)} (about {total:.0f} GB in all; --small takes the 4-bit builds)")
    rows = [run_one(x, args.yes, args.stand_in) for x in wanted]

    stamp = datetime.datetime.now().strftime("%Y-%m-%d-%H%M")
    slug = re.sub(r"[^a-z0-9]+", "-", f"{m['cpu']} {m['model']}".lower()).strip("-")[:48] or "machine"
    OUT.mkdir(exist_ok=True)
    base = OUT / f"local-{stamp}-{slug}"
    version = (ROOT / "frontend" / "src" / "version.ts").read_text().split("'")[1]
    base.with_suffix(".json").write_text(json.dumps({"formvis": version, "when": stamp, "machine": m, "stand_in": args.stand_in, "prompt": PROMPT, "seed": SEED, "models": rows}, indent=2))
    table = "\n".join(f"| {r['model']} | {r['build'] or '-'} ({r['download_gb']} GB) | {r['result']} | {r.get('seconds', '-')} | {r.get('download_minutes', '-')} |" for r in rows)
    base.with_suffix(".md").write_text(f"""# formvis local generation, {stamp}{' (STAND-IN: no model ran)' if args.stand_in else ''}

| | |
|---|---|
| formvis | {version} |
| Computer | {m['model'] or m['arch']}, {m['cpu']}, {m['cores']} cores, {m['memory_gb']} GB |
| System | {m['os']} ({m['arch']}) |
| Prompt | {PROMPT} (seed {SEED}, 1,024 by 1,024) |

| Model | Build (download) | Result | Seconds for the picture | Minutes to download |
|---|---|---|---|---|
{table}
""")
    print()
    for r in rows:
        say(f"{r['model']}: {r['result']}{f' in {r['seconds']} s' if 'seconds' in r else ''}")
    say(f"written: {base.with_suffix('.md')} (and .json beside it; the pictures are in the same folder)")
    say("send that .md file back" + (" (this was a stand-in: no model ran)" if args.stand_in else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
