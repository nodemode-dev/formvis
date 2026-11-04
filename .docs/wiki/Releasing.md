# Releasing

formvis builds nothing in its own repository. After the version bump lands on main, push a branch `compile_vX.Y.Z` cut from main's head. formcompiler (nodemode-dev/formcompiler) picks it up on its 8-hourly watch or a manual run, builds every target with `setup/package_desktop.py` (macOS, Linux with AppImage, deb and rpm, Windows with MSI and NSIS), and opens a draft release `formvis-vX.Y.Z` on its release page at https://github.com/nodemode-dev/formcompiler/releases for review. formcompiler holds the Apple and Windows signing identities and the updater key. The app reads updates from formcompiler's `formvis-updates` feed.

## One-time setup: formcompiler secrets

Add these to the formcompiler repository (Settings, Secrets and variables, Actions), not to formvis. Builds work without them (unsigned, no updater artifacts); each group switches on its feature when present.

| Secret | What it is |
| --- | --- |
| `APPLE_CERTIFICATE` | Your Developer ID Application certificate exported as `.p12`, then base64-encoded (`base64 -i cert.p12`) |
| `APPLE_CERTIFICATE_PASSWORD` | The password chosen when exporting the `.p12` |
| `APPLE_SIGNING_IDENTITY` | The certificate's name, for example `Developer ID Application: Your Name (TEAMID)` |
| `APPLE_ID` | The Apple ID email used for notarization |
| `APPLE_PASSWORD` | An app-specific password for that Apple ID (appleid.apple.com, Sign-In and Security) |
| `APPLE_TEAM_ID` | Your ten-character team ID |
| `TAURI_SIGNING_PRIVATE_KEY` | The updater private key (below) |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Its password, if you set one |
| `WINDOWS_CERTIFICATE` | A code-signing certificate exported as `.pfx`, base64-encoded; the Windows jobs import it and sign the exe, MSI and setup |
| `WINDOWS_CERTIFICATE_PASSWORD` | The `.pfx` password |

Repository variables (Settings, Secrets and variables, Variables) switch on the Microsoft Store package: `MSIX_IDENTITY_NAME`, `MSIX_PUBLISHER` and `MSIX_PUBLISHER_DISPLAY_NAME`, all from Partner Center, Product identity. The Store signs the package itself, so no key is stored for it.

## One-time setup: the updater key pair

Generate it on your own machine, never in a shared environment, and keep the private key out of the repository:

```bash
cd frontend && npx tauri signer generate -w ~/.tauri/formvis.key
```

Put the private key file's contents in `TAURI_SIGNING_PRIVATE_KEY` and paste the printed public key into `plugins.updater.pubkey` in `src-tauri/tauri.conf.json`, then commit that one line. Until the public key is there, the app skips update checks entirely.

## Cutting a release

1. Bump the version in all eight places (see `CLAUDE.md` and the release-keeper skill) and let it land on main.
2. Push a branch `compile_vX.Y.Z` cut from main's head.
3. formcompiler builds the targets, signs and notarizes the macOS app, and writes `latest.json` from the updater signatures with `setup/package_desktop.py feed`.
4. Check the draft release `formvis-vX.Y.Z` on formcompiler's release page, then publish it. Installed apps see the update the next time they open and ask before installing.

## Running it by hand

Run formcompiler's workflow manually and give it the branch. When a stable release is published, the publishing pipeline copies its `latest.json` and AppImage `.zsync` files to the download store, and the app's updater endpoint (`https://dl.formai.studio/formvis/updates/latest.json`, which formcompiler writes into the build) reads it there. The AppImage update information is printed by `python3 setup/package_desktop.py zsync-info --appimage ARCH`: the newest release on nodemode-dev/formvis, matching `FormVis_*_ARCH.AppImage.zsync`. Nothing is published or tagged in the formvis repository.

Builds per run: macOS Apple silicon and Intel (separate DMGs; a universal DMG would need the PyInstaller engine built as one universal binary, which is not done), Linux x64 and arm64 (AppImage, deb, rpm, tar.gz), Windows x64 and arm64 (MSI, NSIS setup, portable zip, and the Store package when its variables exist). The Intel macOS, Linux arm64 and Windows arm64 jobs are marked experimental: if one fails the others still release. Windows x86 is not built: it needs a 32-bit Python and Rust target and every engine dependency in a 32-bit wheel, none of which is checked.

## Turning the updater on (owner steps)

The updater stays off until you do all three: generate the key pair (above), paste the public key into `plugins.updater.pubkey` in `src-tauri/tauri.conf.json`, and add the private key as the `TAURI_SIGNING_PRIVATE_KEY` secret in formcompiler. formcompiler then builds updater artifacts and writes `latest.json` for every platform that has a signature. Help, Check for Updates says "no update key" until the public key is there.

## Portable Windows zip and Linux checks

A file named `portable` or `portable.txt` beside the engine makes it keep everything in a `FormvisData` folder there, and the shell moves the web view's data into the same folder. The zip carries `portable.txt`. `FORMVIS_PORTABLE=1` or `--portable` does the same for a source checkout.

`./formvis libcheck [--dialogs]` (Linux) names the shared libraries the desktop program cannot find and what the file dialogs need; the deb installs the same script as `/usr/share/formvis/libcheck`, and `./build_app --open` runs it first. A program missing a library never reaches its own code, so the check also runs before it starts: `formvis-launch` (the deb installs it as `/usr/bin/formvis-launch`; it lives in `packaging/linux/`) runs libcheck on the program, shows the missing libraries and the install command with zenity, kdialog or notify-send (whichever exists; it always prints them), and starts formvis only when nothing is missing. For an AppImage run `FORMVIS_PROGRAM=/path/formvis.AppImage formvis-launch`, which checks the window's libraries by name (`libcheck --names`); `FORMVIS_SKIP_LIBCHECK=1` skips the check. `libcheck --dialogs` also says when neither zenity nor kdialog is installed (formvis's own dialogs are GTK and do not need them), and when a file dialog closes at once the shell shows and prints the same facts (session, display, session bus). One running window owns each data folder on Linux: a second launch on the same folder hands its files to that window, and a launch on another folder (`--user-data-dir`, `FORMVIS_DATA_DIR`, portable) opens its own. Help, System Info lists graphics memory when `nvidia-smi` (or, on Windows, the performance counters) can read it.

## Notes

- The macOS bundle runs with the hardened runtime; `src-tauri/entitlements.plist` lets the PyInstaller engine sidecar load the libraries it unpacks at launch.
- Windows builds are unsigned until a code-signing certificate is available, so SmartScreen warns on first run.
- `.fmv` and `.formvis` (older projects) files are associated with the app; opening a clicked file in the running app is not built yet.
