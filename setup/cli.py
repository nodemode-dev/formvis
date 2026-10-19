#!/usr/bin/env python3
"""formvis from a terminal (DEV_PLAN 28.3): the command catalogue of the open window, through the engine.

  ./formvis cli list [text] [--group name]   the catalogue: id, label, when to use it
  ./formvis cli describe <id> [kind=name]    one command: what it does, its parameters (kind= picks a filter or adjustment)
  ./formvis cli run <id> key=value ... [--yes]   runs it in the open window as an undoable step
  ./formvis cli process <input|folder...> [--in DIR] [--recursive] [--action NAME] [--atn FILE.atn] [--new JSON] [--run id key=value ...] [--steps FILE.json]
                        [--format png|jpg|webp|tiff|psd|psb|ora|fvd] [--quality N] [--out DIR] [--suffix TEXT] [--in-place] [--verbose] [--yes]   file in, file out:
                        each picture is opened, edited, exported and closed (batch is the same command)
  ./formvis cli droplet <action-name> [--atn FILE.atn] [--format ...] [--quality N] [--to DIR] [--suffix TEXT] [--recursive] [--data FILE.fvdrop] [--out DIR] [--name FILE]
                        writes a script (and a .cmd twin) that runs the action over dropped files; --data also saves the choices as a droplet file
  ./formvis cli droplet FILE.fvdrop <pictures|folders...>   runs a saved droplet over those files
  ./formvis cli stack|contact|fit|photomerge|hdr <files...>   no window needed (see cli_offline.py): image stack statistics, contact sheet, Fit Image, Photomerge, Merge to HDR
  ./formvis cli info <file...> [--json]   size, colour mode, depth, resolution, profile and layers of a file; no window needed
  ./formvis cli convert <in> <out> | <in...> --to FORMAT [--out DIR] [--quality 0.1-1] [--dpi N] [--page N] [--options JSON] [--overwrite]
                        a picture file to another format through the engine; no window needed. A .psd .psb .ora .fvd file in or out keeps its
                        layers and goes through a window (add --headless)
  ./formvis cli jobs [list [--active]] | cancel <id> | cancel --all   the engine's background jobs
  ./formvis cli serve [--root DIR] [--token TEXT]   a JSON-lines session on stdin and stdout: {"id":1,"method":"command.run","params":{...}}
  ./formvis cli version   the version, build and the engine's address

Each subcommand takes --help. A command marked risky (undo cannot reverse it) is run only with --yes. A call waits up to 660 seconds
for the window (FORMVIS_CLI_TIMEOUT sets it); when it gives up or is stopped, the engine drops the request so it never runs later.
The engine's address: FORMVIS_URL, or http://127.0.0.1:8190. Editing commands need the window open (./formvis boot) and outside agents allowed
(Preferences > Plugins), or --headless on list, describe, run, process, batch, droplet, serve and convert, which starts a window with no
screen for that run (./formvis headless) and closes it after; info, convert of flat pictures and jobs need only the engine."""

