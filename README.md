<p align="center">
  <img src="assets/app-icon/formvis-256.png" width="128" height="128" alt="FormVis icon: the Form family layered-image mark">
</p>

<h1 align="center">FormVis</h1>

<p align="center">
  <b>Image editing; the layered photo editor of the Form family.</b><br>
  Layers, masks, blend modes, adjustment layers, layer styles and PSD files,<br>
  with local generation, on your own machine. No account, and agents can edit over MCP.
</p>

<p align="center">
  <img alt="version 1.99.1" src="https://img.shields.io/badge/version-1.99.1-eef0f4?style=flat-square">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-Vite-3178c6?style=flat-square&logo=typescript&logoColor=white">
  <img alt="Python" src="https://img.shields.io/badge/Python-FastAPI-3776ab?style=flat-square">
  <img alt="macOS, Windows, Linux" src="https://img.shields.io/badge/macOS%20%C2%B7%20Windows%20%C2%B7%20Linux-native-2f7bf5?style=flat-square">
  <img alt="License: Apache-2.0" src="https://img.shields.io/badge/license-Apache--2.0-3a3a3a?style=flat-square">
  <img alt="Status: alpha" src="https://img.shields.io/badge/status-alpha-d69e2e?style=flat-square">
</p>

<p align="center">
  <a href="https://formvis.formai.studio/"><b>Download FormVis on formai.studio</b></a> ·
  <a href="#run-it-from-source">Run it from source</a> ·
  <a href="#the-form-family">All Form apps</a>
</p>

<br>

<p align="center">
  <img src="docs/images/formvis-hero.webp" alt="FormVis with a rainy city street at dusk open in the document form-city-fill-&-relight: the Relight panel with a soft cool key light from the upper right and a faint warm rim, the neon FORM CITY and FORM FORM signs still crisp red and readable, and the Relight layer above the photo in the layers panel" width="100%">
  <br>
  <sub>Relight at work: a cool key and a warm rim placed on the photo, with the neon left untouched; their controls are in the Properties panel and the Relight layer sits above the original.</sub>
</p>

<p align="center">
  <a href="#features">Features</a> ·
  <a href="#everything-in-the-box">In the box</a> ·
  <a href="#built-for-agents">Agents</a> ·
  <a href="#under-the-hood">Under the hood</a> ·
  <a href="#download">Download</a> ·
  <a href="#run-it-from-source">Run from source</a> ·
  <a href="#the-form-family">Form family</a>
</p>

<br>

<table>
  <tr>
    <td width="25%" valign="top"><h3>Layered</h3>Stack photos in folders, mask and clip them, and blend with 27 blend modes. History keeps 100 steps.</td>
    <td width="25%" valign="top"><h3>Non-destructive</h3>Adjustment layers, layer styles and smart objects stay editable, and layered PSD and PSB files open and save.</td>
    <td width="25%" valign="top"><h3>Local AI</h3>Krea 2 Turbo, FLUX.2 klein, LaMa and Real-ESRGAN run on this computer, with no key and no cost.</td>
    <td width="25%" valign="top"><h3>Agent-ready</h3>The same command catalogue drives the window, a command line and an MCP server for Claude Code, Codex and Cursor.</td>
  </tr>
</table>

<br>

## Features

<table>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/images/formvis-levels.png" alt="The Levels adjustment layer dialog with a histogram over a meadow photo" width="100%">
      <br><sub>A Levels adjustment layer with a live histogram and preview.</sub>
      <h3>Adjustments that stay editable</h3>
      Levels, Curves, Hue/Saturation and more sit above your pixels as layers. Change or hide them any time.
    </td>
    <td width="50%" valign="top">
      <img src="docs/images/formvis-type.webp" alt="The Type tool placing editable text on an orange abstract image" width="100%">
      <br><sub>The Type tool with its options bar, and the full panel layout.</sub>
      <h3>Tools, type and panels</h3>
      Select, paint, heal, retouch, draw paths and set type. Arrange the tool bar and panels your way.
    </td>
  </tr>
</table>

## Everything in the box

