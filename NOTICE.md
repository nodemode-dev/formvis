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
| xterm.js (@xterm/xterm 6.0.0) and its fit addon (@xterm/addon-fit 0.11.0) | MIT | the terminal dock (Window > Terminal) |
| ptyprocess 0.7.0 | ISC | engine, the pseudo-terminals behind the terminal dock on macOS and Linux |
| pywinpty 3.0.5 | MIT | engine, the same on Windows (ConPTY) |
| tauri, tauri-plugin-shell, tauri-plugin-dialog, regex | Apache-2.0 or MIT | desktop shell |
| fastapi, uvicorn, python-multipart | MIT, BSD-3-Clause, Apache-2.0 | engine |
| keyring, with jaraco.classes, jaraco.context, jaraco.functools, more-itertools, jeepney and SecretStorage | MIT (SecretStorage: BSD-3-Clause) | API keys in the system's password store |
| Pillow | MIT-CMU | engine |
| LittleCMS 2 (lcms2, Marti Maria Saguer) | MIT | engine, 16-bit and floating-point colour conversion (Convert to Profile, mode changes, ink limit); called through `ctypes` (`backend/app/services/lcms.py`) on the liblcms2 that Pillow's wheel already carries, or the system's; no code is copied or linked into formvis, no new package is installed |
| pyspellchecker 0.9.1 | MIT | engine, Check Spelling in type layers (`backend/app/services/spell.py`) |
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

## Optional local models (1.52.9)

Nothing below ships with formvis. Each is downloaded to this computer only when you install it in Preferences > Plugins > Local models, after its licence is shown and accepted there; every file is pinned to its SHA-256.

