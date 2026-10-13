#!/usr/bin/env python3
"""formvis from a terminal (DEV_PLAN 28.3): the command catalogue of the open window, through the engine.

  ./formvis cli list [text] [--group name]   the catalogue: id, label, when to use it
  ./formvis cli describe <id> [kind=name]    one command: what it does, its parameters (kind= picks a filter or adjustment)
  ./formvis cli run <id> key=value ... [--yes]   runs it in the open window as an undoable step

A command marked risky (undo cannot reverse it) is run only with --yes. The engine's address: FORMVIS_URL, or
http://127.0.0.1:8190. The window must be open (./formvis boot) and outside agents allowed (Preferences > Plugins)."""

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

URL = os.environ.get("FORMVIS_URL", "http://127.0.0.1:8190").rstrip("/")


def call(method: str, path: str, body: dict | None = None) -> tuple[int, dict]:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(URL + path, data=data, method=method, headers={"Content-Type": "application/json"})
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


def main(argv: list[str]) -> int:
    if not argv or argv[0] in ("-h", "--help", "help"):
        print(__doc__)
        return 0
    sub, rest = argv[0], argv[1:]
    if sub == "list":
        return list_cmd(rest)
    if sub == "describe":
        return describe_cmd(rest)
    if sub == "run":
        return run_cmd(rest)
    print(f"{sub}: the subcommands are list, describe and run. Try ./formvis cli help.", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
