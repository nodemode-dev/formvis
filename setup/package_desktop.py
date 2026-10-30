#!/usr/bin/env python3
"""Packaging steps for the formvis desktop release, called by formcompiler (nodemode-ai/formcompiler).

formvis builds nothing in its own repository. formcompiler checks out a compile_vX.Y.Z branch, runs the steps below
in this order and drafts the release formvis-vX.Y.Z on its own release page. Steps run from the repository root.

Per target in MATRIX (each target is one runner):
  1. Linux only: apt-get install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libxdo-dev libssl-dev
  2. Windows signing is formcompiler's (its tauri.windows.conf.json and signing step); formvis adds none
  3. ./formvis install --lite   then   ./formvis install-desktop
  4. unset APPLE_CERTIFICATE, APPLE_CERTIFICATE_PASSWORD, APPLE_SIGNING_IDENTITY when APPLE_CERTIFICATE is empty;
     unset APPLE_ID, APPLE_PASSWORD, APPLE_TEAM_ID when APPLE_ID is empty;
     unset TAURI_SIGNING_PRIVATE_KEY, TAURI_SIGNING_PRIVATE_KEY_PASSWORD when the key is empty
  5. cfg=$(python3 setup/package_desktop.py config); then ./formvis desktop build $TAURI_TARGET_ARGS [--config "$cfg" when cfg is not empty]
  6. macOS: mac-archive, then notarize when APPLE_ID, APPLE_PASSWORD and APPLE_TEAM_ID are all set (it checks the
     app Tauri notarized and notarizes only a dmg not yet stapled; without APPLE_SIGNING_IDENTITY it does nothing)
  7. Windows: portable-windows, then msix (never for x86)
  8. Linux: linux-tar; macOS: portable-macos
  9. keep for the release: RELEASE_DIR/bundle/{dmg/*.dmg, appimage/*.AppImage, appimage/*.AppImage.zsync, deb/*.deb,
     rpm/*.rpm, msi/*.msi, nsis/*.exe, macos/*.app.tar.gz, **/*.sig}, portable/formvis-portable-windows-*.zip,
     formvis-portable-macos-*.zip, msix/*.msix, formvis-linux-*.tar.gz
Environment per target: FORMVIS_TARGET=target, FORMVIS_PYI_ARCH=pyi_arch, FORMVIS_FREEZE_ML=1 only to freeze rembg and
ONNX Runtime into the engine (else 0), TAURI_TARGET_ARGS="--target <target>" when target is set else empty,
RELEASE_DIR=src-tauri/target/<target>/release when target is set else src-tauri/target/release,
TAURI_UPDATER_PUBKEY (public half of the updater key), MSIX_IDENTITY_NAME, MSIX_PUBLISHER, MSIX_PUBLISHER_DISPLAY_NAME.
Python 3.12 (x86 build on windows-x86), Node 22, stable Rust with rust_targets installed.

Then once: riscv64 (needs frontend/dist: npm ci --prefix frontend; npm run build --prefix frontend), then collect every
artifact into bundles/ and run, in this order:
  feed --tag formvis-vX.Y.Z --base-url https://github.com/nodemode-ai/formcompiler/releases/download/formvis-vX.Y.Z/ --dir bundles
  python3 setup/release_notes.py vX.Y.Z --out release-notes.md     (this script wants the v form, not formvis-vX.Y.Z)
  python3 setup/mcpb.py --out bundles
  sums --dir bundles
  draft release tag formvis-vX.Y.Z, body release-notes.md, files bundles/**/*

AppImage update information. The old value was gh-releases-zsync|owner|repo|latest|formvis_*_ARCH.AppImage.zsync.
Under formcompiler set LDAI_UPDATE_INFORMATION to the output of zsync-info --appimage ARCH, which is
gh-releases-zsync|nodemode-ai|formcompiler|formvis-updates|formvis_*_ARCH.AppImage.zsync
The tauri.conf.json updater endpoint is https://github.com/nodemode-ai/formcompiler/releases/download/formvis-updates/latest.json
so formcompiler must also publish the newest latest.json, signatures and AppImage zsync files to the formvis-updates release.
"""
import argparse
import datetime
import glob
import json
import os
import shutil
import stat
import subprocess
import sys
import tarfile
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

