#!/usr/bin/env python3
"""./formvis agents (1.53.3): natural-language editing with Claude Code, Codex and Cursor.

  sync [--check]            generate the references that follow the code (the tool reference from the MCP catalogue,
                            the command reference and command map from the window's command catalogue, the tool map,
                            agents/manifest.json for the family spec),
                            mirror every skill under .claude/skills to .agents/skills (Codex, Cursor) and check the
                            skill files against the upload gates; --check: exit 1 if anything drifted or fails
  install [--user] [--dry-run] [claude|codex|cursor ...]
                            set the three up for this user account (all by default; --user says so): the MCP server
                            (./formvis mcp at this folder's absolute path; Claude Code's user scope when the claude
                            command is on the path) and every skill; files backed up before changing; running
                            it again changes nothing
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKILLS = ROOT / ".claude" / "skills"
MIRRORS = ROOT / ".agents" / "skills"
LAUNCH = str(ROOT / "formvis") if (ROOT / "formvis").is_file() else os.environ.get("FORMVIS_LAUNCHER") or os.environ.get("APPIMAGE") or str(ROOT / "formvis")   # a packaged app has no repository launcher: its own binary takes `mcp`
ARGS = ["mcp"]
if os.name == "nt" and (ROOT / "formvis").is_file():
    LAUNCH, ARGS = sys.executable, [str(ROOT / "setup" / "mcp_stdio.py")]
CATALOGUE = Path(os.environ.get("FORMVIS_DATA_DIR") or Path.home() / "Formvis").expanduser() / "commands-catalogue.json"
EMOJI = re.compile("[" + "-".join(chr(c) for c in (0x1F000, 0x1FAFF)) + chr(0x2600) + "-" + chr(0x27BF) + chr(0x2B00) + "-" + chr(0x2BFF) + chr(0xFE0F) + chr(0x200D) + "]")
GROUP_OWNER = {
    "File": "io-formats", "Edit": "command-author", "Image": "engine-builder", "Layer": "engine-builder", "Select": "engine-builder",
    "Filter": "filter-library", "View": "ui-builder", "Window": "ui-builder", "Type": "tool-builder", "Paths": "tool-builder",
    "Tools": "tool-builder", "Tool options": "tool-builder", "Paint": "brush-engine",
}


def skill_names() -> list[str]:
    return sorted(p.name for p in SKILLS.iterdir() if (p / "SKILL.md").is_file()) if SKILLS.is_dir() else []


def tools_reference() -> str:
    sys.path.insert(0, str(ROOT / "backend"))
    from app.routers.mcp import TOOLS   # the catalogue itself, so this cannot drift from it
    out = ["# formvis tools", "", "Generated from the engine's catalogue by `./formvis agents sync`; do not edit by hand.", "", "## Contents", ""]
    groups = [("Look", {"get_document", "get_image", "get_selection", "get_layer_tree"}), ("Commands", {"list_commands", "describe_command", "run_command", "run_commands"}),("Files and documents", {"new_document", "open_file", "save_project", "export_image", "switch_document"}),
              ("Size and shape", {"resize_image", "resize_canvas", "crop", "flip_canvas", "upscale", "generative_expand"}),
              ("Layers", {"add_layer", "set_layer", "delete_layer", "transform_layer", "duplicate_layer", "move_layer", "merge_layers", "flatten_image", "rasterize_layer", "place_image"}),
              ("Text and shapes", {"add_text", "draw_shape"}), ("Selecting", {"select", "select_subject", "select_by_text", "select_color_range"}),
              ("Painting and generating", {"fill", "generative_fill", "generate_image", "fal_models", "remove_background"}),
              ("Colour, filters and looks", {"add_adjustment", "set_adjustment", "apply_filter", "color_match", "add_film_layer"}), ("History", {"undo", "redo"}),
              ("Files without the window, and jobs", {"file_info", "convert_file", "improve_prompt", "jobs_list", "jobs_cancel"}),
              ("The window itself", {"ui_inspect", "ui_state", "ui_screenshot", "ui_menu_list", "ui_menu_invoke", "ui_set", "ui_dialog", "ui_pointer", "ui_key", "ui_window", "control_call", "file_roots"})]
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


def _cell(text: object) -> str:
    return " ".join(str(text or "").split()).replace("|", "/")


def _catalogue() -> list[dict] | None:
    try:
        rows = json.loads(CATALOGUE.read_text(encoding="utf-8")).get("commands", [])
    except (OSError, ValueError):
        return None
    rows = [c for c in rows if not str(c.get("id", "")).startswith(("plugin.", "recent-", "ext.", "panel-ext-")) and c.get("kind") != "plugin"]
    for c in rows:
        if c["id"] in ("undo", "redo", "hide-all-effects") or c["id"].startswith("toggle-"):
            c["label"] = c["id"].replace("-", " ").title()
    return sorted(rows, key=lambda c: (str(c.get("group", "")), c["id"])) or None


def _param(name: str, p: dict) -> str:
    kind = p.get("type", "any") + (f" ({' | '.join(map(str, p['enum']))})" if "enum" in p and len(p["enum"]) <= 12 else "")
    bounds = f" {p['min']} to {p['max']}" if "min" in p and "max" in p else ""
    return f"`{name}`: {kind}{bounds}{'; required' if p.get('required') else ''}; {_cell(p.get('description'))}"


def commands_reference(rows: list[dict]) -> str:
    groups: dict[str, list[dict]] = {}
    for c in rows:
        groups.setdefault(c.get("group") or "Other", []).append(c)
    out = ["# formvis commands", "",
           f"Generated from the window's command catalogue ({len(rows)} commands) by `./formvis agents sync`; do not edit by hand. The live list is `GET /api/commands` or the MCP tools `list_commands` and `describe_command`; run one with `run_command`, several as one undo step with `run_commands`.", "",
           "## Contents", ""]
    out += [f"- {g}: {len(v)}" for g, v in groups.items()]
    out.append("")
    for g, items in groups.items():
        out += [f"## {g}", "", "| Id | Name | Keys | Does |", "| --- | --- | --- | --- |"]
        for c in items:
            flags = (" (changes the picture)" if c.get("mutates") else "") + (" (asks first)" if c.get("risky") else "")
            out.append(f"| `{c['id']}` | {_cell(c.get('label'))} | {_cell(' '.join(c.get('keys') or []))} | {_cell(c.get('description'))}{flags} |")
        out.append("")
        for c in items:
            if c.get("params") and c.get("kind") == "action":
                out += [f"### {c['id']} parameters", ""] + [f"- {_param(k, v)}" for k, v in c["params"].items()] + [""]
    return "\n".join(out)


def command_map(rows: list[dict]) -> str:
    groups: dict[str, list[dict]] = {}
    for c in rows:
        groups.setdefault(c.get("group") or "Other", []).append(c)
    kinds = {}
    for c in rows:
        kinds[c.get("kind", "command")] = kinds.get(c.get("kind", "command"), 0) + 1
    out = ["# Command map", "",
           f"Generated from the window's command catalogue ({len(rows)} commands: " + ", ".join(f"{n} {k}" for k, n in sorted(kinds.items())) + ") by `./formvis agents sync`; do not edit by hand.", "",
           "Every command is registered in `frontend/src/app.ts` (hand-written), `frontend/src/automation/catalogue.ts` (`tool.select.*`, `tool.options.*` and the seven actions) or by a plug-in; its words are in `frontend/src/automation/command-meta.ts`. A command with no words is reported missing and `./formvis counts --commands --check` fails.", "",
           "| Group | Commands | Harness sub-skill | First ids |", "| --- | --- | --- | --- |"]
    for g, items in groups.items():
        out.append(f"| {g} | {len(items)} | `{GROUP_OWNER.get(g, 'command-author')}` | " + ", ".join(f"`{c['id']}`" for c in items[:4]) + " |")
    out += ["", "## Id families", ""]
    fam: dict[str, int] = {}
    for c in rows:
        head = c["id"].split(".")[0] if "." in c["id"] else c["id"].split("-")[0]
        fam[head] = fam.get(head, 0) + 1
    out.append(", ".join(f"`{k}` {n}" for k, n in sorted(fam.items(), key=lambda kv: (-kv[1], kv[0]))[:40]))
    out.append("")
    return "\n".join(out)


def tool_map() -> str:
    sys.path.insert(0, str(ROOT / "backend"))
    from app.routers.mcp import TOOLS
    sub = {p.parent.name: p.read_text(encoding="utf-8") for p in sorted((SKILLS / "formvis-driving" / "sub-skills").glob("*/SUB-SKILL.md"))}
    out = ["# Tool map", "",
           f"Generated from the MCP catalogue ({len(TOOLS)} tools, `TOOLS` in `backend/app/routers/mcp.py`) and the `formvis-driving` sub-skills by `./formvis agents sync`; do not edit by hand. A tool no sub-skill names reads `none` and needs a line in the sub-skill that covers its family.", "",
           "## Contents", "", "- Tools: each MCP tool, whether it reads or changes, and the driving sub-skills that name it", "", "## Tools", "",
           "| Tool | Reads or changes | Driving sub-skills that name it |", "| --- | --- | --- |"]
    for t in TOOLS:
        a = t["annotations"]
        kind = "reads only" if a["readOnlyHint"] else ("replaces or removes" if a["destructiveHint"] else "adds or changes")
        names = [n for n, text in sub.items() if f"`{t['name']}`" in text]
        out.append(f"| `{t['name']}` | {kind} | " + (", ".join(f"`{n}`" for n in names) or "none") + " |")
    out.append("")
    return "\n".join(out)


MANIFEST = ROOT / "agents" / "manifest.json"
APP = "formvis"   # the file name of formvis's entry in formcompiler apps/
DOCK = {"present": True, "positions": ["bottom", "right"], "tabs": ["chat", "shell", "claude", "codex", "cursor", "agent"]}   # frontend/src/dock/dock.ts with dock-adapter.ts tabs: the bottom band or the right column, Chat, a tab per engine PTY by kind (codex and cursor when found), Claude's read-only commands
DOCK_DIR = ROOT / "frontend" / "src" / "dock"
DOCK_MANIFEST = DOCK_DIR / "MANIFEST.json"
DOCK_VERSION = "1.0.0-stage1"


def _dock_files() -> dict[str, str]:
    return {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(DOCK_DIR.iterdir()) if p.is_file() and p.name != DOCK_MANIFEST.name}


def dock_manifest() -> str:
    return json.dumps({"module": "dock", "version": DOCK_VERSION, "files": _dock_files()}, indent=2) + "\n"


def dock_problems() -> list[str]:
    try:
        kept = json.loads(DOCK_MANIFEST.read_text(encoding="utf-8")).get("files", {})
    except (OSError, ValueError):
        return [f"{DOCK_MANIFEST.relative_to(ROOT)}: missing or not JSON"]
    now = _dock_files()
    rel = DOCK_DIR.relative_to(ROOT)
    return [f"{rel}/{name}: does not match MANIFEST.json (the shared dock module changes only as a whole new version)" for name in sorted(set(kept) | set(now)) if kept.get(name) != now.get(name)]


def manifest() -> str:
    """agents/manifest.json (formadaptor spec/agent-manifest.schema.json): what formvis offers agents, read from the MCP
    catalogue and its declarations, the skills folder and the extension host; only the app's name and the dock are declared here."""
    sys.path.insert(0, str(ROOT / "backend"))
    from app.routers import mcp
    from app.services import formext_host
    tools = [t["name"] for t in mcp.TOOLS]
    transports = [kind for kind, served in (("stdio", (ROOT / "setup" / "mcp_stdio.py").is_file()), ("http", any(getattr(r, "path", "") == "/mcp" for r in mcp.router.routes))) if served]
    skills = [{"name": n, "sub_skills": sorted(p.name for p in (SKILLS / n / "sub-skills").iterdir() if p.is_dir()) if (SKILLS / n / "sub-skills").is_dir() else []} for n in skill_names()]
    data = {"format": "form-agent-manifest", "version": 1, "app": APP,
            "mcp": {"tools": tools, "read_only": [n for n in tools if mcp.DECLARED[n]["read"]], "approval_gated": [n for n in tools if mcp.DECLARED[n]["asks"]], "transports": transports},
            "skills": skills, "dock": DOCK, "extensions": {"host_api": formext_host.API}}
    return json.dumps(data, indent=2) + "\n"


