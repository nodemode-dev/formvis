#!/usr/bin/env python3
"""Collect the licence texts of everything formvis ships into licenses/.

Run it from the engine's build environment so the Python part sees the installed packages:

    backend/venv/bin/python setup/collect_licenses.py            (Windows: backend\\venv\\Scripts\\python)

Steps: python, npm, rust. Name some to run only those, for example `collect_licenses.py npm rust`.
Rust uses cargo-about (cargo install cargo-about --locked) with src-tauri/about.toml and src-tauri/about.hbs;
without it, each crate's licence files are copied from the cargo registry into licenses/rust/<crate>-<version>/.
The output replaces licenses/python, licenses/python-ml, licenses/npm, licenses/rust and the two rust html files.
"""
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "licenses"
LICENSE_NAME = re.compile(r"^(licen[cs]e|licen[cs]es|copying|notice|copyright)([-_. ].*)?$", re.I)
SKIP_TOOLS = {"pip", "setuptools", "wheel", "pytest", "pluggy", "iniconfig", "pyinstaller"}


def norm(name):
    return re.sub(r"[-_.]+", "-", name).lower()


def read_requirements(path):
    names = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.split("#")[0].strip()
        if not line or line.startswith("-"):
            continue
        line = line.split(" @ ")[0].strip()
        names.append(line)
    return names


def closure(requirement_lines):
    from importlib import metadata
    from packaging.requirements import Requirement

    seen = {}
    todo = [Requirement(line) for line in requirement_lines]
    while todo:
        req = todo.pop()
        if req.marker is not None and not req.marker.evaluate({"extra": ""}):
            continue
        key = norm(req.name)
        try:
            dist = metadata.distribution(req.name)
        except metadata.PackageNotFoundError:
            seen.setdefault(key, None)
            continue
        extras = set(req.extras)
        have = seen.get(key)
        if have is not None and extras <= have[1]:
            continue
        seen[key] = (dist, extras | (have[1] if have else set()))
        for text in dist.requires or []:
            sub = Requirement(text)
            if sub.marker is not None and not any(sub.marker.evaluate({"extra": e}) for e in (extras | {""})):
                continue
            todo.append(Requirement(text.split(";")[0]))
    return seen


def license_files(dist):
    found = []
    for f in dist.files or []:
        parts = f.parts
        if not parts[0].endswith(".dist-info"):
            continue
        rel = parts[1:]
        if not rel:
            continue
        if rel[0] == "licenses" and len(rel) > 1:
            found.append((f, Path(*rel[1:])))
        elif len(rel) == 1 and LICENSE_NAME.match(rel[0]):
            found.append((f, Path(rel[0])))
    return found


def package_dir_files(dist):
    found = []
    for f in dist.files or []:
        if f.parts[0].endswith(".dist-info") or len(f.parts) < 2 or len(f.parts) > 3:
            continue
        if LICENSE_NAME.match(f.name):
            found.append((Path(str(dist.locate_file(f))), Path(f.name)))
    return found


def copy_dist(dist, dest_root, missing):
    name = norm(dist.metadata["Name"])
    dest = dest_root / name
    count = 0
    pairs = [(Path(str(dist.locate_file(f))), rel) for f, rel in license_files(dist)]
    if not pairs:
        pairs = package_dir_files(dist)
    for src, rel in pairs:
        if not src.is_file():
            continue
        target = dest / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, target)
        count += 1
    if count == 0:
        missing.append(name)
    return count