HELP = {
    "list": "list [text] [--group name]\n  The command catalogue: id, label, when to use it. Needs the window to have been open once.",
    "describe": "describe <id> [kind=name]\n  One command: what it does, its parameters. kind= picks a filter or adjustment.",
    "run": "run <id> key=value ... [--yes]\n  Runs one command in the open window as an undoable step. A risky command needs --yes.",
    "process": "process <input|folder...> [--in DIR] [--recursive] [--action NAME] [--atn FILE.atn] [--new JSON] [--run id key=value ...] [--steps FILE.json]\n"
               "        [--format png|jpg|webp|tiff|psd|psb|ora|fvd] [--quality N] [--out DIR] [--suffix TEXT] [--in-place] [--verbose] [--headless] [--yes]\n  Each picture is opened in the window, edited, exported and closed. Folders give the pictures in them (--recursive goes deeper).\n"
               "  --steps takes a JSON list of {\"id\": ..., \"params\": {...}}. A result that would replace its source is refused unless --in-place.\n"
               "  --atn loads an actions file and plays every action in it (only --action NAME when given) on each picture. --new '{\"width\":800,\"height\":600,\"background\":\"white\",\"name\":\"card\"}'\n"
               "  starts from a new document instead of a file. --verbose prints each step's answer. --headless uses a window with no screen (started and closed for the run).",
    "droplet": "droplet <action-name> [--atn FILE.atn] [--format png|jpg|webp|tiff|psd|psb|ora|fvd] [--quality N] [--to DIR] [--suffix TEXT] [--recursive] [--data FILE.fvdrop] [--out DIR] [--name FILE]\n"
               "  Writes a script (and a .cmd twin) that runs the action over files dropped on it. --to is the folder the results go to; --out is where the script is written.\n"
               "  --data FILE.fvdrop saves the action and these choices as a droplet file and makes the script run it.\n"
               "droplet FILE.fvdrop <pictures|folders...>\n  Runs a saved droplet over the pictures and folders given.",
    "stack": "stack <files|folder...> --mode mean|median|minimum|maximum|range|stddev|variance|summation [--align] [--out FILE]\n  Same-size pictures combined by a stack mode; needs no window.",
    "contact": "contact <files|folder...> [--out FILE] [--width N --height N --unit px|in|cm|mm --ppi N] [--columns N --rows N] [--gap N] [--order across|down]\n"
               "        [--rotate] [--no-captions] [--font NAME_OR_FILE] [--font-size N] [--mode rgb|grayscale]\n  A contact sheet of captioned thumbnails, a page each time the grid fills; needs no window.",
    "fit": "fit <files|folder...> --width N --height N [--no-enlarge] [--resample nearest|bilinear|bicubic|lanczos] [--out DIR] [--suffix TEXT]\n  Fit Image: proportions kept inside the box; needs no window.",
    "photomerge": "photomerge <files...> [--layout auto|perspective|cylindrical|collage|reposition] [--crop] [--vignette] [--distortion] [--out FILE]\n  Overlapping photos stitched by the engine; needs no window.",
    "hdr": "hdr <files...> [--no-align] [--times 1/60,1/15,...] [--depth 32|16|8] [--out FILE]\n  Bracketed exposures merged by the engine into a Radiance .hdr (32) or a tone-mapped PNG (16 or 8); needs no window.",
    "info": "info <file...> [--json]\n  Size, colour mode, depth, resolution, profile and layers of a picture or project (.fvd .fmv .ora .psd .psb). Needs only the engine.",
    "convert": "convert <in> <out>\n  convert <in...> --to FORMAT [--out DIR]\n  [--quality 0.1-1] [--dpi N] [--page N] [--options JSON] [--overwrite]\n"
               "  A picture file to another format through the engine (png jpg webp avif tif bmp qoi tga ico pdf ppm pgm pbm pnm dpx fits wbmp). One flat picture; needs only the engine.\n"
               "  --options takes the writer's choices as JSON, for example tga {\"bits\":24,\"rle\":true}. A .psd .psb .ora or .fvd file in or out keeps its layers and needs a window (--headless).",
    "jobs": "jobs [list [--active]] | cancel <id> | cancel --all\n  The engine's background jobs (local generation, upscaling) and agent calls now running.",
    "serve": "serve [--root DIR] [--token TEXT] [--headless]\n  A JSON-lines session: one request per line on stdin, one answer per line on stdout. Request {\"id\":1,\"method\":\"...\",\"params\":{}};\n"
             "  answer {\"id\":1,\"ok\":true,\"result\":...} or {\"id\":1,\"ok\":false,\"error\":\"...\"}. Methods: ping, version, commands.list, command.describe,\n"
             "  command.run, batch {commands, stopOnError}, doc.list, doc.new, doc.open, doc.place, doc.save, doc.export, doc.inspect, doc.close, doc.exportLayers,\n"
             "  doc.exportDataSets, doc.importDataSets, file.info, file.convert, jobs.list, jobs.cancel, tool.call {name, arguments}, shutdown.\n"
             "  With --root DIR, paths outside DIR are refused. With --token TEXT (or FORMVIS_SERVE_TOKEN) each request must carry \"token\":\"TEXT\".\n"
             "  image.stack, image.contact, image.fit, image.photomerge, image.hdr {inputs: [paths], option: value ...} need no window (options are the command's flags,\n"
             "  underscores for dashes: {\"inputs\":[\"a.jpg\",\"b.jpg\"],\"mode\":\"mean\",\"out\":\"s.png\"}).",
    "version": "version\n  The version, the build (git commit when there is one), the Python in use and the engine's address and version.",
}
PICTURE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif", ".tif", ".tiff", ".heic", ".heif", ".bmp", ".qoi", ".tga", ".ico", ".pbm", ".pgm", ".ppm", ".pnm", ".pam",
                    ".dng", ".cr2", ".cr3", ".nef", ".arw", ".raf", ".orf", ".rw2", ".psd", ".psb", ".ora", ".fvd", ".fmv"}
