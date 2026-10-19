#!/usr/bin/env python3
"""formvis from a terminal (DEV_PLAN 28.3): the command catalogue of the open window, through the engine.

  ./formvis cli list [text] [--group name]   the catalogue: id, label, when to use it
  ./formvis cli describe <id> [kind=name]    one command: what it does, its parameters (kind= picks a filter or adjustment)
  ./formvis cli run <id> key=value ... [--yes]   runs it in the open window as an undoable step
  ./formvis cli process <input|folder...> [--in DIR] [--recursive] [--action NAME] [--run id key=value ...] [--steps FILE.json] [--format png|jpg|webp|tiff]
                        [--quality N] [--out DIR] [--suffix TEXT] [--in-place] [--verbose] [--yes]   file in, file out: each picture is
                        opened, edited, exported and closed (batch is the same command)
  ./formvis cli droplet <action-name> [--format ...] [--out DIR] [--name FILE]   writes a script (and a .cmd twin) that runs the action over dropped files
  ./formvis cli info <file...> [--json]   size, colour mode, depth, resolution, profile and layers of a file; no window needed
  ./formvis cli convert <in> <out> | <in...> --to FORMAT [--out DIR] [--quality 0.1-1] [--dpi N] [--page N] [--options JSON] [--overwrite]
                        a picture file to another format through the engine; no window needed
  ./formvis cli jobs [list [--active]] | cancel <id> | cancel --all   the engine's background jobs
  ./formvis cli serve [--root DIR]   a JSON-lines session on stdin and stdout: {"id":1,"method":"command.run","params":{...}}
  ./formvis cli version   the version, build and the engine's address

Each subcommand takes --help. A command marked risky (undo cannot reverse it) is run only with --yes. The engine's address:
FORMVIS_URL, or http://127.0.0.1:8190. Editing commands need the window open (./formvis boot) and outside agents allowed
(Preferences > Plugins); info, convert and jobs need only the engine."""

HELP = {
    "list": "list [text] [--group name]\n  The command catalogue: id, label, when to use it. Needs the window to have been open once.",
    "describe": "describe <id> [kind=name]\n  One command: what it does, its parameters. kind= picks a filter or adjustment.",
    "run": "run <id> key=value ... [--yes]\n  Runs one command in the open window as an undoable step. A risky command needs --yes.",
    "process": "process <input|folder...> [--in DIR] [--recursive] [--action NAME] [--run id key=value ...] [--steps FILE.json] [--format png|jpg|webp|tiff]\n"
               "        [--quality N] [--out DIR] [--suffix TEXT] [--in-place] [--verbose] [--yes]\n  Each picture is opened in the window, edited, exported and closed. Folders give the pictures in them (--recursive goes deeper).\n"
               "  --steps takes a JSON list of {\"id\": ..., \"params\": {...}}. A result that would replace its source is refused unless --in-place.",
    "droplet": "droplet <action-name> [--format ...] [--out DIR] [--name FILE]\n  Writes a script (and a .cmd twin) that runs the action over files dropped on it.",
    "info": "info <file...> [--json]\n  Size, colour mode, depth, resolution, profile and layers of a picture or project (.fvd .fmv .ora .psd .psb). Needs only the engine.",
    "convert": "convert <in> <out>\n  convert <in...> --to FORMAT [--out DIR]\n  [--quality 0.1-1] [--dpi N] [--page N] [--options JSON] [--overwrite]\n"
               "  A picture file to another format through the engine (png jpg webp avif tif bmp qoi tga ico pdf ppm pgm pbm pnm dpx fits wbmp). One flat picture; needs only the engine.",
    "jobs": "jobs [list [--active]] | cancel <id> | cancel --all\n  The engine's background jobs (local generation, upscaling) and agent calls now running.",
    "serve": "serve [--root DIR]\n  A JSON-lines session: one request per line on stdin, one answer per line on stdout. Request {\"id\":1,\"method\":\"...\",\"params\":{}};\n"
             "  answer {\"id\":1,\"ok\":true,\"result\":...} or {\"id\":1,\"ok\":false,\"error\":\"...\"}. Methods: ping, version, commands.list, command.describe,\n"
             "  command.run, batch {commands, stopOnError}, doc.new, doc.open, doc.place, doc.save, doc.export, doc.inspect, doc.close, file.info, file.convert,\n"
             "  jobs.list, jobs.cancel, tool.call {name, arguments}, shutdown. With --root DIR, paths outside DIR are refused.",
    "version": "version\n  The version, the build (git commit when there is one), the Python in use and the engine's address and version.",
}
PICTURE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif", ".tif", ".tiff", ".heic", ".heif", ".bmp", ".qoi", ".tga", ".ico", ".pbm", ".pgm", ".ppm", ".pnm", ".pam",
                    ".dng", ".cr2", ".cr3", ".nef", ".arw", ".raf", ".orf", ".rw2", ".psd", ".psb", ".ora", ".fvd", ".fmv"}
