"""Prints the CHANGELOG.md section for a release tag: the notes of the draft release.

  python3 setup/release_notes.py v1.90.6                    the section headed "## 1.90.6", without its heading, on stdout
  python3 setup/release_notes.py v1.90.6 --out notes.md     the same into a file
A tag with no section in the changelog gives the one line "formvis 1.90.6" and exit code 0."""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def section(tag: str) -> str:
    version = tag.strip().lstrip("vV")
    with open(os.path.join(ROOT, "CHANGELOG.md"), encoding="utf-8") as f:
        text = f.read()
    m = re.search(r"^## " + re.escape(version) + r"(?![\w.])[^\n]*\n(.*?)(?=^## |\Z)", text, re.S | re.M)
    body = m.group(1).strip() if m else ""
    return body or f"formvis {version}"


def main(argv: list[str]) -> int:
    if not argv or argv[0].startswith("-"):
        print(__doc__)
        return 2
    notes = section(argv[0]) + "\n"
    if "--out" in argv:
        with open(argv[argv.index("--out") + 1], "w", encoding="utf-8", newline="\n") as f:
            f.write(notes)
    else:
        sys.stdout.write(notes)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
