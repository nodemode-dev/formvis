# Branching and release model

- **main** is always releasable. CI (`.github/workflows/ci.yml`) must pass before anything lands. No force-push to main.
- **Work branches** are short-lived and named by intent: `feat/<topic>`, `fix/<topic>`, `docs/<topic>`, `chore/<topic>`. Rebase on main before merging.
- **Commits** follow Conventional Commits with the version in the summary, for example `fix(frontend): keep dialog focus inside the scrim (0.1.1)`. The commit identity is `nodemode-ai <mackin@nodemode.ai>`.
- **Versions** are `v*.*.*` with dots, everywhere: `frontend/package.json`, `frontend/src/version.ts`, `backend/app/__init__.py`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, the README badge and the deliverable zip names. Bump all of them in the same commit.
- **Releases.** Pushing a tag `vX.Y.Z` on main runs `.github/workflows/desktop.yml`, which builds macOS, Linux and Windows bundles and opens a draft GitHub release. Review the draft, then publish it.
- **Wiki.** Edit pages in `.docs/wiki/`, never in the GitHub wiki UI. `.github/workflows/wiki.yml` publishes the folder when it changes on main. The wiki must have one page created by hand once before the first publish.