<table>
  <tr>
    <td width="33%" valign="top"><h4>Edit</h4>Layers · Masks · Clipping · Folders · Fill layers · Selections · Paths · Smart objects · Layer styles · Timeline and GIF</td>
    <td width="33%" valign="top"><h4>Adjust and generate</h4>Levels · Curves · Hue/Saturation · Exposure · Vibrance · Color Lookup · Filter Gallery · Healing · Generative Fill and Expand · Upscale · Background removal</td>
    <td width="33%" valign="top"><h4>Formats</h4>Opens: PSD · PSB · HEIC · TIFF · camera RAW · EXR · HDR · DPX · QOI · TGA · ICO · Saves: PNG · JPEG · PSD · TIFF · GIF · Native: <code>.fvd</code></td>
  </tr>
</table>

## Built for agents

The window, the command line and the MCP server call the same command catalogue, so what you can click an agent can run.

```sh
./formvis cli list                     # every command of the open window
./formvis cli describe adjust.apply    # what a command takes, with its parameters
./formvis mcp                          # MCP server on stdio for Claude Code, Codex and Cursor
```

`.mcp.json`, `.codex/config.toml` and `.cursor/mcp.json` are already wired in this repo. See [`AGENTS.md`](AGENTS.md).

## Under the hood

- **Engine:** a FastAPI service for decoding, colour, PSD and the local models on ONNX Runtime.
- **Editor:** vanilla TypeScript and Vite, with a DOM-free document engine; a Tauri 2 shell starts the engine as a sidecar.
- **Drawing:** WebGPU or WebGL2, falling back to the CPU per document.
- **Size:** about 166,800 lines of TypeScript, 2,400 of CSS, 22,500 of Python and 6,700 of Rust (product code, tests excluded; `./formvis counts --check` verifies it).
- **Tested:** unit, backend and browser suites, run with `./formvis test`.

## Download