MATRIX = [
    {"name": "macos-arm64", "os": "macos-latest", "arch": "aarch64"},
    {"name": "macos-x64", "os": "macos-15-intel", "arch": "x86_64", "experimental": True},
    {"name": "macos-universal", "os": "macos-latest", "arch": "universal", "target": "universal-apple-darwin",
     "rust_targets": "aarch64-apple-darwin,x86_64-apple-darwin", "pyi_arch": "universal2", "experimental": True},
    {"name": "linux-x64", "os": "ubuntu-22.04", "arch": "x64", "debarch": "amd64", "appimage": "amd64"},
    {"name": "linux-arm64", "os": "ubuntu-22.04-arm", "arch": "arm64", "debarch": "arm64", "appimage": "aarch64",
     "experimental": True},
    {"name": "windows-x64", "os": "windows-latest", "arch": "x64"},
    {"name": "windows-x86", "os": "windows-latest", "arch": "x86", "target": "i686-pc-windows-msvc",
     "rust_targets": "i686-pc-windows-msvc", "pyarch": "x86", "experimental": True},
    {"name": "windows-arm64", "os": "windows-11-arm", "arch": "arm64", "experimental": True},
]

FEED_TARGETS = {
    "darwin-aarch64": "*_aarch64.app.tar.gz",
    "darwin-x86_64": "*_x86_64.app.tar.gz",
    "linux-x86_64": "*amd64.AppImage",
    "linux-aarch64": "*aarch64.AppImage",
    "windows-x86_64": "*x64-setup.exe",
    "windows-aarch64": "*arm64-setup.exe",
    "windows-i686": "*x86-setup.exe",
}

ZSYNC_OWNER = "nodemode-ai"
ZSYNC_REPO = "formcompiler"
ZSYNC_TAG = "formvis-updates"


def run(cmd, **kw):
    subprocess.run(cmd, check=True, **kw)


def cmd_config(args):
    conf, bundle = {}, {}
    if os.environ.get("TAURI_SIGNING_PRIVATE_KEY"):
        bundle["createUpdaterArtifacts"] = True
        pub = os.environ.get("TAURI_UPDATER_PUBKEY", "")
        if pub:
            conf["plugins"] = {"updater": {"pubkey": pub}}
        else:
            with open(os.path.join(ROOT, "src-tauri", "tauri.conf.json"), encoding="utf-8") as f:
                if not json.load(f)["plugins"]["updater"]["pubkey"]:
                    print("warning: the updater key is set but no public key is configured, so installed apps cannot verify updates", file=sys.stderr)
    if bundle:
        conf["bundle"] = bundle
    print(json.dumps(conf) if conf else "")
    return 0


def cmd_mac_archive(args):
    folder = os.path.join(args.release_dir, "bundle", "macos")
    for name in ("formvis.app.tar.gz", "formvis.app.tar.gz.sig"):
        src = os.path.join(folder, name)
        if os.path.isfile(src):
            os.replace(src, os.path.join(folder, name.replace("formvis", "formvis_" + args.arch, 1)))
    return 0


def quiet(cmd):
    return subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0


def cmd_notarize(args):
    env = os.environ
    identity = env.get("APPLE_SIGNING_IDENTITY", "")
    if not identity:
        print("notarize: skipped, no APPLE_SIGNING_IDENTITY (an ad hoc build cannot be notarized)")
        return 0
    run(["spctl", "-a", "-t", "exec", "-vv", os.path.join(args.release_dir, "bundle", "macos", "formvis.app")])
    for dmg in sorted(glob.glob(os.path.join(args.release_dir, "bundle", "dmg", "*.dmg"))):
        if quiet(["xcrun", "stapler", "validate", dmg]):
            print("notarize: already stapled: " + dmg)
            continue
        if not quiet(["codesign", "--verify", dmg]):
            run(["codesign", "--force", "--timestamp", "--sign", identity, dmg])
        run(["xcrun", "notarytool", "submit", dmg, "--apple-id", env["APPLE_ID"], "--password", env["APPLE_PASSWORD"],
             "--team-id", env["APPLE_TEAM_ID"], "--wait"])
        run(["xcrun", "stapler", "staple", dmg])
        run(["xcrun", "stapler", "validate", dmg])
    return 0


def cmd_portable_windows(args):
    out = os.path.join("portable", "formvis")
    os.makedirs(out, exist_ok=True)
    shutil.copy(os.path.join(args.release_dir, "formvis.exe"), out)
    shutil.copy(os.path.join(args.release_dir, "formvis-engine.exe"), out)
    with open(os.path.join(out, "portable.txt"), "w", encoding="utf-8") as f:
        f.write("formvis keeps its data in the FormvisData folder beside this file.\n")
    target = os.path.join("portable", f"formvis-portable-windows-{args.arch}.zip")
    if os.path.exists(target):
        os.remove(target)
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as z:
        for base, _dirs, files in os.walk(out):
            for name in sorted(files):
                full = os.path.join(base, name)
                z.write(full, os.path.relpath(full, "portable").replace(os.sep, "/"))
    return 0


