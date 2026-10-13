#!/usr/bin/env python3
"""./formvis agents (1.53.3): natural-language editing with Claude Code, Codex and Cursor.

  sync [--check]            generate the editing skill's tool reference from the engine's catalogue and mirror the
                            skill from .claude/skills to .agents/skills (Codex, Cursor); --check: exit 1 if drifted
  install [--user] [--dry-run] [claude|codex|cursor ...]
                            set the three up for this user account (all by default; --user says so): the MCP server
                            (./formvis mcp at this folder's absolute path; Claude Code's user scope when the claude
                            command is on the path) and the editing skill; files backed up before changing; running
                            it again changes nothing
"""

import json
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKILL = ROOT / ".claude" / "skills" / "formvis-editing"
MIRROR = ROOT / ".agents" / "skills" / "formvis-editing"
LAUNCH = str(ROOT / "formvis")


def tools_reference() -> str:
    sys.path.insert(0, str(ROOT / "backend"))
    from app.routers.mcp import TOOLS   # the catalogue itself, so this cannot drift from it
    out = ["# formvis tools", "", "Generated from the engine's catalogue by `./formvis agents sync`; do not edit by hand.", "", "## Contents", ""]
    groups = [("Look", {"get_document", "get_image", "get_selection", "get_layer_tree"}), ("Commands", {"list_commands", "describe_command", "run_command", "run_commands"}),("Files and documents", {"new_document", "open_file", "save_project", "export_image", "switch_document"}),
              ("Size and shape", {"resize_image", "resize_canvas", "crop", "flip_canvas", "upscale", "generative_expand"}),
              ("Layers", {"add_layer", "set_layer", "delete_layer", "transform_layer", "duplicate_layer", "move_layer", "merge_layers", "flatten_image", "rasterize_layer", "place_image"}),
              ("Text and shapes", {"add_text", "draw_shape"}), ("Selecting", {"select", "select_subject", "select_color_range"}),
              ("Painting and generating", {"fill", "generative_fill", "generate_image", "remove_background"}),
              ("Colour, filters and looks", {"add_adjustment", "set_adjustment", "apply_filter", "color_match", "add_film_layer"}), ("History", {"undo", "redo"})]
    listed = set()
    for title, names in groups:
        here = [t["name"] for t in TOOLS if t["name"] in names]
        listed.update(here)
        out.append(f"- {title}: " + ", ".join(f"`{n}`" for n in here))
    rest = [t["name"] for t in TOOLS if t["name"] not in listed]
    if rest:
        out.append("- Other: " + ", ".join(f"`{n}`" for n in rest))
    out.append("")
    for t in TOOLS:
        a = t["annotations"]
        marks = [m for m, on in (("read-only", a["readOnlyHint"]), ("replaces or removes", a["destructiveHint"]), ("may use fal", a["openWorldHint"])) if on]
        out += [f"## {t['name']}", "", t["description"], ""]
        props, required = t["inputSchema"]["properties"], set(t["inputSchema"]["required"])
        for k, v in props.items():
            kind = v.get("type", "any") + (f" ({' | '.join(map(str, v['enum']))})" if "enum" in v else "")
            extra = "; ".join(x for x in (("required" if k in required else ""), (f"default {json.dumps(v['default'])}" if "default" in v else ""), v.get("description", "")) if x)
            out.append(f"- `{k}`: {kind}" + (f"; {extra}" if extra else ""))
        if not props:
            out.append("- no parameters")
        if marks:
            out += ["", "Note: " + ", ".join(marks) + "."]
        out.append("")
    return "\n".join(out)


def _files(folder: Path) -> dict:
    return {str(p.relative_to(folder)): p.read_bytes() for p in sorted(folder.rglob("*")) if p.is_file()}


def sync(check: bool) -> int:
    ref = SKILL / "references" / "tools.md"
    want = tools_reference()
    drift = []
    if not ref.exists() or ref.read_text(encoding="utf-8") != want:
        drift.append(str(ref.relative_to(ROOT)))
        if not check:
            ref.parent.mkdir(parents=True, exist_ok=True)
            ref.write_text(want, encoding="utf-8")
    if not MIRROR.exists() or _files(MIRROR) != _files(SKILL):
        drift.append(str(MIRROR.relative_to(ROOT)))
        if not check:
            shutil.rmtree(MIRROR, ignore_errors=True)
            shutil.copytree(SKILL, MIRROR)
    if check:
        print("agents: in step" if not drift else "agents: drifted: " + ", ".join(drift) + " (run ./formvis agents sync)")
        return 1 if drift else 0
    print("agents: " + ("updated " + ", ".join(drift) if drift else "already in step"))
    return 0


