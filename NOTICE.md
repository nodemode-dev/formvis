# Third-party notices

sonny is licensed under the Apache License 2.0 (see `LICENSE`). It includes or depends on the following works.

## Included in this repository

| Work | License | Where |
| --- | --- | --- |
| NodeMode stylized design system: tokens, theme profiles, theme boot, dom-stable helpers, icon subset | MIT | `frontend/src/styles/tokens.css`, `frontend/src/ui/themes.ts`, `frontend/src/ui/dom.ts`, `frontend/src/ui/icons.ts`, `frontend/index.html` |
| `paintbrush` icon from Remix Icon | Apache-2.0 | `frontend/src/ui/icons.ts` |
| `hand` icon (cursor-hand) from Remix Icon | Apache-2.0 | `frontend/src/ui/icons.ts` |
| Tauri sidecar shell template (tauri-compiler-skill) | MIT | `src-tauri/src/main.rs` |

## Distributed with the app

| Package | License | Notes |
| --- | --- | --- |
| Inter, JetBrains Mono (via @fontsource) | SIL OFL 1.1 fonts, MIT packaging | bundled font files |
| ag-psd, with pako and base64-js | MIT (pako: MIT and Zlib) | layered PSD open and export, loaded on first use |
| tauri, tauri-plugin-shell, tauri-plugin-dialog, regex | Apache-2.0 or MIT | desktop shell |
| fastapi, uvicorn, python-multipart | MIT, BSD-3-Clause, Apache-2.0 | engine |
| Pillow | MIT-CMU | engine |
| numpy | BSD-3-Clause | engine |
| opencv-python-headless | Apache-2.0 (OpenCV), MIT (packaging) | engine; its wheels carry LGPL FFmpeg as separate shared libraries, kept separable in the frozen engine |
| pillow-heif | BSD-3-Clause; bundles LGPL libheif and GPL x265 | server-side engine only; excluded from the frozen desktop engine |
| rembg, onnxruntime | MIT, MIT | optional ML extra; the u2net model (Apache-2.0) is downloaded at install time, not redistributed |

## Build tools, not distributed

Vite (MIT), TypeScript (Apache-2.0), @tauri-apps/cli (Apache-2.0 or MIT), PyInstaller (GPL-2.0-or-later with the bootloader exception, which permits distributing the frozen engine under this project's license).