def cmd_msix(args):
    env = os.environ
    if args.arch == "x86":
        print("msix: skipped for x86")
        return 0
    if not env.get("MSIX_IDENTITY_NAME") or not env.get("MSIX_PUBLISHER"):
        print("msix: skipped, MSIX_IDENTITY_NAME and MSIX_PUBLISHER are not both set")
        return 0
    with open(os.path.join(ROOT, "src-tauri", "tauri.conf.json"), encoding="utf-8") as f:
        conf = json.load(f)
    import re
    version = re.sub(r"[-+].*$", "", conf["version"]) + ".0"
    arch = "arm64" if args.arch == "arm64" else "x64"
    root = "msix/layout"
    os.makedirs(root + "/Assets", exist_ok=True)
    for exe in ("formvis.exe", "formvis-engine.exe"):
        shutil.copy(os.path.join("src-tauri", "target", "release", exe), root)
    py = os.path.join("backend", "venv", "Scripts", "python.exe")
    run([py, "-c", "from PIL import Image; im = Image.open('src-tauri/icons/icon.png').convert('RGBA'); "
         "[im.resize((s, s), Image.LANCZOS).save('" + root + "/Assets/' + n + '.png') for n, s in "
         "(('Square44x44Logo', 44), ('Square150x150Logo', 150), ('StoreLogo', 50))]"])
    with open(os.path.join("packaging", "msix", "AppxManifest.xml"), encoding="utf-8", newline="") as f:
        manifest = f.read()
    manifest = (manifest.replace("@MSIX_IDENTITY_NAME@", env["MSIX_IDENTITY_NAME"])
                .replace("@MSIX_PUBLISHER@", env["MSIX_PUBLISHER"])
                .replace("@MSIX_PUBLISHER_DISPLAY_NAME@", env.get("MSIX_PUBLISHER_DISPLAY_NAME", ""))
                .replace("@MSIX_VERSION@", version)
                .replace("@MSIX_ARCH@", arch))
    with open(os.path.join(root, "AppxManifest.xml"), "w", encoding="utf-8", newline="") as f:
        f.write(manifest + os.linesep)
    kits = os.path.join(env.get("ProgramFiles(x86)", r"C:\Program Files (x86)"), "Windows Kits", "10", "bin", "*", "x64", "makeappx.exe")
    found = sorted(glob.glob(kits))
    if not found:
        print("msix: makeappx.exe not found under " + kits, file=sys.stderr)
        return 1
    return subprocess.run([found[-1], "pack", "/d", root, "/p", f"msix/formvis_{version}_{arch}.msix", "/o"]).returncode


def cmd_linux_tar(args):
    data = sorted(glob.glob(f"src-tauri/target/release/bundle/deb/formvis_*_{args.debarch}/data"))
    if not data:
        print("linux-tar: no deb data folder for " + args.debarch, file=sys.stderr)
        return 1
    run(["tar", "-czf", f"formvis-linux-{args.arch}.tar.gz", "-C", data[0], "usr"])
    return 0


def cmd_portable_macos(args):
    run(["ditto", "-c", "-k", "--keepParent", os.path.join(args.release_dir, "bundle", "macos", "formvis.app"),
         f"formvis-portable-macos-{args.arch}.zip"])
    return 0