def _backup(path: Path, dry: bool) -> None:
    if path.exists() and not dry:
        shutil.copy2(path, path.with_name(path.name + f".bak-{time.strftime('%Y%m%d-%H%M%S')}"))


def _copy_skill(to: Path, dry: bool, said: list) -> None:
    if to.exists() and _files(to) == _files(SKILL):
        said.append(f"  skill already at {to}")
        return
    said.append(f"  skill -> {to}")
    if not dry:
        shutil.rmtree(to, ignore_errors=True)
        to.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(SKILL, to)


def install_claude(home: Path, dry: bool, said: list) -> None:
    said.append("Claude Code:")
    claude = shutil.which("claude")
    if claude:
        have = subprocess.run([claude, "mcp", "get", "formvis"], capture_output=True, text=True)
        if have.returncode == 0 and LAUNCH in have.stdout:
            said.append("  MCP server formvis already set (user scope)")
        else:
            said.append(f"  claude mcp add --scope user formvis -- {LAUNCH} mcp")
            if not dry:
                if have.returncode == 0:
                    subprocess.run([claude, "mcp", "remove", "formvis", "--scope", "user"], capture_output=True)
                subprocess.run([claude, "mcp", "add", "--scope", "user", "formvis", "--", LAUNCH, "mcp"], check=True, capture_output=True)
    else:
        said.append(f"  the claude command is not installed here; once it is, run: claude mcp add --scope user formvis -- {LAUNCH} mcp")
    _copy_skill(home / ".claude" / "skills" / "formvis-editing", dry, said)


def install_codex(home: Path, dry: bool, said: list) -> None:
    said.append("Codex:")
    cfg = Path(os.environ.get("CODEX_HOME", home / ".codex")) / "config.toml"
    block = f'[mcp_servers.formvis]\ncommand = "{LAUNCH}"\nargs = ["mcp"]\nstartup_timeout_sec = 90\ntool_timeout_sec = 600\n'
    text = cfg.read_text(encoding="utf-8") if cfg.exists() else ""
    found = re.search(r"(?ms)^\[mcp_servers\.formvis\]\n.*?(?=^\[|\Z)", text)
    if found and found.group(0).strip() == block.strip():
        said.append(f"  MCP server formvis already in {cfg}")
    else:
        said.append(f"  MCP server formvis -> {cfg}")
        if not dry:
            _backup(cfg, dry)
            cfg.parent.mkdir(parents=True, exist_ok=True)
            new = text[:found.start()] + block + "\n" + text[found.end():] if found else (text.rstrip("\n") + "\n\n" if text.strip() else "") + block
            cfg.write_text(new, encoding="utf-8")
    _copy_skill(home / ".agents" / "skills" / "formvis-editing", dry, said)


def install_cursor(home: Path, dry: bool, said: list) -> None:
    said.append("Cursor:")
    cfg = home / ".cursor" / "mcp.json"
    data = json.loads(cfg.read_text(encoding="utf-8")) if cfg.exists() and cfg.read_text(encoding="utf-8").strip() else {}
    entry = {"command": LAUNCH, "args": ["mcp"]}
    if data.get("mcpServers", {}).get("formvis") == entry:
        said.append(f"  MCP server formvis already in {cfg}")
    else:
        said.append(f"  MCP server formvis -> {cfg}")
        if not dry:
            _backup(cfg, dry)
            data.setdefault("mcpServers", {})["formvis"] = entry
            cfg.parent.mkdir(parents=True, exist_ok=True)
            cfg.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    _copy_skill(home / ".agents" / "skills" / "formvis-editing", dry, said)   # Cursor reads ~/.agents/skills


def main(argv: list[str]) -> int:
    cmd = argv[0] if argv else "install"
    rest = argv[1:]
    if cmd == "sync":
        return sync("--check" in rest)
    if cmd == "install":
        dry = "--dry-run" in rest
        unknown = [a for a in rest if a.startswith("--") and a not in ("--user", "--dry-run")]
        if unknown:
            print(f"agents: unknown option {', '.join(unknown)} (--user or --dry-run)", file=sys.stderr)
            return 2
        which = [a for a in rest if not a.startswith("--")] or ["claude", "codex", "cursor"]
        bad = [w for w in which if w not in ("claude", "codex", "cursor")]
        if bad:
            print(f"agents: unknown client {', '.join(bad)} (claude, codex or cursor)", file=sys.stderr)
            return 2
        home, said = Path(os.environ.get("HOME", str(Path.home()))), []
        for w in which:
            {"claude": install_claude, "codex": install_codex, "cursor": install_cursor}[w](home, dry, said)
        print(("Would do (dry run):\n" if dry else "") + "\n".join(said))
        if not dry:
            print("\nRestart the clients. The first edit asks you once, in the formvis window, to allow outside agents.")
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
