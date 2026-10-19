# Licenses

The licence texts and copyright notices of the third-party software formvis ships. MIT, BSD and Apache-2.0 require them to travel with the binaries, so this folder is bundled into every installer (`bundle.resources` in `src-tauri/tauri.conf.json`) and sits in the repository.

`NOTICE.md` at the repository root is the index: it names each work, its licence and where it is used. This folder holds the texts.

| Path | Holds |
| --- | --- |
| `python/<distribution>/` | The licence files of every Python package in the engine's requirements tree (`backend/requirements.txt`), with the file names the package uses |
| `python-ml/<distribution>/` | The same for the optional ML extras (`requirements_ml.txt`, `requirements_sam2.txt` and `sam-2`), when they are installed in the build environment |
| `onnxruntime-ThirdPartyNotices.txt` | ONNX Runtime's notice for the software inside it |
| `npm/<package>/` | The licence files of the npm packages in the built bundle (the `dependencies` of `frontend/package.json` and what they depend on) |
| `rust/<crate>-<version>/` | Crate licence files, written only when cargo-about is not installed |
| `rust-src-tauri.html`, `rust-formvis-render.html` | The Rust crates of the desktop shell and of the native renderer, grouped by licence (cargo-about) |

Some Python packages ship no licence file in their wheels (flatbuffers, antlr4-python3-runtime, cuda-toolkit). The collector lists them when it runs; their texts are not invented here.

## Regenerate

From the repository root, with the engine's build environment installed (`./formvis install-all`, and `./formvis install-ml` for the extras):

    cargo install cargo-about --locked --features cli
    backend/venv/bin/python setup/collect_licenses.py

On Windows use `backend\venv\Scripts\python`. Name steps to run only some: `collect_licenses.py npm rust`.

The Python step reads the packages installed in the Python it runs under, so run it with the venv that matches the release. It follows the requirement files and skips pip, setuptools, wheel and pytest. Packages that are only for another platform (pywinpty on Windows) are collected when the script runs there.

The Rust step uses `src-tauri/about.toml` (the accepted licences) and `src-tauri/about.hbs` (the page template). Add a licence to `accepted` if cargo-about reports one it does not know.

Review `git status` afterwards and commit the folder with the release.