CONVERT_TO = {"png": ".png", "jpg": ".jpg", "jpeg": ".jpg", "webp": ".webp", "avif": ".avif", "tif": ".tif", "tiff": ".tif", "bmp": ".bmp", "qoi": ".qoi", "tga": ".tga", "ico": ".ico",
              "pdf": ".pdf", "ppm": ".ppm", "pgm": ".pgm", "pbm": ".pbm", "pnm": ".pnm", "dpx": ".dpx", "fits": ".fits", "wbmp": ".wbmp",
              "psd": ".psd", "psb": ".psb", "ora": ".ora", "fvd": ".fvd"}
LAYERED = (".psd", ".psb", ".ora", ".fvd", ".fmv")
WINDOW_OUT = {"png", "jpg", "webp", "tiff", "psd", "psb", "ora", "fvd"}

import base64
import hmac
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
    wait = float(os.environ.get("FORMVIS_CLI_TIMEOUT") or 660)
    try:
        with urllib.request.urlopen(req, timeout=wait) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as exc:
        try:
            return exc.code, json.loads(exc.read().decode() or "{}")
        except ValueError:
            return exc.code, {}
    except KeyboardInterrupt:
        print("Stopped. The engine drops the request that was waiting for the window.", file=sys.stderr)
        sys.exit(130)
    except (urllib.error.URLError, OSError) as exc:
        if isinstance(exc, TimeoutError) or isinstance(getattr(exc, "reason", None), TimeoutError):
            print(f"formvis did not answer within {wait:g} seconds. The request was dropped, so it will not run later. Check that the formvis window is open and not busy "
                  f"(or add --headless), then retry; FORMVIS_CLI_TIMEOUT sets the wait in seconds.", file=sys.stderr)
        else:
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
    try:
        params = attach_files(params)
    except RuntimeError as exc:
        print(exc, file=sys.stderr)
        return 1
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


def attach_files(params: dict) -> dict:
    """A files parameter given as paths (a list, or one comma separated word) becomes [{name, data}] with the bytes in base64, which the window can read."""
    given = params.get("files")
    if isinstance(given, str):
        given = [w for w in given.split(",") if w.strip()]
    if not isinstance(given, list) or not all(isinstance(g, str) for g in given):
        return params
    out = []
    for path in expand_inputs([os.path.expanduser(g.strip()) for g in given], False):
        try:
            with open(path, "rb") as f:
                out.append({"name": os.path.basename(path), "data": base64.b64encode(f.read()).decode()})
        except OSError as exc:
            raise RuntimeError(f"{path} could not be read: {exc.strerror or exc}") from exc
    return {**params, "files": out}


def command_result(cid: str, params: dict, yes: bool) -> dict:
    """Runs one catalogue command and returns what it handed back; raises RuntimeError with the reason on failure."""
    params = attach_files(params)
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


def open_source(path: str | None, spec: dict, yes: bool) -> None:
    """The window opens the document: a new one from spec, a layered file by its path (layers kept), any other picture by its bytes."""
    if path is None or os.path.splitext(path)[1].lower() in LAYERED:
        ok, said, _data = tool("new_document", spec) if path is None else tool("open_file", {"path": os.path.abspath(os.path.expanduser(path))})
        if not ok:
            raise RuntimeError(said)
        return
    with open(path, "rb") as f:
        data = base64.b64encode(f.read()).decode()
    command_result("open-image-data", {"name": os.path.basename(path), "data": data}, yes)