def do_python():
    from importlib import metadata

    base_lines = read_requirements(ROOT / "backend" / "requirements.txt")
    ml_lines = read_requirements(ROOT / "backend" / "requirements_ml.txt")
    ml_lines += read_requirements(ROOT / "backend" / "requirements_sam2.txt")
    ml_lines.append("sam-2")
    base = closure(base_lines)
    ml = closure(ml_lines)
    for sub in ("python", "python-ml"):
        shutil.rmtree(OUT / sub, ignore_errors=True)
    missing = []
    not_installed = []
    for key, value in sorted(base.items()):
        if key in SKIP_TOOLS:
            continue
        if value is None:
            not_installed.append(key)
            continue
        copy_dist(value[0], OUT / "python", missing)
    for key, value in sorted(ml.items()):
        if key in base or key in SKIP_TOOLS:
            continue
        if value is None:
            not_installed.append(key + " (ml)")
            continue
        copy_dist(value[0], OUT / "python-ml", missing)

    def site_file(dist_name, relative, target):
        dist = metadata.distribution(dist_name)
        src = Path(str(dist.locate_file(relative)))
        if src.is_file():
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(src, target)
        else:
            missing.append(str(relative))

    site_file("onnxruntime", "onnxruntime/ThirdPartyNotices.txt", OUT / "onnxruntime-ThirdPartyNotices.txt")
    site_file("onnxruntime", "onnxruntime/LICENSE", OUT / "python" / "onnxruntime" / "LICENSE")
    site_file("opencv-python-headless", "cv2/LICENSE-3RD-PARTY.txt",
              OUT / "python" / "opencv-python-headless" / "LICENSE-3RD-PARTY.txt")
    print("python: no licence file found for:", ", ".join(missing) or "none")
    print("python: named but not installed here:", ", ".join(not_installed) or "none")


def do_npm():
    modules = ROOT / "frontend" / "node_modules"
    package = json.loads((ROOT / "frontend" / "package.json").read_text(encoding="utf-8"))
    shutil.rmtree(OUT / "npm", ignore_errors=True)
    seen = set()
    todo = list(package.get("dependencies", {}))
    missing = []
    while todo:
        name = todo.pop()
        if name in seen:
            continue
        seen.add(name)
        folder = modules / name
        meta_path = folder / "package.json"
        if not meta_path.is_file():
            missing.append(name)
            continue
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        todo.extend(meta.get("dependencies", {}))
        copied = 0
        for p in sorted(folder.glob("*")):
            if p.is_file() and LICENSE_NAME.match(p.name):
                target = OUT / "npm" / name / p.name
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(p, target)
                copied += 1
        if copied == 0:
            missing.append(name)
    print("npm: packages", len(seen), "without a licence file or not installed:", ", ".join(missing) or "none")


def cargo_metadata(manifest):
    out = subprocess.run(["cargo", "metadata", "--format-version", "1", "--manifest-path", str(manifest)],
                         check=True, capture_output=True, text=True).stdout
    return json.loads(out)


def do_rust():
    for name in ("rust-src-tauri.html", "rust-formvis-render.html"):
        (OUT / name).unlink(missing_ok=True)
    shutil.rmtree(OUT / "rust", ignore_errors=True)
    have_about = subprocess.run(["cargo", "about", "--version"], capture_output=True).returncode == 0
    jobs = [("src-tauri", "rust-src-tauri.html"), ("native/formvis-render", "rust-formvis-render.html")]
    if have_about:
        for folder, html in jobs:
            manifest_dir = ROOT / folder
            subprocess.run(["cargo", "about", "generate", "--config", str(ROOT / "src-tauri" / "about.toml"),
                            "--manifest-path", str(manifest_dir / "Cargo.toml"),
                            str(ROOT / "src-tauri" / "about.hbs"), "-o", str(OUT / html)], check=True)
            print("rust: wrote", html)
        return
    print("rust: cargo-about not installed, copying licence files from the cargo registry")
    seen = set()
    for folder, _ in jobs:
        for pkg in cargo_metadata(ROOT / folder / "Cargo.toml")["packages"]:
            if pkg.get("source") is None:
                continue
            key = (pkg["name"], pkg["version"])
            if key in seen:
                continue
            seen.add(key)
            src_dir = Path(pkg["manifest_path"]).parent
            dest = OUT / "rust" / f"{pkg['name']}-{pkg['version']}"
            for p in sorted(src_dir.glob("*")):
                if p.is_file() and LICENSE_NAME.match(p.name):
                    dest.mkdir(parents=True, exist_ok=True)
                    shutil.copyfile(p, dest / p.name)
    print("rust: crates", len(seen))


def main():
    steps = sys.argv[1:] or ["python", "npm", "rust"]
    OUT.mkdir(exist_ok=True)
    for step in steps:
        {"python": do_python, "npm": do_npm, "rust": do_rust}[step]()


if __name__ == "__main__":
    main()
