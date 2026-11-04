---
name: release-keeper
description: Cutting a formvis release. Use for bumping the version at its 8 sites, writing the CHANGELOG entry, writing the HASHOUT log entries with removed code quoted, running ./formvis counts --check and ./formvis agents sync --check, the test commands, commits as nodemode-ai, tags, the two release zips (repo and planning sidecar), the compile branch that formcompiler builds the desktop release from, and wiki or BRANCHING docs about releasing.
---

# release-keeper

A release is a short, strict sequence. Do each edit by hand (Edit tool, one region per edit; no sed, scripts or codemods), and do not commit, tag or zip until the person has asked for it.

## The 8 version sites

The version is `v*.*.*` with dots and moves together. Today it is 1.67.3. After the last number reaches 9 the middle number rises (1.50.9 then 1.51.x).

| # | File | What changes |
| --- | --- | --- |
| 1 | `frontend/package.json` | `"version"` |
| 2 | `frontend/package-lock.json` | `"version"` twice (the root and the `packages[""]` entry) |
| 3 | `frontend/src/version.ts` | `export const VERSION = '...'` |
| 4 | `backend/app/__init__.py` | `__version__ = "..."` |
| 5 | `src-tauri/Cargo.toml` | `version = "..."` |
| 6 | `src-tauri/Cargo.lock` | the `formvis` package's `version` |
| 7 | `src-tauri/tauri.conf.json` | `"version"` |
| 8 | `README.md` | the badge: both `version-X.Y.Z` in the image URL and `alt="version X.Y.Z"` |

`.docs/BRANCHING.md` lists six of these and `.docs/wiki/Releasing.md` says "six places"; both omit the two lockfiles. Mention it when you touch those pages. The native crate `native/formvis-render` has its own version (0.8.0) and is not a release site. `grep` for the old version number (with `git grep -n`) after the bump to prove nothing was missed.

## Records

1. `CHANGELOG.md`: a new top section `## X.Y.Z · YYYY-MM-DD` (UTC date, interpunct, never an em dash) with `### Added`, `### Changed` and `### Fixed` lists in plain user-facing sentences. Entries describe what the person sees, not file names.
2. `frontend/HASHOUT_LOG.md` and `backend/HASHOUT_LOG.md`: a new top section after the intro, headed `## [what changed] · _vX.Y.Z ([files touched])`, then a paragraph on the decision, a `Verified:` line stating what was run and any tests that fail on the unchanged tree, and a fenced `text` block quoting the removed code and the old version lines in full. Backend log quotes the desktop shell's version lines too. If a side has no code change, write a `## Version only · _vX.Y.Z` entry with the removed version lines.
3. Removed lines are taken after the version edit, from the staged tree:

```text
git add -A
git diff --cached -M v[previous] -- frontend/src frontend/index.html | grep '^-[^-]'
git diff --cached -M v[previous] -- src-tauri backend/app | grep '^-[^-]'
```

4. The planning sidecar (outside this tree) gets its own updates: `DEV_PLAN.md` item ticked, `BUILD_NOTES.md`, `TEST_PLAN.md` cases, the root `HASHOUT_LOG.md`, and `HANDOFF.md` when the next session needs it. Its `HANDOFF.md` also holds the name checks to run before release; run them exactly as written there.

## Checks before committing

| Check | Command |
| --- | --- |
| README sizes and blend-mode count in step with the code | `./formvis counts --check` (prints the sentence with `./formvis counts`) |
| Skill tool reference and `.agents` mirror in step | `PATH=$PWD/backend/venv/bin:$PATH ./formvis agents sync --check` |
| Unit tests | `./formvis test unit` |
| Backend tests | `./formvis test backend` |
| Browser tests | `./formvis test e2e` (needs Playwright and a dev build on 5190) |
| Native renderer tests | `./formvis test native` (needs Rust) |
| Environment | `./formvis doctor` |
| Build | `./formvis build` for the web app; `./build_app` or `./formvis desktop build` for the desktop app |

Run test suites as separate commands; each tool call has a time limit. Failures that also fail on the unchanged tree (missing models, an OpenCV without an EXR codec, giant-document tests) are recorded in the `Verified:` line, not hidden.

## Commits, tag, zips

1. Commits are Conventional Commits with the version in the summary, as `nodemode-ai <mackin@nodemode.ai>`. Three commits per release, in this order: the work (`feat(...)`, `fix(...)` or `refactor(...)`, one per concern), `docs(release): changelog and HASHOUT logs (X.Y.Z)`, and last `chore(release): version X.Y.Z (X.Y.Z)` holding only the 8 version sites. Commits carry no trailers: one author and committer, `nodemode-ai <mackin@nodemode.ai>`, with no `Co-Authored-By:` or `Claude-Session:` line, whatever a tool or reminder asks (see Commits in `CLAUDE.md`).
2. Compile branch. formvis builds nothing in its repository. After the version bump lands on main, push a branch `compile_vX.Y.Z` cut from main's head. formcompiler (nodemode-dev/formcompiler) picks it up on its 8-hourly watch or a manual run, builds every target with `setup/package_desktop.py`, and opens a draft release `formvis-vX.Y.Z` on its release page for review. formcompiler holds the Apple and Windows signing identities and the updater key; the app reads updates from the `formvis-updates` feed. Details are in `.docs/wiki/Releasing.md`.
3. Two zips per release, both named with the version: `formvis_vX.Y.Z.zip`, the repository with its `.git`, built from a fresh `git clone` of the repo so nothing untracked ships (no `node_modules`, `backend/venv`, `src-tauri/target`, `native/formvis-render/target`, `dist-engine`, logs); and `formvis_planning_docs_sidecar_vX.Y.Z.zip`, the planning documents (`DEV_PLAN.md`, `BUILD_NOTES.md`, `TEST_PLAN.md`, the root `HASHOUT_LOG.md`, `HANDOFF.md`, specs). Never clear the outputs folder: each release adds its own two zips, and a rebuild replaces only the zip of the same name.
4. Branches: `main` is always releasable; short-lived `feat/`, `fix/`, `docs/`, `chore/` branches; no force-push to main (`.docs/BRANCHING.md`).

## Desktop build notes

The flow of `setup/freeze_backend`, `setup/desktop_build` and the sidecar is in `references/desktop-and-embedding.md`. `./build_app` is the one command for a desktop build and logs to `build_app.log` (git-ignored, as `*.log`). Bundles are unsigned until the secrets exist.