def generated() -> dict[Path, str]:
    want = {SKILLS / "formvis-editing" / "references" / "tools.md": tools_reference(), SKILLS / "formvis-harness" / "references" / "tool-map.md": tool_map(), MANIFEST: manifest(), DOCK_MANIFEST: dock_manifest()}
    rows = _catalogue()
    if rows:
        want[SKILLS / "formvis-driving" / "references" / "commands.md"] = commands_reference(rows)
        want[SKILLS / "formvis-harness" / "references" / "command-map.md"] = command_map(rows)
    return want


def skill_problems() -> list[str]:
    bad = []
    for p in sorted(SKILLS.rglob("*")):
        if not p.is_file() or p.suffix not in (".md", ".json"):
            continue
        rel, text = str(p.relative_to(ROOT)), p.read_text(encoding="utf-8")
        if chr(0x2014) in text:
            bad.append(f"{rel}: contains U+2014")
        if EMOJI.search(text):
            bad.append(f"{rel}: contains an emoji")
        if p.suffix == ".md" and re.search(r"</?[A-Za-z][A-Za-z0-9_.:-]*>", text):
            bad.append(f"{rel}: tag-shaped text in markdown (write [name], not angle brackets)")
        if p.name in ("SKILL.md", "SUB-SKILL.md"):
            head = re.match(r"---\n(.*?)\n---\n", text, re.S)
            fields = dict(re.findall(r"^(name|description): *(.*)$", head.group(1), re.M)) if head else {}
            if not fields.get("name") or not fields.get("description"):
                bad.append(f"{rel}: front matter needs a name and a description")
                continue
            if len(fields["name"]) > 64:
                bad.append(f"{rel}: name over 64 characters")
            if len(fields["description"]) > 1024:
                bad.append(f"{rel}: description over 1024 characters")
            if re.search(r"</?[A-Za-z][^>]*>", fields["name"] + fields["description"]):
                bad.append(f"{rel}: an XML tag in the front matter")
            if ": " in fields["description"] and fields["description"][:1] not in ("'", '"'):
                bad.append(f"{rel}: a colon and space in an unquoted description is not valid YAML")
    return bad


