# Third-party notices

formvis is licensed under the Apache License 2.0 (see `LICENSE`). It includes or depends on the following works.

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
| three.js | MIT | Place 3D Model (.glb and .gltf), loaded on first use |
| tauri, tauri-plugin-shell, tauri-plugin-dialog, regex | Apache-2.0 or MIT | desktop shell |
| fastapi, uvicorn, python-multipart | MIT, BSD-3-Clause, Apache-2.0 | engine |
| keyring, with jaraco.classes, jaraco.context, jaraco.functools, more-itertools, jeepney and SecretStorage | MIT (SecretStorage: BSD-3-Clause) | API keys in the system's password store |
| Pillow | MIT-CMU | engine |
| numpy | BSD-3-Clause | engine |
| opencv-python-headless | Apache-2.0 (OpenCV), MIT (packaging) | engine; its wheels carry LGPL FFmpeg as separate shared libraries, kept separable in the frozen engine |
| pillow-heif | BSD-3-Clause; bundles LGPL libheif and GPL x265 | server-side engine only; excluded from the frozen desktop engine |
| rawpy, with LibRaw | MIT (rawpy); LibRaw is LGPL-2.1 or CDDL-1.0, at the recipient's choice | engine, camera RAW decoding; LibRaw ships in rawpy's wheels as a separate shared library, kept separable and replaceable in the frozen engine |
| SAM 2.1 (Meta, facebookresearch/sam2 at commit 2b90b9f) and its tiny checkpoint | Apache-2.0 (the repository's cctorch component is BSD-3-Clause and is not built) | engine, optional (`./formvis install-ml`), click-to-select; the checkpoint is downloaded from Meta and checked against its SHA-256 |
| PyTorch | Apache-2.0 AND Apache-2.0 WITH LLVM-exception AND BSD-2-Clause AND BSD-3-Clause AND BSL-1.0 AND MIT (its package metadata) | engine, optional, SAM 2.1's runtime |
| torchvision | BSD-3-Clause | engine, optional, SAM 2.1's runtime |
| hydra-core, iopath | MIT | engine, optional, SAM 2.1's configuration and file helpers |
| omegaconf, portalocker, antlr4-python3-runtime | BSD-3-Clause | engine, optional, the same helpers' dependencies |
| tqdm | MPL-2.0 AND MIT | engine, optional, progress reporting in SAM 2.1's helpers; used unmodified |
| wgpu 30 (and its crates), pollster, bytemuck | wgpu: MIT OR Apache-2.0; pollster: Apache-2.0 OR MIT; bytemuck: Zlib OR Apache-2.0 OR MIT. Transitively only permissive licences: MIT, Apache-2.0, Zlib, ISC, BSD-2-Clause (as an option) and Unicode-3.0 (per `cargo metadata`) | native/formvis-render, the native GPU renderer (Metal, Vulkan, Direct3D 12) |
| sysinfo | MIT | native/formvis-render, the machine's memory for the document budget |
| rembg, onnxruntime | MIT, MIT | optional ML extra; the u2net model (Apache-2.0) is downloaded at install time, not redistributed |

## Build tools, not distributed

Vite (MIT), TypeScript (Apache-2.0), @tauri-apps/cli (Apache-2.0 or MIT), PyInstaller (GPL-2.0-or-later with the bootloader exception, which permits distributing the frozen engine under this project's license).

## Phosphor Icons

The Quick Selection, Paint Bucket, Dodge, Burn and Sponge tool icons are Phosphor Icons (selection-plus-fill, paint-bucket-fill, sun-dim-fill, fire-fill and drop-half-fill), Copyright (c) 2023 Phosphor Icons, used under the MIT License, taken from the IcoLab dataset.