CONVERT_TO = {"png": ".png", "jpg": ".jpg", "jpeg": ".jpg", "webp": ".webp", "avif": ".avif", "tif": ".tif", "tiff": ".tif", "bmp": ".bmp", "qoi": ".qoi", "tga": ".tga", "ico": ".ico",
              "pdf": ".pdf", "ppm": ".ppm", "pgm": ".pgm", "pbm": ".pbm", "pnm": ".pnm", "dpx": ".dpx", "fits": ".fits", "wbmp": ".wbmp"}

import base64
import json
import os
import shutil
import stat
import sys
import urllib.error
import urllib.parse
import urllib.request

URL = os.environ.get("FORMVIS_URL", "http://127.0.0.1:8190").rstrip("/")


def call(method: str, path: str, body: dict | None = None) -> tuple[int, dict]:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(URL + path, data=data, method=method, headers={"Content-Type": "application/json", "X-Formvis-Client": "formvis-cli"})
    try:
        with urllib.request.urlopen(req, timeout=660) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as exc:
        try:
            return exc.code, json.loads(exc.read().decode() or "{}")
        except ValueError:
            return exc.code, {}
    except (urllib.error.URLError, OSError):
        print(f"The formvis engine is not answering at {URL}. Start it with ./formvis boot, then retry.", file=sys.stderr)
        sys.exit(1)


def say_error(status: int, body: dict) -> None:
    print(body.get("detail") or body.get("error") or f"The engine answered {status}.", file=sys.stderr)
    sys.exit(1)


def value_of(text: str):
    try:
        return json.loads(text)
    except ValueError:
        return text


def pairs(args: list[str]) -> dict:
    out = {}
    for a in args:
        if "=" not in a:
            print(f"{a}: give parameters as key=value, for example radius=4.", file=sys.stderr)
            sys.exit(2)
        k, _, v = a.partition("=")
        out[k] = value_of(v)
    return out


def show_params(params: dict, indent: str = "  ") -> None:
    for name, spec in params.items():
        kind = spec.get("type", "")
        if spec.get("enum"):
            kind = "one of " + ", ".join(str(x) for x in spec["enum"][:12]) + (f" and {len(spec['enum']) - 12} more (listed below)" if len(spec["enum"]) > 12 else "")
        elif "min" in spec and "max" in spec:
            kind = f"{kind} {spec['min']} to {spec['max']}"
        flag = " (required)" if spec.get("required") else ""
        print(f"{indent}{name}: {kind}{flag}" + (f" . {spec['description']}" if spec.get("description") else ""))


def list_cmd(args: list[str]) -> int:
    group = ""
    if "--group" in args:
        i = args.index("--group")
        group = args[i + 1] if i + 1 < len(args) else ""
        args = args[:i] + args[i + 2:]
    text = " ".join(args)
    status, body = call("GET", "/api/commands?" + urllib.parse.urlencode({"text": text, "group": group}))
    if status != 200:
        say_error(status, body)
    rows = body.get("commands", [])
    if not rows:
        print(body.get("hint") or "No command matches. Try a shorter word, or run list with no text.")
        return 1
    width = max(len(r["id"]) for r in rows)
    label = min(34, max(len(r["label"]) for r in rows))
    for r in rows:
        print(f"{r['id']:<{width}}  {r['label'][:label]:<{label}}  {r.get('when', '')}")
    print(f"\n{len(rows)} of {body.get('size', len(rows))} commands")
    return 0