def routing_problems() -> list[str]:
    """A skill with a sub-skills folder routes to them in a table whose last cell names one in backticks: every name
    there must be a folder, and every folder must be named."""
    bad = []
    for name in skill_names():
        folder = SKILLS / name / "sub-skills"
        if not folder.is_dir():
            continue
        rows = re.findall(r"^\|.*\|\s*`([a-z0-9][a-z0-9-]*)`\s*\|\s*$", (SKILLS / name / "SKILL.md").read_text(encoding="utf-8"), re.M)
        have = {p.name for p in folder.iterdir() if p.is_dir()}
        for missing in sorted(set(rows) - have):
            bad.append(f".claude/skills/{name}/SKILL.md: the routing table names {missing}, which has no folder in sub-skills/")
        for unlisted in sorted(have - set(rows)):
            bad.append(f".claude/skills/{name}/sub-skills/{unlisted}: not in the routing table of SKILL.md")
    return bad


def tool_problems() -> list[str]:
    """Each MCP tool says in its own definition what it is (mcp.py DECLARED): a missing or impossible declaration is a
    problem, and so is a list in setup/mcp_stdio.py (which cannot import the engine) that says otherwise."""
    sys.path.insert(0, str(ROOT / "backend"))
    sys.path.insert(0, str(ROOT / "setup"))
    from app.routers import mcp
    import mcp_stdio
    bad = ["backend/app/routers/mcp.py: " + f for f in mcp.declaration_faults()]
    said = mcp.DECLARED
    writes = {n for n, d in said.items() if d["reach"] == "writes files" and "output_path" not in mcp.SCHEMAS[n]["properties"]}
    menus = {n for n, d in said.items() if "path" in mcp.SCHEMAS[n]["properties"] and d["reach"] not in ("reads files", "writes files")}
    for name, have, want in (("WRITES", mcp_stdio.WRITES, writes), ("MENUS", mcp_stdio.MENUS, menus)):
        if set(have) != want:
            bad.append(f"setup/mcp_stdio.py: {name} is {sorted(have)}, the tools' declarations say {sorted(want)}")
    for method, name in mcp_stdio.CONTROL.items():
        if mcp.CONTROL_METHODS.get(method) != name:
            bad.append(f"setup/mcp_stdio.py: CONTROL sends {method} to {name}, the engine to {mcp.CONTROL_METHODS.get(method)}")
    return bad