def process_one(path: str | None, flags: dict, runs: list[list[str]]) -> str:
    """One picture in, one file out. path None is --new: a document made from the JSON in flags["new"] (width, height, background, name, ...)."""
    fmt = flags.get("format", "png").lower().lstrip(".")
    fmt = {"jpeg": "jpg", "tif": "tiff"}.get(fmt, fmt)
    if fmt not in WINDOW_OUT:
        raise RuntimeError("format must be " + ", ".join(sorted(WINDOW_OUT)) + ".")
    yes = bool(flags.get("yes"))
    spec = flags.get("new") or {}
    stem = os.path.splitext(os.path.basename(path))[0] if path else str(spec.get("name") or "New")
    name = f"{stem}{flags.get('suffix', '')}.{fmt}"
    out_dir = flags.get("out") or (os.path.dirname(os.path.abspath(path)) if path else os.getcwd())
    target = os.path.join(out_dir, name)
    if path and os.path.abspath(target) == os.path.abspath(path) and not flags.get("in-place"):
        raise RuntimeError(f"the result would replace {path}. Give --out DIR or --suffix TEXT, or --in-place if replacing it is meant.")
    steps = [(g[0], pairs(g[1:])) for g in runs]
    if flags.get("steps"):
        try:
            with open(flags["steps"], encoding="utf-8") as f:
                listed = json.load(f)
            steps += [(s["id"], s.get("params") or {}) for s in listed]
        except (OSError, ValueError, KeyError, TypeError) as exc:
            raise RuntimeError(f"--steps {flags['steps']} must be a JSON list of {{\"id\": ..., \"params\": {{...}}}}: {exc}") from exc
    open_source(path, spec, yes)
    try:
        for cid, params in steps:
            returned = command_result(cid, params, yes)
            if flags.get("verbose"):
                print(f"  {cid}: {STEP['said'] or 'done'}" + (f" {json.dumps(returned)}" if returned else ""))
        for played in flags.get("_play") or ([flags["action"]] if flags.get("action") else []):
            command_result("play-action", {"name": played}, yes)
            if flags.get("verbose"):
                print(f"  action {played}: played")
        params = {"format": fmt, "name": name}
        if "quality" in flags:
            params["quality"] = value_of(flags["quality"])
        made = command_result("export-to-file", params, True).get("path")   # the output file is what the person asked for; --yes is for the steps
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
    files, flags, runs = split_flags(args, ("--action", "--format", "--quality", "--out", "--suffix", "--in", "--steps", "--run", "--atn", "--new"), ("--yes", "--in-place", "--verbose", "--recursive"))
    files = expand_inputs(files + ([flags["in"]] if flags.get("in") else []), bool(flags.get("recursive")))
    if flags.get("new"):
        spec = value_of(flags["new"])
        if not isinstance(spec, dict):
            print("--new takes a JSON object, for example --new '{\"width\":800,\"height\":600,\"background\":\"#ffffff\",\"name\":\"card\"}'.", file=sys.stderr)
            return 2
        flags["new"] = spec
        files = [None]
    if not files:
        print("Give one or more picture files or a folder, for example: ./formvis cli process a.jpg b.jpg --action Sepia --format png --out done", file=sys.stderr)
        return 2
    if flags.get("atn"):
        try:
            with open(os.path.expanduser(flags["atn"]), "rb") as f:
                loaded = command_result("load-actions", {"atn_base64": base64.b64encode(f.read()).decode()}, bool(flags.get("yes"))).get("loaded") or []
        except (OSError, RuntimeError) as exc:
            print(f"--atn {flags['atn']}: {exc}", file=sys.stderr)
            return 1
        flags["_play"] = [flags["action"]] if flags.get("action") else loaded
        print(f"{flags['atn']}: {len(loaded)} action{'' if len(loaded) == 1 else 's'} loaded ({', '.join(loaded)})")
    failed = 0
    for path in files:
        try:
            print(f"{path or '(new document)'} -> {process_one(path, flags, runs)}")
        except (RuntimeError, OSError) as exc:
            failed += 1
            print(f"{path or '(new document)'}: failed. {exc}", file=sys.stderr)
    return 1 if failed else 0