**Get the app:** download FormVis from [formai.studio](https://formvis.formai.studio/). That is the easiest way to install it.

**Releases:** builds are published in [FormCompiler's releases](https://github.com/nodemode-dev/formcompiler/releases?q=formvis-v&expanded=true).

**Keep it updated:** [FormPortal](https://github.com/nodemode-dev/formportal) installs, updates and rolls back every Form app from the same signed catalogue.

| Platform | Builds |
|---|---|
| macOS Apple silicon · Linux x64 · Windows x64 | desktop app |

All FormVis builds are compiled and released from [`nodemode-dev/formcompiler`](https://github.com/nodemode-dev/formcompiler/releases), not from this repo. This repo holds the source.

## Run it from source

Prefer it in your browser, or want to contribute? Run the web UI straight from this repo.

**Requires:** Node 20.19 or newer, Python 3.10 or newer and git. The desktop shell also needs Rust and the Tauri 2 system packages.

```sh
git clone git@github.com:nodemode-dev/formvis.git
cd formvis
./formvis install   # installs the engine, the local-model runtime and the frontend
./formvis boot      # web UI at http://localhost:5190
```

`./formvis desktop dev` opens the desktop window instead.

On Windows use `formvis.bat install` and `formvis.bat boot`. The engine listens on http://127.0.0.1:8190; `FORMVIS_DATA_DIR` moves the project library (default `~/Formvis`).

> [!IMPORTANT]
> **Status:** alpha. The desktop bundles and the GPU paths on real hardware are not verified yet; see [`CHANGELOG.md`](CHANGELOG.md) and [`docs/ALPHA_REVIEW.md`](docs/ALPHA_REVIEW.md).

**Contributing:** branch from `main`, keep changes to source here, and leave packaging and releases to FormCompiler. See [`.docs/BRANCHING.md`](.docs/BRANCHING.md) and [`AGENTS.md`](AGENTS.md).

## Repository

| Path | What it is |
|---|---|
| `backend/` | FastAPI engine: routers, imaging, project format, local models |
| `frontend/` | Vite app: document engine, tools, GPU display, UI shell |
| `native/` · `src-tauri/` | The Rust wgpu renderer · the Tauri 2 desktop shell |
| `setup/` · `e2e/` · `docs/` | Scripts behind `./formvis` · browser tests · manual and README images |

Docs: [`.docs/wiki`](.docs/wiki) · Agents: [`CLAUDE.md`](CLAUDE.md), [`AGENTS.md`](AGENTS.md) · Contributing: [`.docs/BRANCHING.md`](.docs/BRANCHING.md)

## The Form family

FormVis is one of the **Form apps**: native creative tools that install, update and roll back through FormPortal and can all be driven by agents.

| | App | What it's for | Download | Code |
|:-:|---|---|---|---|
| <img src=".github/assets/family/form.md.png" alt="" width="32" height="32"> | **form.md** | Documents, databases and realtime editing together | [formai.studio](https://formmd.formai.studio/) | [GitHub](https://github.com/nodemode-dev/form.md) |
| <img src=".github/assets/family/format.png" alt="" width="32" height="32"> | **FormAT** | Chat and agent workspace on your key | [formai.studio](https://format.formai.studio/) | [GitHub](https://github.com/nodemode-dev/format) |
| <img src=".github/assets/family/formCAD.png" alt="" width="32" height="32"> | **FormCAD** | Drafting, parametric parts and NURBS surfaces | | [GitHub](https://github.com/nodemode-dev/formCAD) |
| <img src=".github/assets/family/formcel.png" alt="" width="32" height="32"> | **FormCel** | Spreadsheets agents can read and edit | [formai.studio](https://formcel.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formcel) |
| <img src=".github/assets/family/formcraft.png" alt="" width="32" height="32"> | **FormCraft** | Generate images, video, audio, 3D and worlds | | [GitHub](https://github.com/nodemode-dev/formcraft) |
| <img src=".github/assets/family/formcut.png" alt="" width="32" height="32"> | **FormCut** | Multi-track video editing with no upload | [formai.studio](https://formcut.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formcut) |
| <img src=".github/assets/family/formDAM.png" alt="" width="32" height="32"> | **FormDAM** | Photo library and asset manager | [formai.studio](https://formdam.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formDAM) |
| <img src=".github/assets/family/formdeck.png" alt="" width="32" height="32"> | **FormDeck** | Presentations and pitch decks | [formai.studio](https://formdeck.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formdeck) |
| <img src=".github/assets/family/formdesign.png" alt="" width="32" height="32"> | **FormDesign** | Page layout for print and the web | [formai.studio](https://formdesign.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formdesign) |
| <img src=".github/assets/family/formencoder.png" alt="" width="32" height="32"> | **FormEncoder** | Media encoding queue with presets | [formai.studio](https://formencoder.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formencoder) |
| <img src=".github/assets/family/formfabric.png" alt="" width="32" height="32"> | **FormFabric** | Sewing patterns draped with cloth simulation | | [GitHub](https://github.com/nodemode-dev/formfabric) |
| <img src=".github/assets/family/formlit.png" alt="" width="32" height="32"> | **FormLit** | Photo library and raw development | [formai.studio](https://formlit.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formlit) |
| <img src=".github/assets/family/formmorpheus.png" alt="" width="32" height="32"> | **FormMorpheus** | Frame-by-frame and performed animation | | [GitHub](https://github.com/nodemode-dev/formmorpheus) |
| <img src=".github/assets/family/formNET.png" alt="" width="32" height="32"> | **FormNET** | See what your computer sends online | | [GitHub](https://github.com/nodemode-dev/formNET) |
| <img src=".github/assets/family/formpath.png" alt="" width="32" height="32"> | **FormPath** | Vector illustration with artboards and type | [formai.studio](https://formpath.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formpath) |
| <img src=".github/assets/family/formpdf.png" alt="" width="32" height="32"> | **FormPDF** | Edit, redact, sign and fill PDFs | [formai.studio](https://formpdf.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formpdf) |
| <img src=".github/assets/family/formpromo.png" alt="" width="32" height="32"> | **FormPromo** | Promo films from your own media | [formai.studio](https://formpromo.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formpromo) |
| <img src=".github/assets/family/formref.png" alt="" width="32" height="32"> | **FormRef** | Reference boards for creative work | [formai.studio](https://formref.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formref) |
| <img src=".github/assets/family/formrig.png" alt="" width="32" height="32"> | **FormRig** | Rig, skin and retarget any mesh | | [GitHub](https://github.com/nodemode-dev/formrig) |
| <img src=".github/assets/family/formsculpt.png" alt="" width="32" height="32"> | **FormSculpt** | 3D sculpting, remeshing and painting | [formai.studio](https://formsculpt.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formsculpt) |
| <img src=".github/assets/family/formsurface.png" alt="" width="32" height="32"> | **FormSurface** | Texture painting with PBR export | [formai.studio](https://formsurface.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formsurface) |
| <img src=".github/assets/family/formtools.png" alt="" width="32" height="32"> | **FormTools** | Viewers, batch tools and file utilities | | [GitHub](https://github.com/nodemode-dev/formtools) |
| <img src=".github/assets/family/formtxt.png" alt="" width="32" height="32"> | **FormTxt** | Word processing with .docx round trips | [formai.studio](https://formtxt.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formtxt) |
| <img src=".github/assets/family/formvfx.png" alt="" width="32" height="32"> | **FormVFX** | Motion graphics and VFX compositing | [formai.studio](https://formvfx.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formvfx) |
| <img src=".github/assets/family/formvis.png" alt="" width="32" height="32"> | **FormVis** | Layered image editing with local AI | [formai.studio](https://formvis.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formvis) |
| <img src=".github/assets/family/formwav.png" alt="" width="32" height="32"> | **FormWav** | Multitrack audio editing and mixing | [formai.studio](https://formwav.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formwav) |
| <img src=".github/assets/family/formweb.png" alt="" width="32" height="32"> | **FormWeb** | Visual website building with a CMS | [formai.studio](https://formweb.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formweb) |
| <img src=".github/assets/family/formportal.png" alt="" width="32" height="32"> | **FormPortal** | Install, update and roll back Form apps | [formai.studio](https://formportal.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formportal) |
| <img src=".github/assets/family/formtray.png" alt="" width="32" height="32"> | **FormTray** | One dock icon for every app | [formai.studio](https://formtray.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formtray) |
| <img src=".github/assets/family/formMCP.png" alt="" width="32" height="32"> | **FormMCP** | One MCP connection to the family | [formai.studio](https://formmcp.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formMCP) |
| <img src=".github/assets/family/formskills.png" alt="" width="32" height="32"> | **FormSkills** | Every app's agent skills in one place | [formai.studio](https://formskill.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formskills) |
| <img src=".github/assets/family/formbench.png" alt="" width="32" height="32"> | **FormBench** | Parity, testing and rankings for the family | [formai.studio](https://formranker.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formbench) |
| <img src=".github/assets/family/formslot.png" alt="" width="32" height="32"> | **FormSlot** | Codebase memory for coding agents | | [GitHub](https://github.com/nodemode-dev/formslot) |
| <img src=".github/assets/family/subform.png" alt="" width="32" height="32"> | **SubForm** | Workbench for parallel Claude Code agents | | [GitHub](https://github.com/nodemode-dev/subform) |
| <img src=".github/assets/family/formcompiler.png" alt="" width="32" height="32"> | **FormCompiler** | Builds, signs and releases every app | [formai.studio](https://formcompiler.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formcompiler) |
| <img src=".github/assets/family/formpipe.png" alt="" width="32" height="32"> | **FormPipe** | Release pipeline and update feeds | | [GitHub](https://github.com/nodemode-dev/formpipe) |

<br>

---

## Maintainers

| Maintainer | Role |
|---|---|
| [@nodemode-ai](https://github.com/nodemode-ai) | Owner |
| [@gbarnai](https://github.com/gbarnai) | Co-owner |

Code owners are set in [`.github/CODEOWNERS`](.github/CODEOWNERS).

## License

FormVis is licensed under the Apache License 2.0 ([`LICENSE`](LICENSE), SPDX `Apache-2.0`). Copyright 2026 NodeAgentc, Inc. Third-party notices: [`NOTICE.md`](NOTICE.md).

This product includes DNG technology under license by Adobe Systems Incorporated.

<sub>Adobe, Camera Raw and Photoshop are either registered trademarks or trademarks of Adobe in the United States and/or other countries. FormVis is not affiliated with or endorsed by Adobe; the names describe file formats and compatibility only.</sub>

<sub>Screenshot content: CC0 photos from Poly Haven.</sub>