def cmd_riscv64(args):
    top = "formvis-linux-riscv64"
    root = f"{top}/usr/lib/formvis"
    for d in (f"{root}/backend", f"{root}/frontend", f"{top}/usr/bin", f"{top}/usr/share/applications"):
        os.makedirs(d, exist_ok=True)
    shutil.copytree("backend/app", f"{root}/backend/app", dirs_exist_ok=True)
    shutil.copy("backend/formvis_engine.py", f"{root}/backend/")
    shutil.copy("backend/requirements.txt", f"{root}/backend/")
    shutil.copytree("frontend/dist", f"{root}/frontend/dist", dirs_exist_ok=True)
    shutil.copytree("backend/app/profiles", f"{root}/backend/profiles", dirs_exist_ok=True)
    shutil.copy("packaging/linux/ai.nodemode.formvis.desktop", f"{top}/usr/share/applications/")
    launcher = f"{top}/usr/bin/formvis"
    lines = ["#!/bin/sh", 'here="$(cd "$(dirname "$0")/../lib/formvis" && pwd)"',
             'FORMVIS_DIST="$here/frontend/dist"; export FORMVIS_DIST',
             'cd "$here/backend" && exec python3 -m uvicorn app.main:app --host 127.0.0.1 --port "${FORMVIS_PORT:-8190}"']
    with open(launcher, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lines) + "\n")
    os.chmod(launcher, os.stat(launcher).st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    run(["tar", "-czf", f"{top}.tar.gz", "-C", top, "usr"])
    shutil.copy(f"{top}.tar.gz", "formvis-web.tar.gz")
    return 0


def tag_version(tag):
    t = tag.strip()
    if t.startswith("formvis-"):
        t = t[len("formvis-"):]
    return t.lstrip("v")


def cmd_feed(args):
    version = tag_version(args.tag)
    base = args.base_url if args.base_url.endswith("/") else args.base_url + "/"
    platforms = {}
    for key, pattern in FEED_TARGETS.items():
        for f in sorted(glob.glob(os.path.join(args.dir, "**", pattern), recursive=True)):
            if os.path.exists(f + ".sig"):
                with open(f + ".sig", encoding="utf-8") as s:
                    platforms[key] = {"signature": s.read().strip(), "url": base + os.path.basename(f)}
                break
    if not platforms:
        print("no updater signatures (TAURI_SIGNING_PRIVATE_KEY unset); latest.json not written")
        return 0
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import release_notes
    feed = {"version": version, "notes": release_notes.section("v" + version), "platforms": platforms,
            "pub_date": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
    with open(os.path.join(args.dir, "latest.json"), "w", encoding="utf-8") as f:
        json.dump(feed, f, indent=2)
    print("latest.json written for", ", ".join(platforms))
    return 0


def cmd_sums(args):
    import hashlib
    paths = []
    for base, _dirs, files in os.walk(args.dir):
        for name in files:
            full = os.path.join(base, name)
            rel = "./" + os.path.relpath(full, args.dir).replace(os.sep, "/")
            if os.path.basename(rel) != "SHA256SUMS":
                paths.append((rel, full))
    paths.sort(key=lambda p: p[0].encode("utf-8"))
    lines = []
    for rel, full in paths:
        h = hashlib.sha256()
        with open(full, "rb") as f:
            for chunk in iter(lambda: f.read(1 << 20), b""):
                h.update(chunk)
        lines.append(f"{h.hexdigest()}  {rel}\n")
    with open(os.path.join(args.dir, "SHA256SUMS"), "w", encoding="utf-8", newline="\n") as f:
        f.writelines(lines)
    print(f"SHA256SUMS written for {len(lines)} files")
    return 0


def cmd_zsync_info(args):
    print(f"gh-releases-zsync|{ZSYNC_OWNER}|{ZSYNC_REPO}|{ZSYNC_TAG}|formvis_*_{args.appimage}.AppImage.zsync")
    return 0


def parser():
    p = argparse.ArgumentParser(prog="package_desktop.py", description=__doc__.split("\n")[0])
    sub = p.add_subparsers(dest="cmd", required=True)

    def add(name, fn, help_text):
        sp = sub.add_parser(name, help=help_text)
        sp.set_defaults(fn=fn)
        return sp

    add("config", cmd_config, "print the merged Tauri --config JSON from the environment")
    sp = add("mac-archive", cmd_mac_archive, "name the macOS update archive by architecture")
    sp.add_argument("--arch", required=True)
    sp.add_argument("--release-dir", required=True)
    sp = add("notarize", cmd_notarize, "notarize and staple the DMGs")
    sp.add_argument("--release-dir", required=True)
    sp = add("portable-windows", cmd_portable_windows, "portable Windows zip")
    sp.add_argument("--arch", required=True)
    sp.add_argument("--release-dir", required=True)
    sp = add("msix", cmd_msix, "Microsoft Store package")
    sp.add_argument("--arch", required=True)
    sp = add("linux-tar", cmd_linux_tar, "Linux tar.gz from the deb data folder")
    sp.add_argument("--arch", required=True)
    sp.add_argument("--debarch", required=True)
    sp = add("portable-macos", cmd_portable_macos, "portable macOS zip")
    sp.add_argument("--arch", required=True)
    sp.add_argument("--release-dir", required=True)
    add("riscv64", cmd_riscv64, "riscv64 and web tar.gz (needs frontend/dist)")
    sp = add("feed", cmd_feed, "write latest.json")
    sp.add_argument("--tag", required=True)
    sp.add_argument("--base-url", required=True)
    sp.add_argument("--dir", default="bundles")
    sp = add("sums", cmd_sums, "write SHA256SUMS")
    sp.add_argument("--dir", default="bundles")
    sp = add("zsync-info", cmd_zsync_info, "print the AppImage update information")
    sp.add_argument("--appimage", required=True)
    return p


def main(argv):
    args = parser().parse_args(argv)
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