DROPLET_KIND = "formvis-droplet"


def droplet_data(path: str) -> dict:
    """A droplet data file (.fvdrop): JSON {kind, version, action, steps, output: {format, quality, out, suffix, recursive, inPlace}}; RuntimeError says what is wrong."""
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError) as exc:
        raise RuntimeError(f"{path} could not be read as a droplet: {exc}") from exc
    if not isinstance(data, dict) or data.get("kind") != DROPLET_KIND:
        raise RuntimeError(f"{path} is not a formvis droplet file.")
    if not isinstance(data.get("output") or {}, dict):
        raise RuntimeError(f"{path}: output must be an object.")
    if not data.get("action") and not data.get("steps"):
        raise RuntimeError(f"{path} names no action and no steps.")
    if data.get("steps") is not None and not (isinstance(data["steps"], list) and all(isinstance(s, dict) and isinstance(s.get("id"), str) for s in data["steps"])):
        raise RuntimeError(f"{path}: steps must be a list of {{\"id\": ..., \"params\": {{...}}}}.")
    return data


def droplet_run(path: str, words: list[str]) -> int:
    """./formvis cli droplet FILE.fvdrop inputs...: the saved action and output choices applied to the files or folders given."""
    try:
        data = droplet_data(path)
    except RuntimeError as exc:
        print(exc, file=sys.stderr)
        return 1
    output = data.get("output") or {}
    files = expand_inputs(words, bool(output.get("recursive")))
    if not files:
        print("Give one or more picture files or folders to run the droplet on.", file=sys.stderr)
        return 2
    flags: dict = {"format": output.get("format") or "png"}
    for key in ("quality", "out", "suffix"):
        if output.get(key) not in (None, ""):
            flags[key] = str(output[key])
    if data.get("action"):
        flags["action"] = str(data["action"])
    if output.get("inPlace"):
        flags["in-place"] = True
    runs = [[s["id"]] + [f"{k}={json.dumps(v)}" for k, v in (s.get("params") or {}).items()] for s in data.get("steps") or []]
    failed = 0
    for src in files:
        try:
            print(f"{src} -> {process_one(src, flags, runs)}")
        except (RuntimeError, OSError) as exc:
            failed += 1
            print(f"{src}: failed. {exc}", file=sys.stderr)
    return 1 if failed else 0


def droplet_cmd(args: list[str]) -> int:
    words, flags, _ = split_flags(args, ("--format", "--out", "--name", "--quality", "--suffix", "--data", "--to", "--atn"), ("--recursive", "--in-place"))
    if words and words[0].lower().endswith(".fvdrop") and os.path.isfile(words[0]):
        return droplet_run(words[0], words[1:])
    if not words:
        print("Give the action name, for example: ./formvis cli droplet Sepia --format jpg, or a droplet file and pictures: ./formvis cli droplet Sepia.fvdrop a.jpg b.jpg", file=sys.stderr)
        return 2
    action, fmt = " ".join(words), flags.get("format", "png")
    if fmt.lower().lstrip(".") not in WINDOW_OUT | {"jpeg", "tif"}:
        print("format must be " + ", ".join(sorted(WINDOW_OUT)) + ".", file=sys.stderr)
        return 2
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    quoted = "'" + action.replace("'", "'\\''") + "'"
    out_dir = flags.get("out") or os.getcwd()
    os.makedirs(out_dir, exist_ok=True)
    sh = os.path.join(out_dir, flags.get("name") or f"{action}-droplet.sh")
    if flags.get("data"):
        target = os.path.abspath(flags["data"] if flags["data"].lower().endswith(".fvdrop") else flags["data"] + ".fvdrop")
        output = {"format": fmt, **({"quality": value_of(flags["quality"])} if "quality" in flags else {}), **({"out": flags["to"]} if flags.get("to") else {}),
                  **({"suffix": flags["suffix"]} if flags.get("suffix") else {}), "recursive": bool(flags.get("recursive")), "inPlace": bool(flags.get("in-place"))}
        with open(target, "w", encoding="utf-8") as f:
            json.dump({"kind": DROPLET_KIND, "version": 1, "action": action, "output": output}, f, indent=2)
            f.write("\n")
        launcher = f"exec ./formvis cli droplet '{target}' \"$@\"\n"
        win_line = f"python setup\\cli.py droplet \"{target}\" %*\r\n"
        print(f"Wrote {target}. Run it with: ./formvis cli droplet {target} <pictures or folders>")
    else:
        extra = f"{' --quality ' + flags['quality'] if 'quality' in flags else ''}{' --out ' + chr(39) + flags['to'] + chr(39) if flags.get('to') else ''}{' --suffix ' + chr(39) + flags['suffix'] + chr(39) if flags.get('suffix') else ''}{' --recursive' if flags.get('recursive') else ''}{' --atn ' + chr(39) + os.path.abspath(os.path.expanduser(flags['atn'])) + chr(39) if flags.get('atn') else ''}"
        launcher = f"exec ./formvis cli process \"$@\" --action {quoted} --format {fmt}{extra}\n"
        win_line = f"python setup\\cli.py process %* --action \"{action.replace(chr(34), chr(39))}\" --format {fmt}{extra.replace(chr(39), chr(34))}\r\n"
    with open(sh, "w") as f:
        f.write(f"#!/bin/sh\n# formvis droplet for the action {action}: drop pictures onto it, or run it with file names.\ncd '{root}' || exit 1\n{launcher}")
    os.chmod(sh, 0o755 | stat.S_IMODE(os.stat(sh).st_mode))
    twin = os.path.splitext(sh)[0] + ".cmd"
    with open(twin, "w", newline="") as f:
        f.write(f"@echo off\r\ncd /d \"{root}\"\r\n{win_line}")
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