| Model | Licence | Notes |
|---|---|---|
| Krea 2 Turbo (Krea) | Krea 2 Community License Agreement, v.1, June 22, 2026 (https://www.krea.ai/krea-2-licensing), with its use policy (https://www.krea.ai/krea-2-use-policy) | Shown with every Krea 2 picture: "Krea 2 is licensed under the Krea 2 Community License Agreement. For more information, visit https://krea.ai/krea-2-licensing." |
| Falconsai/nsfw_image_detection, as onnx-community/nsfw_image_detection-ONNX | Apache-2.0 | The content filter section 4.2 of Krea 2's licence requires, installed with Krea 2 and run on every picture it makes |
| FLUX.2 [klein] 4B (Black Forest Labs) | Apache License 2.0 | Apple silicon only for now |
| LaMa (big-lama, Suvorov et al.), exported to ONNX by Carve (Carve/LaMa-ONNX) | Apache-2.0 | Generative Fill and Expand on this computer without a prompt, downloaded from Preferences > Plugins > Local models |
| SAM 2.1 tiny (Meta), exported to ONNX by onnx-community (sam2.1-hiera-tiny-ONNX; the export states no licence of its own) | Apache-2.0 (Meta's weights) | Object Selection, fetched on first use |
| U²-Net (Qin et al.), the u2net.onnx rembg publishes | Apache-2.0 | Select Subject and Remove Background, fetched on first use |
| Real-ESRGAN x4plus (Xintao Wang et al.), converted to ONNX (skillsafe-ai/realesrgan-x4plus) | BSD-3-Clause | Image > Upscale on this computer, downloaded from Preferences > Plugins > Local models |
| mflux (Apple silicon) and diffusers (Windows and Linux) | MIT; Apache-2.0 | The runtimes the models run in, installed into their own environment with a model |
| httpx | BSD-3-Clause | The engine's model downloads |
| ONNX Runtime | MIT | Runs the local models; part of the base install |
| LittleCMS (through Pillow's ImageCms) | MIT | Colour management: profile conversion, proofing and the gamut warning |
| psd-tools (Kota Yamaguchi) | MIT | CMYK PSD files read and written with their layers (1.56.1) |
| tifffile (Christoph Gohlke) | BSD-3-Clause | 16-bit CMYK and Lab TIFF files written (1.57.8) |
| x11-dl (Daniel Collin, Erik Lundin, Jason Orendorff and others) | MIT | desktop shell on Linux (`src-tauri/src/display.rs`): opens libX11 at run time to read the `_ICC_PROFILE` property of the X root window, the monitor's profile; already in the tree through tao. macOS (CoreGraphics `CGDisplayCopyColorSpace` and `CGColorSpaceCopyICCData`) and Windows (GDI `GetICMProfileW`) are called directly through declared system functions, with no package; on Linux without that property the engine asks colord's `colormgr` if it is installed |
| Adobe DNG Specification 1.6 (the published document) | read as a format reference only | `backend/app/services/dcp.py` reads and applies DNG camera profiles (`.dcp`) from the tag definitions and chapter 6 of the specification; no Adobe code, profile or data file is included, and formvis ships no `.dcp` file. The profiles it finds in `~/Formvis/CameraProfiles` or Adobe's CameraProfiles folder are the user's own and keep their own terms |

## The shipped CMYK profile (1.54.0)

`backend/app/profiles/FOGRA39L_coated.icc` is the working CMYK profile a CMYK document uses when no other is chosen. It is the colord profile of the FOGRA39L characterisation data (offset printing on coated paper, ISO 12647-2:2004/Amd 1), Copyright Kai-Uwe Behrmann, Marti Maria, Photogamut, Graeme Gill and ColorSolutions, under the zlib/libpng License, as generated for the CTAN colorprofiles package by Peter Selinger, who waived his rights to the generated file; the profile itself carries the statement "This profile is free of known copyright restrictions". ECI's ISO Coated v2 profiles, built from the same data, are not shipped: ECI's terms require its permission to bundle them.

Redistribution check (2026-10-13, DEV_PLAN 28.2): the file is byte for byte the one TeX Live installs at `texmf-dist/tex/generic/colorprofiles/FOGRA39L_coated.icc` (Debian's `texlive-base`), and its own `cprt` tag reads "This profile is free of known copyright restrictions". The package's licence text (the `README` of `support/colorprofiles` on CTAN, which this machine's texlive packages do not include, so it was read there) separates the parts: `colorprofiles.tex` and `.sty` are under the LaTeX Project Public License 1.2 or later (Ross Moore), `sRGB.icc` is Graeme Gill's MIT-style notice, `FOGRA39L_coated.icc` carries the zlib/libpng terms of the colord data (the origin must not be misrepresented, a changed copy must be marked as changed, the notice stays) with Peter Selinger's waiver of his rights in the generated file, and CTAN lists the package itself as "Free license not otherwise listed". Those terms allow shipping and modifying the profile in an Apache-2.0 application, so no replacement is needed; formvis includes the file unchanged, with this notice. LPPL covers only the TeX files, which formvis does not include.

## The native renderer's crates (native/formvis-render 0.8.0)

The Rust packages in the dependency tree of `native/formvis-render` (normal and build dependencies, default features, every target platform), as `cargo metadata --format-version 1` reports them. The optional `window` feature adds winit and its tree, which is not listed. Where a package offers a choice of licences, the recipient may use any one.

| Crate | Version | License |
| --- | --- | --- |
| adler2 | 2.0.1 | 0BSD OR MIT OR Apache-2.0 |
| allocator-api2 | 0.2.21 | MIT OR Apache-2.0 |
| android_system_properties | 0.1.6 | MIT OR Apache-2.0 |
| arrayvec | 0.7.8 | MIT OR Apache-2.0 |
| ash | 0.38.0+1.3.281 | MIT OR Apache-2.0 |
| autocfg | 1.5.1 | Apache-2.0 OR MIT |
| bit-set | 0.10.0 | Apache-2.0 OR MIT |
| bit-vec | 0.9.1 | Apache-2.0 OR MIT |
| bitflags | 2.13.2 | MIT OR Apache-2.0 |
| block2 | 0.6.2 | MIT |
| bumpalo | 3.20.3 | MIT OR Apache-2.0 |
| bytemuck | 1.25.2 | Zlib OR Apache-2.0 OR MIT |
| bytemuck_derive | 1.12.1 | Zlib OR Apache-2.0 OR MIT |
| cfg-if | 1.0.5 | MIT OR Apache-2.0 |
| cfg_aliases | 0.2.2 | MIT |
| codespan-reporting | 0.13.1 | Apache-2.0 |
| crc32fast | 1.5.2 | MIT OR Apache-2.0 |
| crunchy | 0.2.4 | MIT |
| dispatch2 | 0.3.1 | Zlib OR Apache-2.0 OR MIT |
| dlib | 0.5.3 | MIT |
| document-features | 0.2.12 | MIT OR Apache-2.0 |
| equivalent | 1.0.2 | Apache-2.0 OR MIT |
| fdeflate | 0.3.7 | MIT OR Apache-2.0 |
| flate2 | 1.1.10 | MIT OR Apache-2.0 |
| foldhash | 0.2.0 | Zlib |
| futures-core | 0.3.34 | MIT OR Apache-2.0 |
| futures-task | 0.3.34 | MIT OR Apache-2.0 |
| futures-util | 0.3.34 | MIT OR Apache-2.0 |
| gl_generator | 0.14.0 | Apache-2.0 |
| glow | 0.17.0 | MIT OR Apache-2.0 OR Zlib |
| glutin_wgl_sys | 0.6.1 | Apache-2.0 |
| gpu-allocator | 0.28.0 | MIT OR Apache-2.0 |
| half | 2.7.1 | MIT OR Apache-2.0 |
| hashbrown | 0.16.1 | MIT OR Apache-2.0 |
| hashbrown | 0.17.1 | MIT OR Apache-2.0 |
| indexmap | 2.14.2 | Apache-2.0 OR MIT |
| itoa | 1.0.18 | MIT OR Apache-2.0 |
| jni-sys | 0.3.1 | MIT OR Apache-2.0 |
| jni-sys | 0.4.1 | MIT OR Apache-2.0 |
| jni-sys-macros | 0.4.1 | MIT OR Apache-2.0 |
| js-sys | 0.3.106 | MIT OR Apache-2.0 |
| khronos-egl | 6.0.0 | MIT/Apache-2.0 |
| khronos_api | 3.1.0 | Apache-2.0 |
| libc | 0.2.189 | MIT OR Apache-2.0 |
| libloading | 0.8.9 | ISC |
| libm | 0.2.16 | MIT |
| litrs | 1.0.0 | MIT OR Apache-2.0 |
| lock_api | 0.4.14 | MIT OR Apache-2.0 |
| log | 0.4.34 | MIT OR Apache-2.0 |
| memchr | 2.8.3 | Unlicense OR MIT |
| miniz_oxide | 0.8.9 | MIT OR Zlib OR Apache-2.0 |
| miniz_oxide | 0.9.1 | MIT OR Zlib OR Apache-2.0 |
| naga | 30.0.1 | MIT OR Apache-2.0 |
| naga-types | 30.0.1 | MIT OR Apache-2.0 |
| ndk-sys | 0.6.0+11769913 | MIT OR Apache-2.0 |
| ntapi | 0.4.3 | Apache-2.0 OR MIT |
| num-traits | 0.2.19 | MIT OR Apache-2.0 |
| objc2 | 0.6.4 | MIT |
| objc2-core-foundation | 0.3.2 | Zlib OR Apache-2.0 OR MIT |
| objc2-core-graphics | 0.3.2 | Zlib OR Apache-2.0 OR MIT |
| objc2-encode | 4.1.0 | MIT |
| objc2-foundation | 0.3.2 | MIT |
| objc2-io-kit | 0.3.2 | Zlib OR Apache-2.0 OR MIT |
| objc2-io-surface | 0.3.2 | Zlib OR Apache-2.0 OR MIT |
| objc2-metal | 0.3.2 | Zlib OR Apache-2.0 OR MIT |
| objc2-quartz-core | 0.3.2 | Zlib OR Apache-2.0 OR MIT |
| once_cell | 1.21.4 | MIT OR Apache-2.0 |
| ordered-float | 5.5.0 | MIT |
| parking_lot | 0.12.5 | MIT OR Apache-2.0 |
| parking_lot_core | 0.9.12 | MIT OR Apache-2.0 |
| pin-project-lite | 0.2.17 | Apache-2.0 OR MIT |
| pkg-config | 0.3.34 | MIT OR Apache-2.0 |
| png | 0.18.1 | MIT OR Apache-2.0 |
| pollster | 1.0.1 | Apache-2.0/MIT |
| portable-atomic | 1.15.0 | Apache-2.0 OR MIT |
| portable-atomic-util | 0.2.8 | Apache-2.0 OR MIT |
| presser | 0.3.1 | MIT OR Apache-2.0 |
| proc-macro2 | 1.0.107 | MIT OR Apache-2.0 |
| profiling | 1.0.18 | MIT OR Apache-2.0 |
| quote | 1.0.47 | MIT OR Apache-2.0 |
| range-alloc | 0.1.5 | MIT OR Apache-2.0 |
| raw-window-handle | 0.6.2 | MIT OR Apache-2.0 OR Zlib |
| raw-window-metal | 1.1.0 | MIT OR Apache-2.0 |
| redox_syscall | 0.5.18 | MIT |
| renderdoc-sys | 1.1.0 | MIT OR Apache-2.0 |
| rustc-hash | 1.1.0 | Apache-2.0/MIT |
| rustversion | 1.0.23 | MIT OR Apache-2.0 |
| scopeguard | 1.2.0 | MIT OR Apache-2.0 |
| serde | 1.0.229 | MIT OR Apache-2.0 |
| serde_core | 1.0.229 | MIT OR Apache-2.0 |
| serde_derive | 1.0.229 | MIT OR Apache-2.0 |
| serde_json | 1.0.151 | MIT OR Apache-2.0 |
| simd-adler32 | 0.3.10 | MIT |
| slab | 0.4.12 | MIT |
| slotmap | 1.1.1 | Zlib |
| smallvec | 1.16.2 | MIT OR Apache-2.0 |
| spirv | 0.4.0+sdk-1.4.341.0 | Apache-2.0 |
| static_assertions | 1.1.0 | MIT OR Apache-2.0 |
| syn | 2.0.119 | MIT OR Apache-2.0 |
| syn | 3.0.6 | MIT OR Apache-2.0 |
| sysinfo | 0.39.6 | MIT |
| termcolor | 1.4.1 | Unlicense OR MIT |
| thiserror | 2.0.21 | MIT OR Apache-2.0 |
| thiserror-impl | 2.0.21 | MIT OR Apache-2.0 |
| tokio | 1.53.1 | MIT |
| unicode-ident | 1.0.26 | (MIT OR Apache-2.0) AND Unicode-3.0 |
| unicode-width | 0.2.2 | MIT OR Apache-2.0 |
| version_check | 0.9.5 | MIT/Apache-2.0 |
| wasm-bindgen | 0.2.129 | MIT OR Apache-2.0 |
| wasm-bindgen-futures | 0.4.79 | MIT OR Apache-2.0 |
| wasm-bindgen-macro | 0.2.129 | MIT OR Apache-2.0 |
| wasm-bindgen-macro-support | 0.2.129 | MIT OR Apache-2.0 |
| wasm-bindgen-shared | 0.2.129 | MIT OR Apache-2.0 |
| wayland-sys | 0.31.11 | MIT |
| web-sys | 0.3.106 | MIT OR Apache-2.0 |
| wgpu | 30.0.1 | MIT OR Apache-2.0 |
| wgpu-core | 30.0.1 | MIT OR Apache-2.0 |
| wgpu-core-deps-apple | 30.0.1 | MIT OR Apache-2.0 |
| wgpu-core-deps-emscripten | 30.0.1 | MIT OR Apache-2.0 |
| wgpu-core-deps-windows-linux-android | 30.0.1 | MIT OR Apache-2.0 |
| wgpu-hal | 30.0.1 | MIT OR Apache-2.0 |
| wgpu-naga-bridge | 30.0.1 | MIT OR Apache-2.0 |
| wgpu-types | 30.0.1 | MIT OR Apache-2.0 |
| winapi | 0.3.9 | MIT/Apache-2.0 |
| winapi-i686-pc-windows-gnu | 0.4.0 | MIT/Apache-2.0 |
| winapi-util | 0.1.11 | Unlicense OR MIT |
| winapi-x86_64-pc-windows-gnu | 0.4.0 | MIT/Apache-2.0 |
| windows | 0.62.2 | MIT OR Apache-2.0 |
| windows-collections | 0.3.2 | MIT OR Apache-2.0 |
| windows-core | 0.62.2 | MIT OR Apache-2.0 |
| windows-future | 0.3.2 | MIT OR Apache-2.0 |
| windows-implement | 0.60.2 | MIT OR Apache-2.0 |
| windows-interface | 0.59.3 | MIT OR Apache-2.0 |
| windows-link | 0.2.1 | MIT OR Apache-2.0 |
| windows-numerics | 0.3.1 | MIT OR Apache-2.0 |
| windows-result | 0.4.1 | MIT OR Apache-2.0 |
| windows-strings | 0.5.1 | MIT OR Apache-2.0 |
| windows-sys | 0.61.2 | MIT OR Apache-2.0 |
| windows-threading | 0.2.1 | MIT OR Apache-2.0 |
| xml-rs | 0.8.29 | MIT |
| zerocopy | 0.8.59 | BSD-2-Clause OR Apache-2.0 OR MIT |
| zerocopy-derive | 0.8.59 | BSD-2-Clause OR Apache-2.0 OR MIT |
| zlib-rs | 0.6.8 | Zlib |
| zmij | 1.0.23 | MIT |
