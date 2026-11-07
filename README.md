<p align="center">
  <img src="assets/app-icon/formvis-256.png" width="128" height="128" alt="FormVis icon: the Form family layered-image mark">
</p>

<h1 align="center">FormVis</h1>

<p align="center">
  <b>Image editing; the layered photo editor of the FormAI family.</b><br>
  Layers, masks, blend modes, adjustment layers, layer styles and PSD files,<br>
  with local generation, on your own machine. No account, and agents can edit over MCP.
</p>

<p align="center">
  <img alt="version 2.0.3" src="https://img.shields.io/badge/version-2.0.3-eef0f4?style=flat-square">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-Vite-3178c6?style=flat-square&logo=typescript&logoColor=white">
  <img alt="Python" src="https://img.shields.io/badge/Python-FastAPI-3776ab?style=flat-square">
  <img alt="macOS, Windows, Linux" src="https://img.shields.io/badge/macOS%20%C2%B7%20Windows%20%C2%B7%20Linux-native-2f7bf5?style=flat-square">
  <img alt="License: Apache-2.0" src="https://img.shields.io/badge/license-Apache--2.0-3a3a3a?style=flat-square">
  <img alt="Status: alpha" src="https://img.shields.io/badge/status-alpha-d69e2e?style=flat-square">
</p>

<p align="center">
  <a href="https://formvis.formai.studio/"><b>Download FormVis on formai.studio</b></a> ·
  <a href="#run-it-from-source">Run it from source</a>
</p>

<br>

<p align="center">
  <img src="docs/images/formvis-hero.webp" alt="FormVis with a rainy city street at dusk open in the document form-city-fill-&-relight: zoomed out a little with empty pasteboard on both sides of the photo, the Neon Club Look picked in the Relight panel at low intensity, a soft magenta light at the lower left and a cyan light at the upper right giving the street a subtle blue and purple grade while the neon FORM CITY and FORM FORM signs stay crisp red and readable, and the Relight layer with its mask above the photo in the layers panel" width="100%">
  <br>
  <sub>Relight at work: the Neon Club Look, turned down low, lays a soft blue and purple grade over the street, while a mask on the Relight layer keeps the neon signs on the original pixels; the light controls are in the Properties panel.</sub>
</p>

<p align="center">
  <a href="#features">Features</a> ·
  <a href="#everything-in-the-box">In the box</a> ·
  <a href="#built-for-agents">Agents</a> ·
  <a href="#under-the-hood">Under the hood</a> ·
  <a href="#download">Download</a> ·
  <a href="#run-it-from-source">Run from source</a>
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

| Platform | Download | Release |
|---|---|---|
| macOS | [Download FormVis for macOS](https://formai.studio/get/formvis/macos) | [FormVis releases on FormCompiler](https://github.com/nodemode-dev/formcompiler/releases?q=formvis-v&expanded=true) |
| Windows | [Download FormVis for Windows](https://formai.studio/get/formvis/windows) | [FormVis releases on FormCompiler](https://github.com/nodemode-dev/formcompiler/releases?q=formvis-v&expanded=true) |
| Linux | [Download FormVis for Linux](https://formai.studio/get/formvis/linux) | [FormVis releases on FormCompiler](https://github.com/nodemode-dev/formcompiler/releases?q=formvis-v&expanded=true) |

All FormVis builds are compiled and released from [FormCompiler](https://github.com/nodemode-dev/formcompiler); this repo holds the source.

## Demo

[`demo/index.html`](demo/index.html) is an offline demo that opens from `file://` or any static server and runs the real FormVis window, its menus, tool rail, panels and dialogs: a painting and photo-editing session with the Brush and its dynamics, layers with blend modes and masks, adjustment layers, filters, type, and your own PNG, JPEG, WebP, TIFF or layered PSD in and out, with no install and no network. See [`demo/README.md`](demo/README.md). Two more demos of the same window, each on a different part of the app, link to each other and to it from a small row in the title bar:

- [`demos/retouch/index.html`](demos/retouch/index.html): selections and retouching on a portrait, with Spot Healing, Clone Stamp, Selection-Aware Fill, Color Range, Select and Mask, masks from a saved selection and a before and after split. See [`demos/retouch/README.md`](demos/retouch/README.md).
- [`demos/design/index.html`](demos/design/index.html): type and design, a three-artboard event kit with live type, shapes, layer styles, Smart Filters and the Filter Gallery, and Export As to several formats and a layered PSD. See [`demos/design/README.md`](demos/design/README.md).

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
