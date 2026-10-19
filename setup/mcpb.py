#!/usr/bin/env python3
"""Builds the Claude Desktop extension bundle, formvis.mcpb: a zip of setup/mcpb/manifest.json (the version filled in from
frontend/src/version.ts), the stdio launcher and the icon. Double-click the file in Claude Desktop to install it.
  python3 setup/mcpb.py [--out DIR]   writes DIR/formvis-<version>.mcpb (DIR defaults to the current folder)
  python3 setup/mcpb.py --check       checks the manifest's required fields and exits 1 if any is missing"""

import json
import os
import re
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REQUIRED = ("manifest_version", "name", "version", "description", "author", "server")


def version() -> str:
    with open(os.path.join(ROOT, "frontend", "src", "version.ts"), encoding="utf-8") as f:
        return re.search(r"VERSION = '([^']+)'", f.read()).group(1)


def manifest() -> dict:
    with open(os.path.join(ROOT, "setup", "mcpb", "manifest.json"), encoding="utf-8") as f:
        return json.load(f)


def main(argv: list[str]) -> int:
    out, check = ".", False
    i = 0
    while i < len(argv):
        if argv[i] == "--check":
            check = True
        elif argv[i] == "--out" and i + 1 < len(argv):
            i += 1
            out = argv[i]
        else:
            print(f"{argv[i]}: not an option. Try --out DIR or --check.", file=sys.stderr)
            return 2
        i += 1
    data = manifest()
    missing = [k for k in REQUIRED if k not in data]
    entry = data.get("server", {}).get("entry_point", "")
    if missing or not os.path.isfile(os.path.join(ROOT, "setup", "mcp_stdio.py")):
        print("The manifest lacks: " + ", ".join(missing or ["the launcher"]), file=sys.stderr)
        return 1
    if check:
        print(f"manifest ok ({entry})")
        return 0
    data["version"] = version()
    os.makedirs(out, exist_ok=True)
    target = os.path.join(out, f"formvis-{data['version']}.mcpb")
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("manifest.json", json.dumps(data, indent=2) + "\n")
        z.write(os.path.join(ROOT, "setup", "mcp_stdio.py"), entry)
        z.write(os.path.join(ROOT, "assets", "formvis_icon.png"), data["icon"])
    print(f"Wrote {target}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
