import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]

VERSION_SITES = [
    ("README.md", r'alt="version (\S+)"'),
    ("backend/app/__init__.py", r'^__version__ = "([^"]+)"'),
    ("frontend/package.json", r'^  "version": "([^"]+)"'),
    ("frontend/src/version.ts", r"^export const VERSION = '([^']+)'"),
    ("src-tauri/Cargo.toml", r'^version = "([^"]+)"'),
    ("src-tauri/tauri.conf.json", r'^ "version": "([^"]+)"'),
]

VERSION = re.compile(r"^\d+\.\d+\.\d$")


def found():
    out = {}
    for rel, pattern in VERSION_SITES:
        match = re.search(pattern, (REPO / rel).read_text(encoding="utf-8"), re.MULTILINE)
        out[rel] = match.group(1) if match else None
    return out


def test_every_version_site_was_found():
    missing = [site for site, value in found().items() if value is None]
    assert not missing, f"no version found in {missing}"


def test_every_version_site_agrees():
    assert len(set(found().values())) == 1, found()


def test_version_has_three_parts_and_a_one_digit_patch():
    assert VERSION.match(next(iter(found().values()))), found()


def test_the_lockfiles_carry_the_same_version():
    version = next(iter(found().values()))
    lock = (REPO / "frontend" / "package-lock.json").read_text(encoding="utf-8")
    assert lock.count(f'"version": "{version}"') >= 2
    cargo = (REPO / "src-tauri" / "Cargo.lock").read_text(encoding="utf-8")
    assert re.search(rf'name = "formvis"\nversion = "{re.escape(version)}"', cargo), "src-tauri/Cargo.lock"