def describe_cmd(args: list[str]) -> int:
    if not args:
        print("Give the command id, for example: ./formvis cli describe filter.apply", file=sys.stderr)
        return 2
    status, c = call("GET", "/api/commands/" + urllib.parse.quote(args[0], safe=":"))
    if status != 200:
        say_error(status, c)
    print(f"{c['id']}  ({c.get('kind', 'command')}, {c.get('group', '')})\n{c['label']}\n\n{c.get('description', '')}\n{c.get('when', '')}")
    print(f"\nchanges the document: {'yes' if c.get('mutates') else 'no'}\nundo cannot reverse it: {'yes, needs --yes to run' if c.get('risky') else 'no'}")
    if c.get("keys"):
        print("keys: " + ", ".join(c["keys"]))
    if c.get("params"):
        print("\nparameters:")
        show_params(c["params"])
    variants = c.get("variants") or {}
    want = pairs(args[1:]).get("kind")
    if want:
        if want not in variants:
            print(f"\n{want} is not a kind. The kinds are: {', '.join(variants)}.", file=sys.stderr)
            return 1
        print(f"\nparameters of {want}:")
        show_params(variants[want]) if variants[want] else print("  none")
    elif variants:
        print("\nkinds: " + ", ".join(variants) + f"\nSee one with: ./formvis cli describe {c['id']} kind={next(iter(variants))}")
    return 0


def run_cmd(args: list[str]) -> int:
    yes = "--yes" in args
    args = [a for a in args if a != "--yes"]
    if not args:
        print("Give the command id and its parameters, for example: ./formvis cli run filter.apply kind=gaussianBlur radius=4", file=sys.stderr)
        return 2
    cid, params = args[0], pairs(args[1:])
    quoted = urllib.parse.quote(cid, safe=":")
    status, c = call("GET", "/api/commands/" + quoted)
    if status == 200 and c.get("risky") and not yes:
        print(f"{cid} cannot be undone ({c.get('description', '')}). Run it again with --yes to go ahead.", file=sys.stderr)
        return 1
    status, out = call("POST", "/api/commands/" + quoted, {"params": params})
    if status != 200:
        say_error(status, out)
    if not out.get("ok"):
        print(out.get("error", "The command did not run."), file=sys.stderr)
        return 1
    result = out.get("result")
    if isinstance(result, dict):
        print(result.get("message") or json.dumps(result))
        rest = {k: v for k, v in result.items() if k != "message"}
        if rest:
            print(json.dumps(rest))
    elif result is not None:
        print(result)
    return 0


def command_result(cid: str, params: dict, yes: bool) -> dict:
    """Runs one catalogue command and returns what it handed back; raises RuntimeError with the reason on failure."""
    quoted = urllib.parse.quote(cid, safe=":")
    status, c = call("GET", "/api/commands/" + quoted)
    if status == 200 and c.get("risky") and not yes:
        raise RuntimeError(f"{cid} cannot be undone. Run again with --yes to go ahead.")
    status, out = call("POST", "/api/commands/" + quoted, {"params": params})
    if status != 200:
        raise RuntimeError(out.get("detail") or out.get("error") or f"The engine answered {status}.")
    if not out.get("ok"):
        raise RuntimeError(out.get("error", f"{cid} did not run."))
    result = out.get("result")
    STEP["said"] = (result.get("message") if isinstance(result, dict) else result) or ""
    returned = result.get("returned") if isinstance(result, dict) else None
    return returned if isinstance(returned, dict) else {}


STEP: dict = {"said": ""}


