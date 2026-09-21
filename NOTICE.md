# Third-party notices

sonny is MIT licensed (see `LICENSE`). It includes or depends on the following works.

## Ported or copied into this repository

| Work | License | Where |
| --- | --- | --- |
| by its authors (https://github.com/robbietilton/the.ref format): document model, project format, ported kernels (Levels, Curves, Exposure, Gradient Map, Magic Wand fill, selection contour tracer), brush spacing | MIT, copyright retained in `LICENSE` | `frontend/src/engine/`, `frontend/src/io/project-io.ts`, `backend/app/services/project_format.py` |
| NodeMode stylized design system: tokens, theme profiles, theme boot, dom-stable helpers, icon subset | MIT | `frontend/src/styles/tokens.css`, `frontend/src/ui/themes.ts`, `frontend/src/ui/dom.ts`, `frontend/src/ui/icons.ts`, `frontend/index.html` |
| `paintbrush` icon from Remix Icon | Apache-2.0 | `frontend/src/ui/icons.ts` |
| Tauri sidecar shell template (tauri-compiler-skill) | MIT | `src-tauri/src/main.rs` |

## Distributed with the app

| Package | License | Notes |
| --- | --- | --- |
| Inter, JetBrains Mono (via @fontsource) | SIL OFL 1.1 fonts, MIT packaging | bundled font files |
| tauri, tauri-plugin-shell, tauri-plugin-dialog, regex | Apache-2.0 or MIT | desktop shell |
| fastapi, uvicorn, python-multipart | MIT, BSD-3-Clause, Apache-2.0 | engine |
| Pillow | MIT-CMU | engine |
| numpy | BSD-3-Clause | engine |
| opencv-python-headless | Apache-2.0 (OpenCV), MIT (packaging) | engine; its wheels carry LGPL FFmpeg as separate shared libraries, kept separable in the frozen engine |
| pillow-heif | BSD-3-Clause; bundles LGPL libheif and GPL x265 | server-side engine only; excluded from the frozen desktop engine |
| rembg, onnxruntime | MIT, MIT | optional ML extra; the u2net model (Apache-2.0) is downloaded at install time, not redistributed |

## Build tools, not distributed

Vite (MIT), TypeScript (Apache-2.0), @tauri-apps/cli (Apache-2.0 or MIT), PyInstaller (GPL-2.0-or-later with the bootloader exception, which permits distributing the frozen engine under this project's license).