def _files(folder: Path) -> dict:
    return {str(p.relative_to(folder)): p.read_bytes() for p in sorted(folder.rglob("*")) if p.is_file()}


def sync(check: bool) -> int:
    drift = []
    for ref, want in generated().items():
        if not ref.exists() or ref.read_text(encoding="utf-8") != want:
            drift.append(str(ref.relative_to(ROOT)))
            if not check:
                ref.parent.mkdir(parents=True, exist_ok=True)
                ref.write_text(want, encoding="utf-8")
    names = skill_names()
    for name in names:
        mirror = MIRRORS / name
        if not mirror.exists() or _files(mirror) != _files(SKILLS / name):
            drift.append(str(mirror.relative_to(ROOT)))
            if not check:
                shutil.rmtree(mirror, ignore_errors=True)
                shutil.copytree(SKILLS / name, mirror)
    for stale in sorted(p for p in MIRRORS.glob("formvis-*") if p.name not in names):
        drift.append(str(stale.relative_to(ROOT)) + " (removed skill)")
        if not check:
            shutil.rmtree(stale, ignore_errors=True)
    problems = skill_problems() + routing_problems() + tool_problems() + (dock_problems() if check else [])
    if CATALOGUE.exists() is False:
        print("agents: no command catalogue in " + str(CATALOGUE.parent) + " (open the formvis window once); commands.md and command-map.md left as they are")
    if check:
        print("agents: in step" if not drift else "agents: drifted: " + ", ".join(drift) + " (run ./formvis agents sync)")
        for line in problems:
            print("agents: " + line)
        return 1 if drift or problems else 0
    print("agents: " + ("updated " + ", ".join(drift) if drift else "already in step"))
    for line in problems:
        print("agents: " + line)
    return 1 if problems else 0