def tool(name: str, args: dict) -> tuple[bool, str, dict]:
    """Calls one MCP tool through the engine; (ok, the text it answered, its structured data)."""
    status, body = call("POST", "/mcp", {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": name, "arguments": args}})
    if body.get("error"):
        return False, str(body["error"].get("message", "The engine refused the call.")), {}
    result = body.get("result") or {}
    said = " ".join(c.get("text", "") for c in result.get("content", []) if c.get("type") == "text").strip()
    return not result.get("isError"), said, result.get("structuredContent") or {}


def split_flags(args: list[str], valued: tuple[str, ...], switches: tuple[str, ...] = ("--yes",)) -> tuple[list[str], dict, list[list[str]]]:
    """Separates positional words, --flag values, on-off switches and repeated --run groups (id then key=value words)."""
    rest, flags, runs = [], {}, []
    i = 0
    while i < len(args):
        a = args[i]
        if a in switches:
            flags[a[2:]] = True
        elif a == "--run" and "--run" in valued:
            i += 1
            group = []
            while i < len(args) and not args[i].startswith("--"):
                group.append(args[i])
                i += 1
            runs.append(group)
            continue
        elif a in valued:
            if i + 1 >= len(args):
                print(f"{a} needs a value.", file=sys.stderr)
                sys.exit(2)
            flags[a[2:]] = args[i + 1]
            i += 1
        elif a.startswith("--"):
            print(f"{a}: not an option here. Try ./formvis cli help.", file=sys.stderr)
            sys.exit(2)
        else:
            rest.append(a)
        i += 1
    return rest, flags, runs


def process_one(path: str, flags: dict, runs: list[list[str]]) -> str:
    fmt = flags.get("format", "png").lower().lstrip(".")
    fmt = {"jpeg": "jpg", "tif": "tiff"}.get(fmt, fmt)
    if fmt not in ("png", "jpg", "webp", "tiff"):
        raise RuntimeError("format must be png, jpg, webp or tiff.")
    yes = bool(flags.get("yes"))
    stem = os.path.splitext(os.path.basename(path))[0]
    name = f"{stem}{flags.get('suffix', '')}.{fmt}"
    out_dir = flags.get("out") or os.path.dirname(os.path.abspath(path))
    target = os.path.join(out_dir, name)
    if os.path.abspath(target) == os.path.abspath(path) and not flags.get("in-place"):
        raise RuntimeError(f"the result would replace {path}. Give --out DIR or --suffix TEXT, or --in-place if replacing it is meant.")
    steps = [(g[0], pairs(g[1:])) for g in runs]
    if flags.get("steps"):
        try:
            with open(flags["steps"], encoding="utf-8") as f:
                listed = json.load(f)
            steps += [(s["id"], s.get("params") or {}) for s in listed]
        except (OSError, ValueError, KeyError, TypeError) as exc:
            raise RuntimeError(f"--steps {flags['steps']} must be a JSON list of {{\"id\": ..., \"params\": {{...}}}}: {exc}") from exc
    with open(path, "rb") as f:
        data = base64.b64encode(f.read()).decode()
    command_result("open-image-data", {"name": os.path.basename(path), "data": data}, yes)
    try:
        for cid, params in steps:
            command_result(cid, params, yes)
            if flags.get("verbose"):
                print(f"  {cid}: {STEP['said'] or 'done'}")
        if flags.get("action"):
            command_result("play-action", {"name": flags["action"]}, yes)
        params = {"format": fmt, "name": name}
        if "quality" in flags:
            params["quality"] = value_of(flags["quality"])
        made = command_result("export-to-file", params, yes).get("path")
    finally:
        try:
            command_result("close-document", {}, True)
        except RuntimeError:
            pass
    if not made:
        raise RuntimeError("The window did not report where it saved the picture.")
    os.makedirs(out_dir, exist_ok=True)
    shutil.move(made, target)
    return target


def expand_inputs(words: list[str], recursive: bool) -> list[str]:
    """Files as given; a folder gives the pictures in it (and below it with --recursive), in name order."""
    out = []
    for w in words:
        if not os.path.isdir(w):
            out.append(w)
            continue
        found = []
        for base, dirs, names in os.walk(w):
            dirs.sort()
            found += [os.path.join(base, n) for n in sorted(names) if os.path.splitext(n)[1].lower() in PICTURE_SUFFIXES]
            if not recursive:
                break
        out += found
    return out


def process_cmd(args: list[str]) -> int:
    files, flags, runs = split_flags(args, ("--action", "--format", "--quality", "--out", "--suffix", "--in", "--steps", "--run"), ("--yes", "--in-place", "--verbose", "--recursive"))
    files = expand_inputs(files + ([flags["in"]] if flags.get("in") else []), bool(flags.get("recursive")))
    if not files:
        print("Give one or more picture files or a folder, for example: ./formvis cli process a.jpg b.jpg --action Sepia --format png --out done", file=sys.stderr)
        return 2
    failed = 0
    for path in files:
        try:
            print(f"{path} -> {process_one(path, flags, runs)}")
        except (RuntimeError, OSError) as exc:
            failed += 1
            print(f"{path}: failed. {exc}", file=sys.stderr)
    return 1 if failed else 0


def droplet_cmd(args: list[str]) -> int:
    words, flags, _ = split_flags(args, ("--format", "--out", "--name"))
    if not words:
        print("Give the action name, for example: ./formvis cli droplet Sepia --format jpg", file=sys.stderr)
        return 2
    action, fmt = " ".join(words), flags.get("format", "png")
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    quoted = "'" + action.replace("'", "'\\''") + "'"
    out_dir = flags.get("out") or os.getcwd()
    os.makedirs(out_dir, exist_ok=True)
    sh = os.path.join(out_dir, flags.get("name") or f"{action}-droplet.sh")
    with open(sh, "w") as f:
        f.write(f"#!/bin/sh\n# formvis droplet for the action {action}: drop pictures onto it, or run it with file names.\ncd '{root}' || exit 1\nexec ./formvis cli process \"$@\" --action {quoted} --format {fmt}\n")
    os.chmod(sh, 0o755 | stat.S_IMODE(os.stat(sh).st_mode))
    twin = os.path.splitext(sh)[0] + ".cmd"
    win_action = action.replace('"', "'")
    with open(twin, "w", newline="") as f:
        f.write(f"@echo off\r\ncd /d \"{root}\"\r\npython setup\\cli.py process %* --action \"{win_action}\" --format {fmt}\r\n")
    print(f"Wrote {sh} and {twin}. Drop pictures onto either, or run it with file names.")
    return 0


def describe_file(info: dict) -> str:
    bits = [f"{info['width']} x {info['height']} px"] if info.get("width") else []
    bits += [str(info[k]) for k in ("mode",) if info.get(k)]
    if info.get("depth"):
        bits.append(f"{info['depth']} bit")
    if info.get("layers") is not None:
        bits.append(f"{info['layers']} layer{'' if info['layers'] == 1 else 's'}")
    if info.get("pages", 1) > 1:
        bits.append(f"{info['pages']} pages")
    if info.get("dpi"):
        bits.append(f"{info['dpi'][0]:g} dpi")
    if info.get("profile"):
        bits.append("colour profile" if info["profile"] is True else f"profile {info['profile']}")
    return f"{info['name']}: " + ", ".join(bits + [f"{info['bytes']:,} bytes"])


def info_cmd(args: list[str]) -> int:
    files, flags, _ = split_flags(args, (), ("--json",))
    if not files:
        print("Give one or more files, for example: ./formvis cli info photo.jpg design.psd", file=sys.stderr)
        return 2
    failed = 0
    for path in files:
        ok, said, data = tool("file_info", {"path": os.path.abspath(os.path.expanduser(path))})
        if not ok:
            failed += 1
            print(f"{path}: {said}", file=sys.stderr)
        else:
            print(json.dumps(data) if flags.get("json") else describe_file(data))
    return 1 if failed else 0


def convert_cmd(args: list[str]) -> int:
    files, flags, _ = split_flags(args, ("--to", "--out", "--quality", "--dpi", "--page", "--options"), ("--overwrite",))
    extra: dict = {}
    for key in ("quality", "dpi", "page"):
        if key in flags:
            extra[key] = value_of(flags[key])
    if "options" in flags:
        extra["options"] = value_of(flags["options"])
        if not isinstance(extra["options"], dict):
            print("--options takes a JSON object, for example --options '{\"compression\":\"deflate\"}'.", file=sys.stderr)
            return 2
    if flags.get("overwrite"):
        extra["overwrite"] = True
    jobs = []
    if flags.get("to"):
        suffix = CONVERT_TO.get(flags["to"].lower().lstrip("."))
        if not suffix or not files:
            print("Give the files and --to one of: " + ", ".join(sorted(CONVERT_TO)) + ".", file=sys.stderr)
            return 2
        for src in expand_inputs(files, False):
            out_dir = os.path.abspath(os.path.expanduser(flags.get("out") or os.path.dirname(os.path.abspath(src))))
            os.makedirs(out_dir, exist_ok=True)
            jobs.append((src, os.path.join(out_dir, os.path.splitext(os.path.basename(src))[0] + suffix)))
    elif len(files) == 2:
        jobs.append((files[0], files[1]))
    else:
        print("Give the input and output files (./formvis cli convert in.png out.webp), or files with --to FORMAT.", file=sys.stderr)
        return 2
    failed = 0
    for src, dst in jobs:
        ok, said, _data = tool("convert_file", {"path": os.path.abspath(os.path.expanduser(src)), "output_path": os.path.abspath(os.path.expanduser(dst)), **extra})
        if ok:
            print(f"{src} -> {said.removeprefix('Wrote ')}")
        else:
            failed += 1
            print(f"{src}: failed. {said}", file=sys.stderr)
    return 1 if failed else 0


def jobs_cmd(args: list[str]) -> int:
    sub = args[0] if args and not args[0].startswith("--") else "list"
    rest = args[1:] if args and not args[0].startswith("--") else args
    if sub == "list":
        _words, flags, _ = split_flags(rest, (), ("--active",))
        ok, said, data = tool("jobs_list", {"status": "active" if flags.get("active") else "all"})
        if not ok:
            print(said, file=sys.stderr)
            return 1
        rows = data.get("jobs", [])
        for r in rows:
            pct = "" if r.get("progress") is None else f" {round(r['progress'] * 100)}%"
            print(f"{r['id']}  {r['source']:<5} {r['kind']}  {r['status']}{pct}  {r.get('message', '')}".rstrip())
        print(f"\n{len(rows)} job{'' if len(rows) == 1 else 's'}")
        return 0
    if sub == "cancel":
        words, flags, _ = split_flags(rest, (), ("--all",))
        if not words and not flags.get("all"):
            print("Give the job id (./formvis cli jobs cancel <id>) or --all.", file=sys.stderr)
            return 2
        ok, said, _data = tool("jobs_cancel", {"all": True} if flags.get("all") else {"id": words[0]})
        print(said, file=sys.stderr if not ok else sys.stdout)
        return 0 if ok else 1
    print(f"{sub}: jobs takes list or cancel.", file=sys.stderr)
    return 2


def version_cmd(_args: list[str]) -> int:
    import platform
    import re
    import subprocess
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    try:
        with open(os.path.join(root, "frontend", "src", "version.ts"), encoding="utf-8") as f:
            ours = (re.search(r"VERSION = '([^']+)'", f.read()) or [None, "unknown"])[1]
    except OSError:
        ours = "unknown"
    try:
        commit = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=root, capture_output=True, text=True, timeout=3).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        commit = ""
    print(f"formvis {ours}" + (f" ({commit})" if commit else ""))
    print(f"python {platform.python_version()} on {platform.system()} {platform.machine()}")
    try:
        with urllib.request.urlopen(URL + "/api/version", timeout=2) as r:
            print(f"engine {json.loads(r.read().decode()).get('version', 'unknown')} at {URL}")
    except (urllib.error.URLError, OSError, ValueError):
        print(f"engine not answering at {URL}")
    return 0


TOOL_METHODS = {"doc.new": "new_document", "doc.open": "open_file", "doc.place": "place_image", "doc.save": "save_project", "doc.export": "export_image", "doc.inspect": "get_document",
                "doc.close": "close_document", "file.info": "file_info", "file.convert": "convert_file", "jobs.list": "jobs_list", "jobs.cancel": "jobs_cancel"}
MAX_LINE = 16 * 1024 * 1024


def outside_root(root: str | None, params: dict) -> str | None:
    if not root:
        return None
    for key in ("path", "output_path"):
        value = params.get(key)
        if isinstance(value, str):
            real = os.path.realpath(os.path.expanduser(value))
            try:
                inside = os.path.commonpath([real, root]) == root
            except ValueError:
                inside = False
            if not inside:
                return f"{key} {value} is outside the session's root {root}."
    return None


def serve_request(method: str, params: dict, root: str | None):
    """One request of the JSON-lines session; the result, or RuntimeError with the reason."""
    if method == "ping":
        ok, said, data = tool("ping", {})
        return data or {"message": said}
    if method == "version":
        status, body = call("GET", "/api/version")
        return body
    if method == "commands.list":
        status, body = call("GET", "/api/commands?" + urllib.parse.urlencode({"text": params.get("text", ""), "group": params.get("group", "")}))
        return body
    if method == "command.describe":
        status, body = call("GET", "/api/commands/" + urllib.parse.quote(str(params.get("id", "")), safe=":"))
        if status != 200:
            raise RuntimeError(body.get("detail") or f"The engine answered {status}.")
        return body
    if method == "command.run":
        returned = command_result(str(params.get("id", "")), params.get("params") or {}, bool(params.get("yes")))
        return {"message": STEP["said"], "returned": returned}
    if method == "batch":
        steps = params.get("commands")
        if not isinstance(steps, list) or not steps:
            raise RuntimeError("batch takes commands: a list of {id, params}.")
        if params.get("stopOnError", True):
            ok, said, data = tool("run_commands", {"commands": steps})
            if not ok:
                raise RuntimeError(said)
            return {"ran": len(steps), "message": said, "undoSteps": 1}
        results = []
        for step in steps:
            try:
                returned = command_result(str(step.get("id", "")), step.get("params") or {}, bool(params.get("yes")))
                results.append({"id": step.get("id"), "ok": True, "message": STEP["said"], "returned": returned})
            except RuntimeError as exc:
                results.append({"id": step.get("id"), "ok": False, "error": str(exc)})
        return {"ran": len(results), "results": results}
    if method == "tool.call":
        name, args = params.get("name"), params.get("arguments") or {}
        if not isinstance(name, str) or not isinstance(args, dict):
            raise RuntimeError("tool.call takes name and arguments.")
        method, params = "", args
        tool_name = name
    elif method in TOOL_METHODS:
        tool_name = TOOL_METHODS[method]
    else:
        raise RuntimeError(f"No method {method}. Try ./formvis cli serve --help for the list.")
    refused = outside_root(root, params)
    if refused:
        raise RuntimeError(refused)
    ok, said, data = tool(tool_name, params)
    if not ok:
        raise RuntimeError(said)
    return {"message": said, **({"data": data} if data else {})}


def serve_cmd(args: list[str]) -> int:
    words, flags, _ = split_flags(args, ("--root",), ())
    if words:
        print("serve takes only --root DIR.", file=sys.stderr)
        return 2
    root = os.path.realpath(os.path.expanduser(flags["root"])) if flags.get("root") else None

    def reply(rid, **body) -> None:
        sys.stdout.write(json.dumps({"id": rid, **body}, ensure_ascii=False) + "\n")
        sys.stdout.flush()

    for line in sys.stdin:
        if not line.strip():
            continue
        if len(line) > MAX_LINE:
            reply(None, ok=False, error=f"A request line may be at most {MAX_LINE // 1048576} MB.")
            continue
        try:
            req = json.loads(line)
            if not isinstance(req, dict) or not isinstance(req.get("method"), str) or not isinstance(req.get("params") or {}, dict):
                raise ValueError
        except ValueError:
            reply(None, ok=False, error='Each line is one JSON object: {"id": 1, "method": "ping", "params": {}}.')
            continue
        if req["method"] == "shutdown":
            reply(req.get("id"), ok=True, result={"bye": True})
            return 0
        try:
            reply(req.get("id"), ok=True, result=serve_request(req["method"], req.get("params") or {}, root))
        except RuntimeError as exc:
            reply(req.get("id"), ok=False, error=str(exc))
        except SystemExit:
            reply(req.get("id"), ok=False, error=f"The formvis engine is not answering at {URL}.")
    return 0


COMMANDS = {"list": list_cmd, "describe": describe_cmd, "run": run_cmd, "process": process_cmd, "batch": process_cmd, "droplet": droplet_cmd, "info": info_cmd, "convert": convert_cmd,
            "jobs": jobs_cmd, "serve": serve_cmd, "version": version_cmd}


def main(argv: list[str]) -> int:
    if not argv or argv[0] in ("-h", "--help", "help"):
        print(__doc__)
        return 0
    sub, rest = argv[0], argv[1:]
    if sub in ("--version", "-V"):
        return version_cmd(rest)
    if sub not in COMMANDS:
        print(f"{sub}: the subcommands are {', '.join(c for c in COMMANDS if c != 'batch')}. Try ./formvis cli help.", file=sys.stderr)
        return 2
    if "--help" in rest or "-h" in rest:
        print("./formvis cli " + HELP["process" if sub == "batch" else sub])
        return 0
    return COMMANDS[sub](rest)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
