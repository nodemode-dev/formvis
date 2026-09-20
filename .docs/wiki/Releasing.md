# Releasing

Desktop releases build in GitHub Actions (`.github/workflows/desktop.yml`) on every `v*.*.*` tag: macOS (Apple silicon), Linux (AppImage, deb, rpm) and Windows (MSI, NSIS). The release job collects the bundles into a draft GitHub release; publishing the draft makes it the one the updater feed points at.

## One-time setup: repository secrets

Add these under Settings, Secrets and variables, Actions. Builds work without them (unsigned, no updater artifacts); each group switches on its feature when present.

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

## One-time setup: the updater key pair

Generate it on your own machine, never in a shared environment, and keep the private key out of the repository:

```bash
cd frontend && npx tauri signer generate -w ~/.tauri/sonny.key
```

Put the private key file's contents in `TAURI_SIGNING_PRIVATE_KEY` and paste the printed public key into `plugins.updater.pubkey` in `src-tauri/tauri.conf.json`, then commit that one line. Until the public key is there, the app skips update checks entirely.

## Cutting a release

1. Bump the version in all six places (see `CLAUDE.md`), commit, and tag `vX.Y.Z`.
2. Push the tag. The workflow builds the three platforms, signs and notarizes the macOS app, and writes `latest.json` from the updater signatures.
3. Check the draft release's assets, then publish it. Installed apps see the update the next time they open and ask before installing.

## Notes

- The macOS bundle runs with the hardened runtime; `src-tauri/entitlements.plist` lets the PyInstaller engine sidecar load the libraries it unpacks at launch.
- Windows builds are unsigned until a code-signing certificate is available, so SmartScreen warns on first run.
- `.sonny` and `.ref` files are associated with the app; opening a clicked file in the running app is not built yet.
