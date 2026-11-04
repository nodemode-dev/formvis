#!/usr/bin/env python3
"""The README's code sizes and blend-mode count, from the repository itself (plan item 19.4).

  python3 setup/line_counts.py            print the Stack sentence for README.md
  python3 setup/line_counts.py --check    exit 1 if README.md's figures have drifted from the code
  python3 setup/line_counts.py --commands [--check]   the command catalogue's size and any command or tool without metadata
                                          (--check: exit 1 while one exists or the size is under 620)

Counted: product code tracked by git, tests excluded: TypeScript and CSS under frontend/src, Python under backend/app
and backend/formvis_engine.py, Rust under src-tauri/src and native (the native renderer, from 1.44.0). Figures are rounded to hundreds; a figure passes the check within
3 percent or 100 lines of the count. The number of blend modes must be stated exactly once, as "N blend modes", and
equal the entries of BLEND_MODES in frontend/src/engine/types.ts. The check also fails on any product code that brings
back a feature declined for patents (DECLINED below).
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KINDS = (("TypeScript", ("frontend/src/",), ".ts"), ("CSS", ("frontend/src/",), ".css"),
         ("Python", ("backend/app/", "backend/formvis_engine.py"), ".py"), ("Rust", ("src-tauri/src/", "native/"), ".rs"))


def counts(root: Path = ROOT) -> dict[str, int]:
    files = subprocess.run(["git", "ls-files"], cwd=root, capture_output=True, text=True, check=True).stdout.split("\n")
    out = {}
    for name, prefixes, ext in KINDS:
        total = 0
        for f in files:
            if f.endswith(ext) and f.startswith(prefixes):
                with open(root / f, encoding="utf-8") as fh:
                    total += sum(1 for _ in fh)
        out[name] = total
    return out


def rounded(n: int) -> int:
    return max(100, round(n / 100) * 100)


def sentence(c: dict[str, int]) -> str:
    t, css, py, rs = (f"{rounded(c[k]):,}" for k in ("TypeScript", "CSS", "Python", "Rust"))
    return f"about {t} lines of TypeScript, {css} of CSS, {py} of Python and {rs} of Rust"


def blend_modes(root: Path = ROOT) -> int:
    src = (root / "frontend/src/engine/types.ts").read_text(encoding="utf-8")
    body = re.search(r"export const BLEND_MODES[^=]*=\s*\[(.*?)\];", src, re.S)
    return len(re.findall(r"\{\s*id:", body.group(1))) if body else 0


def check(root: Path = ROOT) -> list[str]:
    """What in README.md disagrees with the code; empty when it is accurate."""
    readme = (root / "README.md").read_text(encoding="utf-8")
    problems = []
    m = re.search(r"about ([\d,]+) lines of TypeScript, ([\d,]+) of CSS, ([\d,]+) of Python and ([\d,]+) of Rust", readme)
    if not m:
        problems.append("README.md has no line-count sentence")
    else:
        c = counts(root)
        for name, stated in zip(("TypeScript", "CSS", "Python", "Rust"), m.groups()):
            said, real = int(stated.replace(",", "")), c[name]
            if abs(said - real) > max(100, 0.03 * real):
                problems.append(f"{name}: README says {said:,}, the code has {real:,}")
    stated_modes = re.findall(r"(\d+) blend modes", readme)
    modes = blend_modes(root)
    if stated_modes != [str(modes)]:
        problems.append(f"blend modes: README states {stated_modes or 'none'}, the engine has {modes}, stated once")
    return problems + scrollbar_problems(root) + declined_problems(root)


# Declined by the owner's IP review (1.87.5): Content-Aware Scale by seam carving and its skin-tone
# protection. These words in product code mean the feature is coming back; the translation tables keep
# their unused strings on purpose, and the frontend's Skin Smoothing (engine/neural.ts skinMask) is a separate feature.
DECLINED = re.compile(r"content-aware-scale|contentAwareScale|ContentAwareScale|Content-Aware Scale|/api/seam|/seam/|"
                      r"seam[ _-]?carv|carve_width|carveWidth|Protect skin tones", re.I)


def declined_problems(root: Path = ROOT) -> list[str]:
    """Product code that names a feature declined for patents (see DECLINED); the README check fails on any."""
    problems = []
    files = subprocess.run(["git", "ls-files", "frontend/src", "frontend/public", "frontend/index.html", "backend/app", "src-tauri/src", "native"], cwd=root,
                           capture_output=True, text=True, check=True).stdout.split("\n")
    for rel in files:
        if not rel.endswith((".ts", ".py", ".rs", ".css", ".html", ".svg")) or "/i18n/" in rel or rel.endswith(".test.ts"):
            continue
        for n, line in enumerate((root / rel).read_text(encoding="utf-8", errors="replace").splitlines(), 1):
            if DECLINED.search(line):
                problems.append(f"{rel}:{n}: declined for patents (Content-Aware Scale, seam carving, skin-tone protection)")
            if PROVIDERS_DECLINED.search(line):
                problems.append(f"{rel}:{n}: declined provider (one cloud provider by design: fal)")
            if SPARKLE_BANNED.search(line):
                problems.append(f"{rel}:{n}: the three-star sparkle icon is banned app-wide (the owner's rule)")
    return problems


SPARKLE_BANNED = re.compile("\\bsparkle\\s*:\\s*[`'\"]?\\s*<svg|icon\\(\\s*['\"]sparkle['\"]|M12 1\\.5l1\\.5 4\\.5 4\\.5 1\\.5|"
                            "M7\\.5 5\\.6L10 7 8\\.6 4\\.5|[\\u2726\\u2727\\u2728\\u2734\\u2747]")


# Declined by the owner (1.88.3): one cloud provider by design, fal. Image or model providers other than fal are not
# added. The language-model chat keeps its chat completions services on this computer or hosted, which this
# pattern does not name.
PROVIDERS_DECLINED = re.compile(r"replicate\.com|api\.replicate|wavespeed|cloud\.comfy\.org|comfy[ _-]?(cloud|router|partner)|"
                                r"toapis|byteplus|modelark|oxen\.ai|magnific|freepik", re.I)


def scrollbar_problems(root: Path = ROOT) -> list[str]:
    """Any style that could draw a scrollbar (DEV_PLAN 28.7, the owner's zero-scrollbar rule): a scrollbar-width other
    than none, a scrollbar-color, or a ::-webkit-scrollbar rule that gives the bar a size or shows it; and the shared
    sheet must be linked from index.html."""
    problems = []
    files = subprocess.run(["git", "ls-files", "frontend"], cwd=root, capture_output=True, text=True, check=True).stdout.split("\n")
    for rel in files:
        if not rel.endswith((".css", ".html", ".ts")) or rel.endswith(".test.ts"):
            continue
        text = re.sub(r"/\*.*?\*/", "", (root / rel).read_text(encoding="utf-8", errors="replace"), flags=re.S)
        for m in re.finditer(r"scrollbar-width\s*:\s*([^;}\"'`]+)", text):
            if not m.group(1).strip().startswith("none"):
                problems.append(f"{rel}: scrollbar-width {m.group(1).strip()}")
        if re.search(r"scrollbar-color\s*:", text):
            problems.append(f"{rel}: scrollbar-color sets a visible bar")
        for m in re.finditer(r"::-webkit-scrollbar[\w-]*[^{]*\{([^}]*)\}", text):
            body = m.group(1)
            if re.search(r"(?<![\w-])(width|height)\s*:\s*(?!0\b|0px)\S", body) or re.search(r"display\s*:\s*(?!none)\w", body):
                problems.append(f"{rel}: a ::-webkit-scrollbar rule shows or sizes the bar")
    if "/src/styles/scrollbars.css" not in (root / "frontend" / "index.html").read_text(encoding="utf-8"):
        problems.append("frontend/index.html does not link styles/scrollbars.css")
    return problems


MIN_COMMANDS = 620


def catalogue_file() -> Path:
    raw = os.environ.get("FORMVIS_DATA_DIR")
    return (Path(raw).expanduser() if raw else Path.home() / "Formvis") / "commands-catalogue.json"


def commands_main(strict: bool) -> int:
    """The command catalogue's size (DEV_PLAN 28.3) and what lacks metadata. The window builds the catalogue from its live
    registry (generated commands, every tool and tool option included) and the engine keeps the last copy it was sent in
    the data folder; that file is the count, since the ids are not all written out in source. Open formvis once (./formvis
    boot) after changing commands, then run this."""
    path = catalogue_file()
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        print(f"No catalogue at {path}: start formvis (./formvis boot), open its window, wait a few seconds, then run this again.")
        return 1 if strict else 0
    size, missing = len(data.get("commands", [])), data.get("missing", [])
    kinds: dict[str, int] = {}
    for c in data.get("commands", []):
        kinds[c.get("kind", "command")] = kinds.get(c.get("kind", "command"), 0) + 1
    print(f"Command catalogue: {size} ids ({', '.join(f'{n} {k}' for k, n in sorted(kinds.items()))}), mirrored from the window at {time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(data.get('at', 0)))}")
    for m in missing:
        print(f"no metadata: {m}")
    problems = len(missing) + (1 if size < MIN_COMMANDS else 0)
    if size < MIN_COMMANDS:
        print(f"The catalogue has {size} ids; at least {MIN_COMMANDS} are required.")
    return 1 if strict and problems else 0


if __name__ == "__main__":
    if "--commands" in sys.argv:
        sys.exit(commands_main("--check" in sys.argv))
    if "--check" in sys.argv:
        found = check()
        for p in found:
            print(p)
        print("README.md is accurate" if not found else f"{len(found)} problem(s)")
        sys.exit(1 if found else 0)
    print(sentence(counts()))
    print(f"{blend_modes()} blend modes")
