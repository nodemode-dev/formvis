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
  [.docs/BRANCHING.md](.docs/BRANCHING.md)). Leave the version alone; a maintainer
  bumps it when releasing.
- Interface text goes through the translation tables, and every command needs its
  words: `./formvis counts --commands --check` fails while any command lacks them.
- After changing the MCP tools or adding or renaming commands, run
  `./formvis agents sync`; `./formvis agents sync --check` fails while the skills
  drift.
- `./formvis counts --check` keeps the README's sizes honest, and fails on features
  the project has declined, on cloud providers other than fal and on the banned
  sparkle icon.
- Some features were declined for patent risk and will not be added back:
  Content-Aware Scale by seam carving and its skin-tone protection, Poisson blending
  after Content-Aware Fill, a live fill of the vacated area during a Content-Aware
  Move drag, a painted sampling area that limits where Selection-Aware Fill takes
  patches from (it only weights them), and a face mesh behind Liquify's face tools.
- Every new dependency, binary, model, font or data file gets a row in `NOTICE.md`
  before it is used.
- Other vendors' product names appear only to name a file format or compatibility.
  Never copy vendor help text, icons, brushes, presets or profiles.

## Maintainers

FormVis is maintained by:

- the [nodemode-dev](https://github.com/nodemode-dev) organisation on GitHub
- [@nodemode-ai](https://github.com/nodemode-ai)
- [@gbarnai](https://github.com/gbarnai)

Reach them through issues and pull requests.

## How changes land

Only a maintainer pushes to `main`. Everyone else forks the repository and opens a pull request into `main`. A pull request merges when all six checks pass on an up-to-date branch and a maintainer has approved it after its last push.

## Releases

A release is a version, and only a maintainer makes one: after the version is bumped on
`main`, a maintainer cuts a `compile_vX.Y.Z` branch, and formcompiler
(`nodemode-dev/formcompiler`) builds every platform and publishes them together. No
push from a contributor starts a release. See [.docs/BRANCHING.md](.docs/BRANCHING.md)
and the Releasing page of the wiki.

## Licensing

FormVis is licensed under the Apache License, Version 2.0 ([LICENSE](LICENSE), SPDX
`Apache-2.0`). By contributing, you agree that your contribution is licensed under
the same terms. Only add code you have the right to contribute, and name any
third-party code and its licence in the pull request.

## Patents and other people's IP

Some features are deliberately not built, or were taken out, because they come too close to someone else's patent, trademark, copyright or design. The maintainers hold that line with counsel; contributors do not decide it, and nobody here redesigns a feature on their own reading of a patent. This is engineering diligence, not legal advice.

### Features this project will not implement

- Content-aware scale: resizing a picture by removing or inserting low-energy pixel paths (seam carving, retargeting, liquid rescale), and skin-tone protection or protected regions for it. Not built, and not to be added in any form, under any name, in this code or through a dependency, plug-in or model. It was removed from formvis and must not come back; a request for it is declined.
- Gradient-domain (Poisson) blending after the adaptive fill, and a live fill of the vacated area while a content-aware move is being dragged.
- A painted or user-edited area that limits where the fill may take patches from. The painted sampling area is a preference weight only; the search always covers the rest of the picture, and no command, tool or parameter limits the fill to an area.
- A face mesh in Liquify's face tools. Find faces and the face sliders never build, fit or warp a mesh of the face and use no dense landmark model; the warps stay on the generic grid, placed from the detected landmarks.

A pull request that adds one of these, under any name, through any dependency, plug-in, model, template, agent tool or plain code, is closed with a link to this section. Lifting a decline needs the maintainers' written decision after a review, recorded here first.

### Rules for every contribution

- Patents: do not add a feature, or a dependency that provides one, that reproduces a method you know to be patented. If you are unsure, open an issue that describes what the feature does, not which patent it resembles. Patent numbers stay out of code, commits, comments, logs and changelogs.
- Trademarks: other vendors' product and feature names appear only to name a file format or compatibility ("opens <format> files", "for use with"). No command, menu, panel, tool, preset, template, theme or agent tool takes another product's feature name, and no text says "like X" or "the way X does it". Describe what the feature does.
- Copyright: never copy another product's help, tooltip, dialog or documentation text (link to it instead); never trace or import vendor icons; never bundle vendor templates, themes, presets, brushes, swatches, LUTs, materials, sample files, sound libraries, stock media or fonts; colour-book names only when reading a person's file. Compatibility layers carry names and signatures only. Test fixtures come from this repository's own scripts.
- Licences: every new dependency, binary, model, font, profile or data file gets a row in `NOTICE.md` before it is used. GPL stays outside the distributed bundle, AGPL nowhere, LGPL dynamically linked and replaceable, MPL files unedited. CC BY credited, CC BY-SA only unmodified, CC NC and ND never. Models with gated or non-commercial terms are optional downloads, never bundled.
- Licence conditions: formvis reads DNG under a specification patent licence whose condition is a prominent notice: the DNG notice stays in the About box, in the ledger and in the README while the app reads DNG.

## Conduct

Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md). Security
problems go through [SECURITY.md](SECURITY.md), never a public issue.