def convert_window(src: str, dst: str, extra: dict) -> str:
    """A layered file in or out (psd psb ora fvd): the window, headless or not, opens src and writes dst with the layers kept; a flat output (png jpg webp tiff) is the flattened picture."""
    src, dst = os.path.abspath(os.path.expanduser(src)), os.path.abspath(os.path.expanduser(dst))
    fmt = {"jpeg": "jpg", "tif": "tiff"}.get(os.path.splitext(dst)[1].lower().lstrip("."), os.path.splitext(dst)[1].lower().lstrip("."))
    if fmt not in WINDOW_OUT:
        raise RuntimeError(f"a layered input converts to {', '.join(sorted(WINDOW_OUT))} only, not {fmt}.")
    if os.path.exists(dst) and not extra.get("overwrite"):
        raise RuntimeError(f"{dst} already exists; --overwrite replaces it.")
    open_source(src, {}, True)
    try:
        params: dict = {"format": fmt, "name": os.path.basename(dst)}
        if "quality" in extra:
            params["quality"] = round(float(extra["quality"]) * 100) if float(extra["quality"]) <= 1 else extra["quality"]
        made = command_result("export-to-file", params, True).get("path")
    finally:
        try:
            command_result("close-document", {}, True)
        except RuntimeError:
            pass
    if not made:
        raise RuntimeError("The window did not report where it saved the file.")
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.move(made, dst)
    return f"{dst} ({os.path.getsize(dst):,} bytes, {fmt})"


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
        if os.path.splitext(src)[1].lower() in LAYERED or os.path.splitext(dst)[1].lower() in (".psd", ".psb", ".ora", ".fvd"):
            try:
                print(f"{src} -> {convert_window(src, dst, extra)}")
            except (RuntimeError, OSError) as exc:
                failed += 1
                print(f"{src}: failed. {exc}", file=sys.stderr)
            continue
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


COMMAND_METHODS = {"doc.exportLayers": "export-layers", "doc.exportDataSets": "export-data-sets", "doc.importDataSets": "data-sets-import"}
OFFLINE_METHODS = {"image.stack": "stack", "image.contact": "contact", "image.fit": "fit", "image.photomerge": "photomerge", "image.hdr": "hdr"}