def _backup(path: Path, dry: bool) -> None:
    if path.exists() and not dry:
        shutil.copy2(path, path.with_name(path.name + f".bak-{time.strftime('%Y%m%d-%H%M%S')}"))


def _copy_skill(root: Path, dry: bool, said: list) -> None:
    for name in skill_names():
        to = root / name
        if to.exists() and _files(to) == _files(SKILLS / name):
            said.append(f"  skill already at {to}")
            continue
        said.append(f"  skill -> {to}")
        if not dry:
            shutil.rmtree(to, ignore_errors=True)
            to.parent.mkdir(parents=True, exist_ok=True)
            shutil.copytree(SKILLS / name, to)


def install_claude(home: Path, dry: bool, said: list) -> None:
    said.append("Claude Code:")
    claude = shutil.which("claude")
    if claude:
        have = subprocess.run([claude, "mcp", "get", "formvis"], capture_output=True, text=True)
        if have.returncode == 0 and LAUNCH in have.stdout:
            said.append("  MCP server formvis already set (user scope)")
        else:
            said.append(f"  claude mcp add --scope user formvis -- {subprocess.list2cmdline([LAUNCH, *ARGS])}")
            if not dry:
                if have.returncode == 0:
                    subprocess.run([claude, "mcp", "remove", "formvis", "--scope", "user"], capture_output=True)
                subprocess.run([claude, "mcp", "add", "--scope", "user", "formvis", "--", LAUNCH, *ARGS], check=True, capture_output=True)
    else:
        said.append(f"  the claude command is not installed here; once it is, run: claude mcp add --scope user formvis -- {subprocess.list2cmdline([LAUNCH, *ARGS])}")
    _copy_skill(home / ".claude" / "skills", dry, said)


def install_codex(home: Path, dry: bool, said: list) -> None:
    said.append("Codex:")
    cfg = Path(os.environ.get("CODEX_HOME", home / ".codex")) / "config.toml"
    block = f'[mcp_servers.formvis]\ncommand = {json.dumps(LAUNCH, ensure_ascii=False)}\nargs = {json.dumps(ARGS, ensure_ascii=False)}\nstartup_timeout_sec = 90\ntool_timeout_sec = 600\n'
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
    _copy_skill(home / ".agents" / "skills", dry, said)


def install_cursor(home: Path, dry: bool, said: list) -> None:
    said.append("Cursor:")
    cfg = home / ".cursor" / "mcp.json"
    data = json.loads(cfg.read_text(encoding="utf-8")) if cfg.exists() and cfg.read_text(encoding="utf-8").strip() else {}
    entry = {"command": LAUNCH, "args": ARGS}
    if data.get("mcpServers", {}).get("formvis") == entry:
        said.append(f"  MCP server formvis already in {cfg}")
    else:
        said.append(f"  MCP server formvis -> {cfg}")
        if not dry:
            _backup(cfg, dry)
            data.setdefault("mcpServers", {})["formvis"] = entry
            cfg.parent.mkdir(parents=True, exist_ok=True)
            cfg.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    _copy_skill(home / ".agents" / "skills", dry, said)   # Cursor reads ~/.agents/skills


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
