# Contributing to FormVis

Thank you for helping. FormVis aims to be a free, layered image editor that runs in a
browser or on the desktop and keeps your pictures on your own computer, and it gets
there through real use and real contributions.

## Where to start

- **Use it and report what goes wrong.** A clear bug report, with steps, the version
  and your platform, is one of the most useful things you can give.
- **Look at the open issues.** Comment on one before starting larger work, so nobody
  builds the same thing twice.
- **Translations** are welcome: FormVis ships in thirty interface languages, with the
  tables in `frontend/src/ui/i18n`, and the Languages page of the wiki says how they
  work.

## Setting up

Clone the repository and run `./formvis install`, then `./formvis boot` (or
`formvis.bat install` and `formvis.bat boot` on Windows). The first installs what the
engine and the interface need; the second starts both. `./formvis help` lists every
command, and the README's Quick Start has the details and the requirements.

The code lives in:

| Folder | What is there |
| --- | --- |
| `backend/app` | the engine (Python, FastAPI): files, imaging, projects, models, MCP |
| `native/formvis-render` | the Rust renderer and its command line |
| `frontend/src` | the interface (TypeScript, Vite): the document engine, tools and UI |
| `src-tauri` | the desktop shell (Rust, Tauri) |
| `setup` | install, build, packaging and agent scripts |
| `backend/tests`, `frontend/tests`, `e2e` | the engine tests, the window smoke test and the browser tests |
| `.docs/wiki` | the wiki's source, published on push |

## Before you open a pull request

Run the same checks CI runs:

```sh
(cd frontend && npm ci && npm audit --audit-level=low && npm test && npm run build)
(cd frontend && npx tsc --noEmit -p .)
python -m compileall -q backend/app backend/formvis_engine.py setup e2e
(cd backend && python formvis_engine.py --selfcheck)
(cd backend && python -m pytest -q -rs -p no:cacheprovider tests)
python -m pytest -q -p no:cacheprovider frontend/tests/window
```

The engine tests need `backend/requirements.txt` and `backend/requirements-test.txt`;
the window smoke test needs the built window and Playwright's Chromium. CI also checks
the shell scripts with `bash -n` and refuses an em dash in tracked Markdown or an
emoji in any tracked text. The browser tests in `e2e` run only when started by hand;
run them after changes to the interface, the engine or the suite.

- Keep each pull request to one change, with tests for what it adds or fixes.
- Write commit subjects the way the history does, in Conventional Commits:
  `feat(frontend): ...`, `fix(backend): ...`, `docs(...)` (see
  [.docs/BRANCHING.md](.docs/BRANCHING.md)). Leave the version alone; the maintainer
  bumps it when releasing.
- Interface text goes through the translation tables, and every command needs its
  words: `./formvis counts --commands --check` fails while any command lacks them.
- After changing the MCP tools or adding or renaming commands, run
  `./formvis agents sync`; `./formvis agents sync --check` fails while the skills
  drift.
- `./formvis counts --check` keeps the README's sizes honest, and fails on features
  the project has declined, on cloud providers other than fal and on the banned
  sparkle icon. `CLAUDE.md` lists what is declined and why.
- Every new dependency, binary, model, font or data file gets a row in `NOTICE.md`
  before it is used.
- Other vendors' product names appear only to name a file format or compatibility.
  Never copy vendor help text, icons, brushes, presets or profiles.

## How changes land

Only the maintainer pushes to `main`. Everyone else forks the repository and opens a pull request into `main`. A pull request merges when all six checks pass on an up-to-date branch and the maintainer has approved it after its last push.

## Releases

A release is a version, and only the maintainer makes one: after the version is bumped on
`main`, the maintainer cuts a `compile_vX.Y.Z` branch, and formcompiler
(`nodemode-dev/formcompiler`) builds every platform and publishes them together. No
push from a contributor starts a release. See [.docs/BRANCHING.md](.docs/BRANCHING.md)
and the Releasing page of the wiki.

## Licensing

FormVis is licensed under the Apache License, Version 2.0 ([LICENSE](LICENSE), SPDX
`Apache-2.0`). By contributing, you agree that your contribution is licensed under
the same terms. Only add code you have the right to contribute, and name any
third-party code and its licence in the pull request.

## Patents and other people's IP

A feature may be held back or removed if it would infringe someone else's patent or
other intellectual property. The maintainers decide.

## Conduct

Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md). Security
problems go through [SECURITY.md](SECURITY.md), never a public issue.