def offline_request(name: str, params: dict, root: str | None) -> dict:
    """image.stack, image.contact, image.fit, image.photomerge and image.hdr: {inputs: [paths], <option>: value ...} where an option is the command's flag without dashes (font_size for --font-size)."""
    import contextlib
    import io
    import cli_offline
    inputs = params.get("inputs")
    if not isinstance(inputs, list) or not inputs or not all(isinstance(i, str) for i in inputs):
        raise RuntimeError("inputs must be a list of picture paths or folders.")
    for path in [*inputs, params.get("out")]:
        refused = outside_root(root, {"path": path}) if isinstance(path, str) else None
        if refused:
            raise RuntimeError(refused)
    argv = [os.path.expanduser(i) for i in inputs]
    for key, value in params.items():
        if key == "inputs" or value is False or value is None:
            continue
        argv.append("--" + key.replace("_", "-"))
        if value is not True:
            argv.append(str(value))
    out, err = io.StringIO(), io.StringIO()
    try:
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = cli_offline.COMMANDS[name](argv)
    except SystemExit as exc:
        code = exc.code if isinstance(exc.code, int) else 2
    if code:
        raise RuntimeError((err.getvalue() or out.getvalue() or f"{name} failed.").strip())
    return {"output": out.getvalue().strip().splitlines()}


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
        if any(isinstance(s, dict) and "method" in s for s in steps):   # protocol methods mixed in: run in order, each its own undo step
            results = []
            for step in steps:
                label = {"method": step["method"]} if isinstance(step, dict) and "method" in step else {"id": step.get("id") if isinstance(step, dict) else None}
                try:
                    if "method" in label:
                        if step["method"] in ("batch", "shutdown"):
                            raise RuntimeError(f"{step['method']} cannot be a step of a batch.")
                        result = serve_request(str(step["method"]), step.get("params") or {}, root)
                    else:
                        result = {"message": "", "returned": command_result(str(step.get("id", "")), step.get("params") or {}, bool(params.get("yes")))}
                        result["message"] = STEP["said"]
                    results.append({**label, "ok": True, "result": result})
                except RuntimeError as exc:
                    results.append({**label, "ok": False, "error": str(exc)})
                    if params.get("stopOnError", True):
                        break
            return {"ran": len(results), "results": results}
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
    if method == "doc.list":
        ok, said, data = tool("ping", {})
        return {"documents": (data or {}).get("documents", []), "active": (data or {}).get("active")}
    if method in COMMAND_METHODS:
        returned = command_result(COMMAND_METHODS[method], {k: v for k, v in params.items() if k != "yes"}, bool(params.get("yes")))
        return {"message": STEP["said"], "returned": returned}
    if method in OFFLINE_METHODS:
        return offline_request(OFFLINE_METHODS[method], params, root)
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
    words, flags, _ = split_flags(args, ("--root", "--token"), ())
    if words:
        print("serve takes only --root DIR and --token TEXT.", file=sys.stderr)
        return 2
    root = os.path.realpath(os.path.expanduser(flags["root"])) if flags.get("root") else None
    token = flags.get("token") or os.environ.get("FORMVIS_SERVE_TOKEN") or ""

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
        if token and not hmac.compare_digest(str(req.get("token", "")).encode(), token.encode()):
            reply(req.get("id"), ok=False, error='This session needs its token: add "token": "..." to each request.')
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


def offline(name: str):
    def go(rest: list[str]) -> int:
        import cli_offline
        return cli_offline.COMMANDS[name](rest)
    return go


COMMANDS = {"list": list_cmd, "describe": describe_cmd, "run": run_cmd, "process": process_cmd, "batch": process_cmd, "droplet": droplet_cmd, "info": info_cmd, "convert": convert_cmd,
            "jobs": jobs_cmd, "serve": serve_cmd, "version": version_cmd, **{n: offline(n) for n in ("stack", "contact", "fit", "photomerge", "hdr")}}


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
    if "--headless" in rest and sub in ("list", "describe", "run", "process", "batch", "droplet", "serve", "convert"):
        import headless as window_host
        rest = [a for a in rest if a != "--headless"]
        try:
            held = window_host.ensure()
        except RuntimeError as exc:
            print(exc, file=sys.stderr)
            return 1
        try:
            return COMMANDS[sub](rest)
        finally:
            window_host.release(held)
    return COMMANDS[sub](rest)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
