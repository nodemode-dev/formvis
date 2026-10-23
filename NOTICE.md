# Third-party notices

formvis is licensed under the Apache License 2.0 (see `LICENSE`). It includes or depends on the following works.

## Included in this repository

| Work | License | Where |
| --- | --- | --- |
| NodeMode stylized design system: tokens, theme profiles, theme boot, dom-stable helpers, icon subset | MIT | `frontend/src/styles/tokens.css`, `frontend/src/ui/themes.ts`, `frontend/src/ui/dom.ts`, `frontend/src/ui/icons.ts`, `frontend/index.html` |
| `paintbrush` icon from Remix Icon | Apache-2.0 | `frontend/src/ui/icons.ts` |
| `hand` icon (cursor-hand) from Remix Icon | Apache-2.0 | `frontend/src/ui/icons.ts` |
| Tauri sidecar shell template (tauri-compiler-skill) | MIT | `src-tauri/src/main.rs` |
| .af, .afphoto, .afdesign and .afpub reading (container, object graph, tiles), the read direction of schist's crates/codec-affinity ported to TypeScript | MIT, Copyright (c) 2026 Infrawrench LLC | `frontend/src/io/af-read.ts` |
| Test documents lf_gauss10.af, shp_arrow.af, exposure.af (schist fixtures) | MIT, Copyright (c) 2026 Infrawrench LLC | `e2e/fixtures/af/` |
| Test documents raster_test.afdesign, layer_test.afdesign, layer_mode.afdesign (AFDesignLoad) | MIT, Copyright (c) 2015 Nick Beeuwsaert | `e2e/fixtures/af/` |
| Test document poster.af (filex-media-thumbs) | MIT, Copyright (c) 2026 BRF Tech | `e2e/fixtures/af/` |

## Adobe DNG patent licence

This product includes DNG technology under license by Adobe Systems Incorporated.

formvis opens DNG files (`backend/app/services/imaging.py`, through LibRaw) and reads DNG camera profiles (`backend/app/services/dcp.py`). Adobe's DNG Specification patent licence is worldwide and royalty-free for reading and writing files that comply with the DNG Specification, on condition that distributed products display the notice above prominently; it is shown in formvis's About box under Licences and notices. Adobe may revoke the licence from anyone who, with their affiliates, brings a patent action against Adobe over reading or writing DNG files. Source: the licence text Adobe ships with the DNG SDK (`PATENTS`).

## Trademarks

Adobe, Camera Raw and Photoshop are either registered trademarks or trademarks of Adobe in the United States and/or other countries. formvis is not affiliated with or endorsed by Adobe; the names describe file formats and compatibility only (.psd and .psb files, DNG).

## Distributed with the app

| Package | License | Notes |
| --- | --- | --- |
| Inter, JetBrains Mono (via @fontsource) | SIL OFL 1.1 fonts, MIT packaging | bundled font files |
| Lato 1.104, Montserrat 9.000, Open Sans 3.003, Roboto 3.015, Lora 3.008, Merriweather 2.100, Playfair Display 1.203, Anton 2.116, Bebas Neue 2.000, Oswald 4.103, Caveat 2.000, Dancing Script 2.001, Pacifico 3.001, IBM Plex Mono 2.3, Source Code Pro 1.026 (via @fontsource 5.3.0 and 5.3.1) | SIL OFL 1.1 fonts, MIT packaging | latin woff2 text fonts in `frontend/public/fonts/[family]/`, each with its licence text, registered on first use (1.90.7) |
| Rust core and alloc inside `frontend/src/engine/kernels-wasm/*.wasm` | MIT OR Apache-2.0 | the WebAssembly pixel kernels built from `native/formvis-kernels` (no other crates), loaded on first use (1.90.7) |
| ag-psd, with pako and base64-js | MIT (pako: MIT and Zlib) | layered PSD open and export, loaded on first use |
| fzstd (0.1.1) | MIT, Copyright (c) 2020 Arjun Barrett | reading zstd-compressed entries of .af, .afphoto, .afdesign and .afpub files (`frontend/src/io/af-read.ts`), loaded on first use |
| three.js | MIT | Place 3D Model (.glb and .gltf), loaded on first use |
| opentype.js (2.0.0) | MIT | reading glyph outlines from font files for Create Work Path, Convert to Shape and the Glyphs panel (`frontend/src/engine/glyph-outlines.ts`), loaded on first use |
| utif2 (4.1.0, with pako) | MIT (pako: MIT and Zlib) | opening a TIFF in the browser when the engine service is not running (`frontend/src/io/tiff-browser.ts`), loaded on first use |
| xterm.js (@xterm/xterm 6.0.0) and its fit addon (@xterm/addon-fit 0.11.0) | MIT | the terminal dock (Window > Terminal) |
| @tauri-apps/api 2.11.1 | Apache-2.0 OR MIT | the page's bridge to the desktop shell |
| ptyprocess 0.7.0 | ISC | engine, the pseudo-terminals behind the terminal dock on macOS and Linux |
| pywinpty 3.0.5 | MIT | engine, the same on Windows (ConPTY) |
| tauri, tauri-plugin-shell, tauri-plugin-dialog, tauri-plugin-updater, tauri-plugin-single-instance, regex, serde, serde_json | Apache-2.0 or MIT | desktop shell; every crate in its tree is listed under "The desktop shell's crates" below |
| fontdb 0.24 | MIT | desktop shell, the installed font families for the Type tool (`src-tauri/src/main.rs`) |
| OpenEXR (Academy Software Foundation) 3.5.2 | BSD-3-Clause | engine, multi-part OpenEXR files read part by part, in the contained child process only (DEV_PLAN 36.15) |
| onnx 1.23.1 | Apache-2.0 | engine, the style presets' fixed input made dynamic in memory |
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
| YuNet face detector (Shiqi Yu, OpenCV Zoo), face_detection_yunet_2023mar.onnx | MIT | Face-Aware Liquify; downloaded on request from https://huggingface.co/opencv/face_detection_yunet (pinned revision and SHA-256 in `backend/app/localgen/model_manager.py`), run by OpenCV's FaceDetectorYN |
| Depth Anything V2 Small (Yang et al.), ONNX export by onnx-community | Apache-2.0 (the Small checkpoint only; the Base, Large and Giant checkpoints are CC-BY-NC and are not used) | Depth Blur in the Neural Filters; downloaded on request from https://huggingface.co/onnx-community/depth-anything-v2-small (pinned revision and SHA-256) |
| DDColor-tiny (piddnad/DDColor), fp16 ONNX export by edgetools | Apache-2.0 | Colour for black-and-white pictures in the Neural Filters; downloaded on request from https://huggingface.co/edgetools/ddcolor (pinned revision and SHA-256) |
| Fast neural style presets from the ONNX model zoo (candy-9, mosaic-9, rain-princess-9, udnie-9, pointilism-9) | BSD-3-Clause, as `model_manager.py` records for the zoo's files | Style Transfer in the Neural Filters; downloaded on request from https://github.com/onnx/models/tree/main/validated/vision/style_transfer/fast_neural_style/model (each file pinned by SHA-256) |
| Sky segmenter skyseg.onnx (xiongzhu666, a U-2-Net model), Hugging Face copy JianyuanWang/skyseg | MIT | Select > Sky; downloaded on request from https://huggingface.co/JianyuanWang/skyseg (pinned revision and SHA-256) |
| mflux (Apple silicon) and diffusers (Windows and Linux) | MIT; Apache-2.0 | The runtimes the models run in, installed into their own environment with a model |
| Marigold IID Lighting v1.1 and Marigold Normals v1.1 (Ke, Obukhov et al., PRS ETH Zurich; prs-eth/marigold-iid-lighting-v1-1 and prs-eth/marigold-normals-v1-1, fine-tuned from Stable Diffusion 2) | CreativeML Open RAIL++-M (use-based restrictions apply and pass on to users; see each model card) | Relight's learned light split (albedo, shading, normals), 1.75.0. fp16 files pinned to their revisions, about 5.2 GB; downloaded only after the button that names the licence |
| MediaPipe selfie multiclass (Google), as the 256x256 ONNX export senty-au/selfie_multiclass_256x256-ONNX, pinned by SHA-256 as formlit 0.45.3 pins it | Apache-2.0 | Relight's per-material split (background, hair, skin, clothes), downloaded from Relight; not used by the 1.82.0 scene |
| MoGe-2 small with normals (Microsoft; Ruicheng/moge-2-vits-normal, pinned by revision and SHA-256) and the `moge` package (microsoft/MoGe, pinned commit) | MIT; MIT | Relight's scene geometry (normals), an optional extra in backend/requirements_relight.txt, not in the desktop bundle |
| PyTorch, diffusers, transformers, accelerate, safetensors (backend/requirements_relight.txt) | BSD-3-Clause; Apache-2.0; Apache-2.0; Apache-2.0; Apache-2.0 | Run Marigold in the engine; an optional extra, not in the desktop bundle |
| httpx | BSD-3-Clause | The engine's model downloads |
| ONNX Runtime | MIT | Runs the local models; part of the base install |
| LittleCMS (through Pillow's ImageCms) | MIT | Colour management: profile conversion, proofing and the gamut warning |
| psd-tools (Kota Yamaguchi) | MIT | CMYK PSD files read and written with their layers (1.56.1) |
| tifffile (Christoph Gohlke) | BSD-3-Clause | 16-bit CMYK and Lab TIFF files written (1.57.8) |
| x11-dl (Daniel Collin, Erik Lundin, Jason Orendorff and others) | MIT | desktop shell on Linux (`src-tauri/src/display.rs`): opens libX11 at run time to read the `_ICC_PROFILE` property of the X root window, the monitor's profile; already in the tree through tao. macOS (CoreGraphics `CGDisplayCopyColorSpace` and `CGColorSpaceCopyICCData`) and Windows (GDI `GetICMProfileW`) are called directly through declared system functions, with no package; on Linux without that property the engine asks colord's `colormgr` if it is installed |
| gtk (Linux), windows-sys (Windows), objc2, objc2-app-kit and objc2-foundation (macOS) | MIT; MIT OR Apache-2.0; MIT OR Apache-2.0 OR Zlib | desktop shell (`note_recent_document` in `src-tauri/src/main.rs`): files opened or saved from disk join the system's recent documents (GTK RecentManager, SHAddToRecentDocs, NSDocumentController); all already in the tree through Tauri |
| DNG Specification 1.6 (the published document) | read as a format reference only | `backend/app/services/dcp.py` reads and applies DNG camera profiles (`.dcp`) from the tag definitions and chapter 6 of the specification; no code, profile or data file from the specification's publisher is included, and formvis ships no `.dcp` file. The profiles it finds in `~/Formvis/CameraProfiles` or the system's camera profiles folder are the user's own and keep their own terms |

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

## The desktop shell's crates (src-tauri)

The Rust packages in the dependency tree of `src-tauri` (normal and build dependencies, default features, every target platform), as `cargo metadata --format-version 1` reports them against `src-tauri/Cargo.lock` on 2026-10-19. The 144 crates already listed under "The native renderer's crates" are not repeated. Where a package offers a choice of licences, the recipient may use any one; for `r-efi` (MIT OR Apache-2.0 OR LGPL-2.1-or-later), formvis uses it under MIT OR Apache-2.0.

MPL-2.0 crates: `cssparser` 0.36.0, `cssparser-macros` 0.6.1, `selectors` 0.36.1, `dtoa-short` 0.3.5 and `option-ext` 0.2.0 are used unmodified under the Mozilla Public License 2.0. Their source code is available from crates.io (https://crates.io/crates/<name>/<version>) and from each crate's repository listed there. The MPL-2.0 text is at https://mozilla.org/MPL/2.0/.

`webpki-root-certs` 1.0.9 carries Mozilla's root certificate data under the Community Data License Agreement, Permissive, Version 2.0 (https://cdla.dev/permissive-2-0/). The `icu_*`, `zerovec`, `yoke`, `zerofrom`, `zerotrie`, `tinystr`, `litemap`, `writeable` and `potential_utf` crates include Unicode data under the Unicode License v3 (https://www.unicode.org/license.txt).

| Crate | Version | License |
| --- | --- | --- |
| aho-corasick | 1.1.5 | Unlicense OR MIT |
| alloc-no-stdlib | 2.0.4 | BSD-3-Clause |
| alloc-stdlib | 0.2.4 | BSD-3-Clause |
| anyhow | 1.0.104 | MIT OR Apache-2.0 |
| arbitrary | 1.4.2 | MIT OR Apache-2.0 |
| atk | 0.18.2 | MIT |
| atk-sys | 0.18.2 | MIT |
| atomic-waker | 1.1.2 | Apache-2.0 OR MIT |
| base64 | 0.21.7 | MIT OR Apache-2.0 |
| base64 | 0.22.1 | MIT OR Apache-2.0 |
| base64 | 0.23.1 | MIT OR Apache-2.0 |
| bit-set | 0.8.0 | Apache-2.0 OR MIT |
| bit-vec | 0.8.0 | Apache-2.0 OR MIT |
| bitflags | 1.3.2 | MIT/Apache-2.0 |
| block-buffer | 0.10.4 | MIT OR Apache-2.0 |
| brotli | 8.0.4 | BSD-3-Clause AND MIT |
| brotli-decompressor | 5.0.3 | BSD-3-Clause/MIT |
| bs58 | 0.5.1 | MIT/Apache-2.0 |
| byteorder | 1.5.0 | Unlicense OR MIT |
| bytes | 1.12.1 | MIT |
| cairo-rs | 0.18.5 | MIT |
| cairo-sys-rs | 0.18.2 | MIT |
| camino | 1.2.6 | MIT OR Apache-2.0 |
| cargo-platform | 0.1.9 | MIT OR Apache-2.0 |
| cargo_metadata | 0.19.2 | MIT |
| cargo_toml | 0.22.3 | Apache-2.0 OR MIT |
| cc | 1.5.1 | MIT OR Apache-2.0 |
| cesu8 | 1.1.0 | Apache-2.0/MIT |
| cfb | 0.7.3 | MIT |
| cfg-expr | 0.15.8 | MIT OR Apache-2.0 |
| chrono | 0.4.45 | MIT OR Apache-2.0 |
| combine | 4.6.8 | MIT |
| cookie | 0.18.2 | MIT OR Apache-2.0 |
| core-foundation | 0.10.1 | MIT OR Apache-2.0 |
| core-foundation | 0.9.4 | MIT OR Apache-2.0 |
| core-foundation-sys | 0.8.7 | MIT OR Apache-2.0 |
| core-graphics | 0.25.0 | MIT OR Apache-2.0 |
| core-graphics-types | 0.2.0 | MIT OR Apache-2.0 |
| core_detect | 1.0.0 | MIT/Apache-2.0 |
| cpufeatures | 0.2.17 | MIT OR Apache-2.0 |
| crossbeam-channel | 0.5.17 | MIT OR Apache-2.0 |
| crossbeam-utils | 0.8.23 | MIT OR Apache-2.0 |
| crypto-common | 0.1.7 | MIT OR Apache-2.0 |
| cssparser | 0.36.0 | MPL-2.0 |
| cssparser-macros | 0.6.1 | MPL-2.0 |
| ctor | 0.8.0 | Apache-2.0 OR MIT |
| ctor-proc-macro | 0.0.7 | Apache-2.0 OR MIT |
| darling | 0.24.1 | MIT |
| darling_core | 0.24.1 | MIT |
| darling_macro | 0.24.1 | MIT |
| dbus | 0.9.12 | Apache-2.0/MIT |
| defmt | 1.1.1 | MIT OR Apache-2.0 |
| defmt-macros | 1.1.1 | MIT OR Apache-2.0 |
| defmt-parser | 1.0.0 | MIT OR Apache-2.0 |
| deranged | 0.5.8 | MIT OR Apache-2.0 |
| derive_arbitrary | 1.4.2 | MIT OR Apache-2.0 |
| derive_more | 2.1.1 | MIT |
| derive_more-impl | 2.1.1 | MIT |
| digest | 0.10.7 | MIT OR Apache-2.0 |
| dirs | 6.0.0 | MIT OR Apache-2.0 |
| dirs-sys | 0.5.0 | MIT OR Apache-2.0 |
| displaydoc | 0.2.7 | MIT OR Apache-2.0 |
| dlopen2 | 0.8.2 | MIT |
| dlopen2_derive | 0.4.3 | MIT |
| dom_query | 0.27.0 | MIT |
| dpi | 0.1.2 | Apache-2.0 AND MIT |
| dtoa | 1.0.11 | MIT OR Apache-2.0 |
| dtoa-short | 0.3.5 | MPL-2.0 |
| dtor | 0.3.0 | Apache-2.0 OR MIT |
| dtor-proc-macro | 0.0.6 | Apache-2.0 OR MIT |
| dunce | 1.0.5 | CC0-1.0 OR MIT-0 OR Apache-2.0 |
| dyn-clone | 1.0.20 | MIT OR Apache-2.0 |
| embed-resource | 3.0.11 | MIT |
| embed_plist | 1.2.2 | MIT OR Apache-2.0 |
| encoding_rs | 0.8.42 | (Apache-2.0 OR MIT) AND BSD-3-Clause |
| erased-serde | 0.4.10 | MIT OR Apache-2.0 |
| errno | 0.3.14 | MIT OR Apache-2.0 |
| fastrand | 2.5.0 | Apache-2.0 OR MIT |
| field-offset | 0.3.6 | MIT OR Apache-2.0 |
| filetime | 0.2.29 | MIT/Apache-2.0 |
| find-msvc-tools | 0.1.14 | MIT OR Apache-2.0 |
| fnv | 1.0.7 | Apache-2.0 / MIT |
| fontconfig-parser | 0.5.8 | MIT |
| fontdb | 0.24.0 | MIT |
| foreign-types | 0.5.0 | MIT/Apache-2.0 |
| foreign-types-macros | 0.2.4 | MIT/Apache-2.0 |
| foreign-types-shared | 0.3.1 | MIT/Apache-2.0 |
| form_urlencoded | 1.2.2 | MIT OR Apache-2.0 |
| formvis-render | 0.8.0 | Apache-2.0 |
| futures-channel | 0.3.34 | MIT OR Apache-2.0 |
| futures-executor | 0.3.34 | MIT OR Apache-2.0 |
| futures-io | 0.3.34 | MIT OR Apache-2.0 |
| futures-macro | 0.3.34 | MIT OR Apache-2.0 |
| futures-sink | 0.3.34 | MIT OR Apache-2.0 |
| gdk | 0.18.2 | MIT |
| gdk-pixbuf | 0.18.5 | MIT |
| gdk-pixbuf-sys | 0.18.0 | MIT |
| gdk-sys | 0.18.2 | MIT |
| gdkwayland-sys | 0.18.2 | MIT |
| gdkx11 | 0.18.2 | MIT |
| gdkx11-sys | 0.18.2 | MIT |
| generic-array | 0.14.7 | MIT |
| getrandom | 0.2.17 | MIT OR Apache-2.0 |
| getrandom | 0.3.4 | MIT OR Apache-2.0 |
| getrandom | 0.4.3 | MIT OR Apache-2.0 |
| gio | 0.18.4 | MIT |
| gio-sys | 0.18.1 | MIT |
| glib | 0.18.5 | MIT |
| glib-macros | 0.18.5 | MIT |
| glib-sys | 0.18.1 | MIT |
| glob | 0.3.4 | MIT OR Apache-2.0 |
| gobject-sys | 0.18.0 | MIT |
| gtk | 0.18.2 | MIT |
| gtk-sys | 0.18.2 | MIT |
| gtk3-macros | 0.18.2 | MIT |
| hashbrown | 0.12.3 | MIT OR Apache-2.0 |
| heck | 0.4.1 | MIT OR Apache-2.0 |
| heck | 0.5.0 | MIT OR Apache-2.0 |
| hex | 0.4.3 | MIT OR Apache-2.0 |
| html5ever | 0.38.0 | MIT OR Apache-2.0 |
| http | 1.5.0 | MIT OR Apache-2.0 |
| http-body | 1.1.0 | MIT |
| http-body-util | 0.1.5 | MIT |
| httparse | 1.10.1 | MIT OR Apache-2.0 |
| hyper | 1.11.1 | MIT |
| hyper-rustls | 0.27.10 | Apache-2.0 OR ISC OR MIT |
| hyper-util | 0.1.21 | MIT |
| iana-time-zone | 0.1.65 | MIT OR Apache-2.0 |
| iana-time-zone-haiku | 0.1.2 | MIT OR Apache-2.0 |
| ico | 0.5.0 | MIT |
| icu_collections | 2.3.0 | Unicode-3.0 |
| icu_locale_core | 2.3.0 | Unicode-3.0 |
| icu_normalizer | 2.3.0 | Unicode-3.0 |
| icu_normalizer_data | 2.3.0 | Unicode-3.0 |
| icu_properties | 2.3.0 | Unicode-3.0 |
| icu_properties_data | 2.3.0 | Unicode-3.0 |
| icu_provider | 2.3.1 | Unicode-3.0 |
| ident_case | 1.0.1 | MIT/Apache-2.0 |
| idna | 1.1.0 | MIT OR Apache-2.0 |
| idna_adapter | 1.2.2 | Apache-2.0 OR MIT |
| indexmap | 1.9.3 | Apache-2.0 OR MIT |
| infer | 0.19.0 | MIT |
| ipnet | 2.12.2 | MIT OR Apache-2.0 |
| is-docker | 0.2.0 | MIT |
| is-wsl | 0.4.0 | MIT |
| javascriptcore-rs | 1.1.2 | MIT |
| javascriptcore-rs-sys | 1.1.1 | MIT |
| jiff | 0.2.37 | Unlicense OR MIT |
| jiff-core | 0.1.1 | Unlicense OR MIT |
| jiff-static | 0.2.37 | Unlicense OR MIT |
| jiff-tzdb | 0.1.8 | Unlicense OR MIT |
| jiff-tzdb-platform | 0.1.3 | Unlicense OR MIT |
| jni | 0.21.1 | MIT/Apache-2.0 |
| jni | 0.22.4 | MIT OR Apache-2.0 |
| jni-macros | 0.22.4 | MIT OR Apache-2.0 |
| json-patch | 3.0.1 | MIT/Apache-2.0 |
| jsonptr | 0.6.3 | MIT OR Apache-2.0 |
| keyboard-types | 0.7.0 | MIT OR Apache-2.0 |
| libappindicator | 0.9.0 | Apache-2.0 OR MIT |
| libappindicator-sys | 0.9.0 | Apache-2.0 OR MIT |
| libdbus-sys | 0.2.7 | Apache-2.0/MIT |
| libloading | 0.7.4 | ISC |
| libredox | 0.1.25 | MIT |
| linux-raw-sys | 0.12.1 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT |
| litemap | 0.8.3 | Unicode-3.0 |
| markup5ever | 0.38.0 | MIT OR Apache-2.0 |
| memmap2 | 0.9.11 | MIT OR Apache-2.0 |
| memoffset | 0.9.1 | MIT |
| mime | 0.3.17 | MIT OR Apache-2.0 |
| minisign-verify | 0.2.5 | MIT |
| mio | 1.2.3 | MIT |
| muda | 0.19.3 | Apache-2.0 OR MIT |
| multiversion_no_op | 1.0.0 | Apache-2.0 OR MIT |
| ndk | 0.9.0 | MIT OR Apache-2.0 |
| new_debug_unreachable | 1.0.6 | MIT |
| num-conv | 0.2.2 | MIT OR Apache-2.0 |
| num_enum | 0.7.6 | BSD-3-Clause OR MIT OR Apache-2.0 |
| num_enum_derive | 0.7.6 | BSD-3-Clause OR MIT OR Apache-2.0 |
| objc2-app-kit | 0.3.2 | Zlib OR Apache-2.0 OR MIT |
| objc2-cloud-kit | 0.3.2 | Zlib OR Apache-2.0 OR MIT |
| objc2-core-data | 0.3.2 | Zlib OR Apache-2.0 OR MIT |
| objc2-core-image | 0.3.2 | Zlib OR Apache-2.0 OR MIT |
| objc2-core-location | 0.3.2 | Zlib OR Apache-2.0 OR MIT |
| objc2-core-text | 0.3.2 | Zlib OR Apache-2.0 OR MIT |
| objc2-exception-helper | 0.1.1 | Zlib OR Apache-2.0 OR MIT |
| objc2-osa-kit | 0.3.2 | Zlib OR Apache-2.0 OR MIT |
| objc2-ui-kit | 0.3.2 | Zlib OR Apache-2.0 OR MIT |
| objc2-user-notifications | 0.3.2 | Zlib OR Apache-2.0 OR MIT |
| objc2-web-kit | 0.3.2 | Zlib OR Apache-2.0 OR MIT |
| open | 5.4.4 | MIT |
| openssl-probe | 0.2.1 | MIT OR Apache-2.0 |
| option-ext | 0.2.0 | MPL-2.0 |
| os_pipe | 1.2.3 | MIT |
| osakit | 0.3.1 | MIT OR Apache-2.0 |
| pango | 0.18.3 | MIT |
| pango-sys | 0.18.0 | MIT |
| percent-encoding | 2.3.2 | MIT OR Apache-2.0 |
| phf | 0.13.1 | MIT |
| phf_codegen | 0.13.1 | MIT |
| phf_generator | 0.13.1 | MIT |
| phf_macros | 0.13.1 | MIT |
| phf_shared | 0.13.1 | MIT |
| plist | 1.10.1 | MIT |
| png | 0.17.16 | MIT OR Apache-2.0 |
| potential_utf | 0.1.6 | Unicode-3.0 |
| powerfmt | 0.2.0 | MIT OR Apache-2.0 |
| precomputed-hash | 0.1.1 | MIT |
| proc-macro-crate | 1.3.1 | MIT OR Apache-2.0 |
| proc-macro-crate | 2.0.2 | MIT OR Apache-2.0 |
| proc-macro-crate | 3.5.0 | MIT OR Apache-2.0 |
| proc-macro-error | 1.0.4 | MIT OR Apache-2.0 |
| proc-macro-error-attr | 1.0.4 | MIT OR Apache-2.0 |
| quick-xml | 0.42.0 | MIT |
| r-efi | 5.3.0 | MIT OR Apache-2.0 OR LGPL-2.1-or-later |
| r-efi | 6.0.0 | MIT OR Apache-2.0 OR LGPL-2.1-or-later |
| redox_users | 0.5.3 | MIT |
| ref-cast | 1.0.27 | MIT OR Apache-2.0 |
| ref-cast-impl | 1.0.27 | MIT OR Apache-2.0 |
| regex | 1.13.1 | MIT OR Apache-2.0 |
| regex-automata | 0.4.18 | MIT OR Apache-2.0 |
| regex-syntax | 0.8.11 | MIT OR Apache-2.0 |
| reqwest | 0.13.5 | MIT OR Apache-2.0 |
| rfd | 0.16.0 | MIT |
| ring | 0.17.14 | Apache-2.0 AND ISC |
| roxmltree | 0.20.0 | MIT OR Apache-2.0 |
| rustc-hash | 2.1.3 | Apache-2.0 OR MIT |
| rustc_version | 0.4.1 | MIT OR Apache-2.0 |
| rustix | 1.1.5 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT |
| rustls | 0.23.45 | Apache-2.0 OR ISC OR MIT |
| rustls-native-certs | 0.8.4 | Apache-2.0 OR ISC OR MIT |
| rustls-pki-types | 1.15.1 | MIT OR Apache-2.0 |
| rustls-platform-verifier | 0.7.1 | MIT OR Apache-2.0 |
| rustls-platform-verifier-android | 0.2.0 | MIT OR Apache-2.0 |
| rustls-webpki | 0.103.15 | ISC |
| same-file | 1.0.6 | Unlicense/MIT |
| schannel | 0.1.29 | MIT |
| schemars | 0.8.22 | MIT |
| schemars | 0.9.0 | MIT |
| schemars | 1.2.2 | MIT |
| schemars_derive | 0.8.22 | MIT |
| security-framework | 3.7.0 | MIT OR Apache-2.0 |
| security-framework-sys | 2.17.0 | MIT OR Apache-2.0 |
| selectors | 0.36.1 | MPL-2.0 |
| semver | 1.0.28 | MIT OR Apache-2.0 |
| serde-untagged | 0.1.9 | MIT OR Apache-2.0 |
| serde_derive_internals | 0.29.1 | MIT OR Apache-2.0 |
| serde_repr | 0.1.21 | MIT OR Apache-2.0 |
| serde_spanned | 0.6.9 | MIT OR Apache-2.0 |
| serde_spanned | 1.1.1 | MIT OR Apache-2.0 |
| serde_with | 3.23.0 | MIT OR Apache-2.0 |
| serde_with_macros | 3.23.0 | MIT OR Apache-2.0 |
| serialize-to-javascript | 0.1.2 | MIT OR Apache-2.0 |
| serialize-to-javascript-impl | 0.1.2 | MIT OR Apache-2.0 |
| servo_arc | 0.4.3 | MIT OR Apache-2.0 |
| sha2 | 0.10.9 | MIT OR Apache-2.0 |
| shared_child | 1.1.2 | MIT |
| shlex | 2.0.1 | MIT OR Apache-2.0 |
| sigchld | 0.2.5 | MIT |
| signal-hook | 0.4.4 | MIT OR Apache-2.0 |
| signal-hook-registry | 1.4.8 | MIT OR Apache-2.0 |
| simd_cesu8 | 1.2.0 | Apache-2.0 OR MIT |
| simdutf8 | 0.1.5 | MIT OR Apache-2.0 |
| siphasher | 1.0.4 | MIT OR Apache-2.0 |
| socket2 | 0.6.5 | MIT OR Apache-2.0 |
| softbuffer | 0.4.8 | MIT OR Apache-2.0 |
| soup3 | 0.5.0 | MIT |
| soup3-sys | 0.5.0 | MIT |
| stable_deref_trait | 1.2.1 | MIT OR Apache-2.0 |
| string_cache | 0.9.0 | MIT OR Apache-2.0 |
| string_cache_codegen | 0.6.1 | MIT OR Apache-2.0 |
| strsim | 0.11.1 | MIT |
| subtle | 2.6.1 | BSD-3-Clause |
| swift-rs | 1.0.8 | MIT OR Apache-2.0 |
| syn | 1.0.109 | MIT OR Apache-2.0 |
| sync_wrapper | 1.0.2 | Apache-2.0 |
| synstructure | 0.14.0 | MIT |
| system-configuration | 0.7.0 | MIT OR Apache-2.0 |
| system-configuration-sys | 0.6.0 | MIT OR Apache-2.0 |
| system-deps | 6.2.2 | MIT OR Apache-2.0 |
| tao | 0.35.3 | Apache-2.0 |
| tao-macros | 0.1.4 | MIT OR Apache-2.0 |
| tar | 0.4.46 | MIT OR Apache-2.0 |
| target-lexicon | 0.12.16 | Apache-2.0 WITH LLVM-exception |
| tauri | 2.11.6 | Apache-2.0 OR MIT |
| tauri-build | 2.6.3 | Apache-2.0 OR MIT |
| tauri-codegen | 2.6.3 | Apache-2.0 OR MIT |
| tauri-macros | 2.6.3 | Apache-2.0 OR MIT |
| tauri-plugin | 2.6.3 | Apache-2.0 OR MIT |
| tauri-plugin-dialog | 2.7.3 | Apache-2.0 OR MIT |
| tauri-plugin-fs | 2.5.2 | Apache-2.0 OR MIT |
| tauri-plugin-shell | 2.3.6 | Apache-2.0 OR MIT |
| tauri-plugin-updater | 2.12.0 | Apache-2.0 OR MIT |
| tauri-runtime | 2.11.3 | Apache-2.0 OR MIT |
| tauri-runtime-wry | 2.11.4 | Apache-2.0 OR MIT |
| tauri-utils | 2.9.3 | Apache-2.0 OR MIT |
| tauri-winres | 0.3.6 | MIT |
| tempfile | 3.27.0 | MIT OR Apache-2.0 |
| tendril | 0.5.1 | MIT OR Apache-2.0 |
| thiserror | 1.0.69 | MIT OR Apache-2.0 |
| thiserror-impl | 1.0.69 | MIT OR Apache-2.0 |
| time | 0.3.55 | MIT OR Apache-2.0 |
| time-core | 0.1.9 | MIT OR Apache-2.0 |
| time-macros | 0.2.32 | MIT OR Apache-2.0 |
| tinystr | 0.8.4 | Unicode-3.0 |
| tinyvec | 1.13.3 | Zlib OR Apache-2.0 OR MIT |
| tokio-rustls | 0.26.5 | MIT OR Apache-2.0 |
| tokio-util | 0.7.19 | MIT |
| toml | 0.8.2 | MIT OR Apache-2.0 |
| toml | 0.9.12+spec-1.1.0 | MIT OR Apache-2.0 |
| toml | 1.1.6+spec-1.1.0 | MIT OR Apache-2.0 |
| toml_datetime | 0.6.3 | MIT OR Apache-2.0 |
| toml_datetime | 0.7.5+spec-1.1.0 | MIT OR Apache-2.0 |
| toml_datetime | 1.1.1+spec-1.1.0 | MIT OR Apache-2.0 |
| toml_edit | 0.19.15 | MIT OR Apache-2.0 |
| toml_edit | 0.20.2 | MIT OR Apache-2.0 |
| toml_edit | 0.25.15+spec-1.1.0 | MIT OR Apache-2.0 |
| toml_parser | 1.1.3+spec-1.1.0 | MIT OR Apache-2.0 |
| toml_writer | 1.1.2+spec-1.1.0 | MIT OR Apache-2.0 |
| tower | 0.5.3 | MIT |
| tower-http | 0.6.11 | MIT |
| tower-layer | 0.3.3 | MIT |
| tower-service | 0.3.3 | MIT |
| tracing | 0.1.44 | MIT |
| tracing-core | 0.1.36 | MIT |
| tray-icon | 0.24.2 | MIT OR Apache-2.0 |
| try-lock | 0.2.5 | MIT |
| typeid | 1.0.3 | MIT OR Apache-2.0 |
| typenum | 1.20.1 | MIT OR Apache-2.0 |
| unic-char-property | 0.9.0 | MIT/Apache-2.0 |
| unic-char-range | 0.9.0 | MIT/Apache-2.0 |
| unic-common | 0.9.0 | MIT/Apache-2.0 |
| unic-ucd-ident | 0.9.0 | MIT/Apache-2.0 |
| unic-ucd-version | 0.9.0 | MIT/Apache-2.0 |
| unicode-segmentation | 1.13.3 | MIT OR Apache-2.0 |
| untrusted | 0.9.0 | ISC |
| url | 2.5.8 | MIT OR Apache-2.0 |
| urlpattern | 0.3.0 | MIT |
| utf8_iter | 1.0.4 | Apache-2.0 OR MIT |
| uuid | 1.26.1 | Apache-2.0 OR MIT |
| version-compare | 0.2.1 | MIT |
| vswhom | 0.1.0 | MIT |
| vswhom-sys | 0.1.3 | MIT |
| walkdir | 2.5.0 | Unlicense/MIT |
| want | 0.3.1 | MIT |
| wasi | 0.11.1+wasi-snapshot-preview1 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT |
| wasip2 | 1.0.4+wasi-0.2.12 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT |
| wasm-streams | 0.5.0 | MIT OR Apache-2.0 |
| web_atoms | 0.2.6 | MIT OR Apache-2.0 |
| webkit2gtk | 2.0.2 | MIT |
| webkit2gtk-sys | 2.0.2 | MIT |
| webpki-root-certs | 1.0.9 | CDLA-Permissive-2.0 |
| webview2-com | 0.38.2 | MIT |
| webview2-com-macros | 0.8.1 | MIT |
| webview2-com-sys | 0.38.2 | MIT |
| window-vibrancy | 0.6.0 | Apache-2.0 OR MIT |
| windows | 0.61.3 | MIT OR Apache-2.0 |
| windows-collections | 0.2.0 | MIT OR Apache-2.0 |
| windows-core | 0.61.2 | MIT OR Apache-2.0 |
| windows-future | 0.2.1 | MIT OR Apache-2.0 |
| windows-link | 0.1.3 | MIT OR Apache-2.0 |
| windows-numerics | 0.2.0 | MIT OR Apache-2.0 |
| windows-registry | 0.6.1 | MIT OR Apache-2.0 |
| windows-result | 0.3.4 | MIT OR Apache-2.0 |
| windows-strings | 0.4.2 | MIT OR Apache-2.0 |
| windows-sys | 0.45.0 | MIT OR Apache-2.0 |
| windows-sys | 0.52.0 | MIT OR Apache-2.0 |
| windows-sys | 0.59.0 | MIT OR Apache-2.0 |
| windows-sys | 0.60.2 | MIT OR Apache-2.0 |
| windows-targets | 0.42.2 | MIT OR Apache-2.0 |
| windows-targets | 0.52.6 | MIT OR Apache-2.0 |
| windows-targets | 0.53.5 | MIT OR Apache-2.0 |
| windows-threading | 0.1.0 | MIT OR Apache-2.0 |
| windows-version | 0.1.7 | MIT OR Apache-2.0 |
| windows_aarch64_gnullvm | 0.42.2 | MIT OR Apache-2.0 |
| windows_aarch64_gnullvm | 0.52.6 | MIT OR Apache-2.0 |
| windows_aarch64_gnullvm | 0.53.1 | MIT OR Apache-2.0 |
| windows_aarch64_msvc | 0.42.2 | MIT OR Apache-2.0 |
| windows_aarch64_msvc | 0.52.6 | MIT OR Apache-2.0 |
| windows_aarch64_msvc | 0.53.1 | MIT OR Apache-2.0 |
| windows_i686_gnu | 0.42.2 | MIT OR Apache-2.0 |
| windows_i686_gnu | 0.52.6 | MIT OR Apache-2.0 |
| windows_i686_gnu | 0.53.1 | MIT OR Apache-2.0 |
| windows_i686_gnullvm | 0.52.6 | MIT OR Apache-2.0 |
| windows_i686_gnullvm | 0.53.1 | MIT OR Apache-2.0 |
| windows_i686_msvc | 0.42.2 | MIT OR Apache-2.0 |
| windows_i686_msvc | 0.52.6 | MIT OR Apache-2.0 |
| windows_i686_msvc | 0.53.1 | MIT OR Apache-2.0 |
| windows_x86_64_gnu | 0.42.2 | MIT OR Apache-2.0 |
| windows_x86_64_gnu | 0.52.6 | MIT OR Apache-2.0 |
| windows_x86_64_gnu | 0.53.1 | MIT OR Apache-2.0 |
| windows_x86_64_gnullvm | 0.42.2 | MIT OR Apache-2.0 |
| windows_x86_64_gnullvm | 0.52.6 | MIT OR Apache-2.0 |
| windows_x86_64_gnullvm | 0.53.1 | MIT OR Apache-2.0 |
| windows_x86_64_msvc | 0.42.2 | MIT OR Apache-2.0 |
| windows_x86_64_msvc | 0.52.6 | MIT OR Apache-2.0 |
| windows_x86_64_msvc | 0.53.1 | MIT OR Apache-2.0 |
| winnow | 0.5.40 | MIT |
| winnow | 0.7.15 | MIT |
| winnow | 1.0.4 | MIT |
| winreg | 0.55.0 | MIT |
| wit-bindgen | 0.57.1 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT |
| writeable | 0.6.4 | Unicode-3.0 |
| wry | 0.55.1 | Apache-2.0 OR MIT |
| x11 | 2.21.0 | MIT |
| x11-dl | 2.21.0 | MIT |
| xattr | 1.6.1 | MIT OR Apache-2.0 |
| yoke | 0.8.3 | Unicode-3.0 |
| yoke-derive | 0.8.3 | Unicode-3.0 |
| zerofrom | 0.1.8 | Unicode-3.0 |
| zerofrom-derive | 0.1.8 | Unicode-3.0 |
| zeroize | 1.9.0 | Apache-2.0 OR MIT |
| zerotrie | 0.2.5 | Unicode-3.0 |
| zerovec | 0.11.8 | Unicode-3.0 |
| zerovec-derive | 0.11.6 | Unicode-3.0 |
| zip | 4.6.1 | MIT |

### Added with tauri-plugin-single-instance (1.87.4)

| Crate | Version | Licence |
|---|---|---|
| async-broadcast | 0.7.2 | MIT OR Apache-2.0 |
| async-channel | 2.5.0 | Apache-2.0 OR MIT |
| async-executor | 1.14.0 | Apache-2.0 OR MIT |
| async-io | 2.6.0 | Apache-2.0 OR MIT |
| async-lock | 3.4.2 | Apache-2.0 OR MIT |
| async-process | 2.5.0 | Apache-2.0 OR MIT |
| async-recursion | 1.2.0 | MIT OR Apache-2.0 |
| async-signal | 0.2.14 | Apache-2.0 OR MIT |
| async-task | 4.7.1 | Apache-2.0 OR MIT |
| async-trait | 0.1.92 | MIT OR Apache-2.0 |
| blocking | 1.7.0 | Apache-2.0 OR MIT |
| concurrent-queue | 2.5.0 | Apache-2.0 OR MIT |
| endi | 1.1.1 | MIT |
| enumflags2 | 0.7.12 | MIT OR Apache-2.0 |
| enumflags2_derive | 0.7.12 | MIT OR Apache-2.0 |
| event-listener | 5.4.2 | Apache-2.0 OR MIT |
| event-listener-strategy | 0.5.4 | Apache-2.0 OR MIT |
| futures-lite | 2.6.1 | Apache-2.0 OR MIT |
| hermit-abi | 0.5.3 | MIT OR Apache-2.0 |
| ordered-stream | 0.2.0 | MIT OR Apache-2.0 |
| parking | 2.2.1 | Apache-2.0 OR MIT |
| piper | 0.2.5 | MIT OR Apache-2.0 |
| polling | 3.11.0 | Apache-2.0 OR MIT |
| tauri-plugin-single-instance | 2.4.5 | Apache-2.0 OR MIT |
| tracing-attributes | 0.1.31 | MIT |
| uds_windows | 1.2.1 | MIT |
| zbus | 5.19.0 | MIT |
| zbus_macros | 5.19.0 | MIT |
| zbus_names | 4.3.5 | MIT |
| zcheapstr | 1.1.0 | MIT |
| zvariant | 5.15.1 | MIT |
| zvariant_derive | 5.15.1 | MIT |
| zvariant_utils | 4.2.0 | MIT |

## The engine's Python packages (frozen desktop engine)

Every package installed by `backend/requirements.txt` and frozen into `formvis-engine` by `setup/freeze_backend`, with its licence as the package's own metadata gives it (`importlib.metadata`, 2026-10-19, CPython 3.13, Linux x86_64 wheels). This includes the dependencies that pip pulls in, which the rows above do not name one by one.

`certifi` carries Mozilla's CA bundle (`cacert.pem`) under MPL-2.0, used unmodified; its source is at https://github.com/certifi/python-certifi. `tqdm` (ML extra) is MPL-2.0 AND MIT, used unmodified; its source is at https://github.com/tqdm/tqdm. `typing_extensions` is under the Python Software Foundation License 2.0.

| Package | Version | License | Notes |
| --- | --- | --- | --- |
| annotated-doc | 0.0.5 | MIT |  |
| annotated-types | 0.8.0 | MIT |  |
| anyio | 4.15.1 | MIT |  |
| attrs | 26.1.0 | MIT |  |
| certifi | 2026.10.18 | MPL-2.0 |  |
| cffi | 2.1.1 | MIT-0 |  |
| click | 8.5.0 | BSD-3-Clause |  |
| cryptography | 50.0.2 | Apache-2.0 OR BSD-3-Clause |  |
| fastapi | 0.141.1 | MIT |  |
| flatbuffers | 25.12.19 | Apache-2.0 |  |
| h11 | 0.16.0 | MIT |  |
| httpcore | 1.0.9 | BSD-3-Clause |  |
| httptools | 0.9.0 | MIT |  |
| httpx | 0.28.1 | BSD-3-Clause |  |
| idna | 3.20 | BSD-3-Clause |  |
| jaraco.classes | 3.4.0 | MIT |  |
| jaraco.context | 6.1.2 | MIT |  |
| jaraco.functools | 4.6.0 | MIT |  |
| jeepney | 0.9.0 | MIT |  |
| keyring | 25.7.0 | MIT |  |
| ml_dtypes | 0.6.0 | Apache-2.0 |  |
| more-itertools | 11.2.1 | MIT |  |
| numpy | 2.5.3 | BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0 |  |
| onnx | 1.23.1 | Apache-2.0 |  |
| onnxruntime | 1.30.0 | MIT |  |
| opencv-python-headless | 5.0.0.93 | Apache-2.0 (OpenCV), MIT (packaging) |  |
| OpenEXR | 3.5.2 | BSD-3-Clause |  |
| packaging | 26.3 | Apache-2.0 OR BSD-2-Clause |  |
| pillow | 12.3.0 | MIT-CMU |  |
| pillow_heif | 1.7.0 | BSD-3-Clause | not in the desktop engine (`--exclude-module pillow_heif`); bundles LGPL libheif and libde265 and GPL x265 |
| protobuf | 7.36.2 | BSD-3-Clause |  |
| psd-tools | 1.23.0 | MIT |  |
| ptyprocess | 0.7.0 | ISC |  |
| pycparser | 3.11 | BSD-3-Clause |  |
| pydantic | 2.14.1 | MIT |  |
| pydantic_core | 2.50.1 | MIT |  |
| pyspellchecker | 0.9.1 | MIT |  |
| python-dotenv | 1.2.4 | BSD-3-Clause |  |
| python-multipart | 0.0.32 | Apache-2.0 |  |
| pywinpty | 3.0.5 | MIT | Windows only |
| PyYAML | 6.0.3 | MIT |  |
| rawpy | 0.27.1 | MIT |  |
| SecretStorage | 3.5.0 | BSD-3-Clause |  |
| starlette | 1.9.0 | BSD-3-Clause |  |
| tifffile | 2026.3.3 | BSD-3-Clause |  |
| typing-inspection | 0.4.4 | MIT |  |
| typing_extensions | 4.16.0 | PSF-2.0 |  |
| uvicorn | 0.53.0 | BSD-3-Clause |  |
| uvloop | 0.23.0 | Apache-2.0 OR MIT |  |
| watchfiles | 1.3.0 | MIT |  |
| websockets | 17.2 | BSD-3-Clause |  |

### Added when the engine is frozen with the ML extra (`FORMVIS_FREEZE_ML=1`)

| Package | Version | License | Notes |
| --- | --- | --- | --- |
| charset-normalizer | 3.5.2 | MIT |  |
| ImageIO | 2.38.1 | BSD-2-Clause |  |
| jsonschema | 4.26.0 | MIT |  |
| jsonschema-specifications | 2025.9.1 | MIT |  |
| lazy-loader | 0.6 | BSD-3-Clause |  |
| llvmlite | 0.50.0 | BSD-2-Clause AND Apache-2.0 WITH LLVM-exception |  |
| networkx | 3.7 | BSD-3-Clause |  |
| numba | 0.68.0 | BSD-2-Clause |  |
| platformdirs | 4.13.5 | MIT |  |
| pooch | 1.9.0 | BSD-3-Clause |  |
| PyMatting | 1.1.16 | MIT |  |
| referencing | 0.37.0 | MIT |  |
| rembg | 2.0.84 | MIT |  |
| requests | 2.34.2 | Apache-2.0 |  |
| rpds-py | 2026.9.1 | MIT |  |
| scikit-image | 0.26.0 | BSD-3-Clause |  |
| scipy | 1.18.1 | BSD-3-Clause |  |
| tqdm | 4.70.1 | MPL-2.0 AND MIT |  |
| urllib3 | 2.8.0 | MIT |  |

## Native libraries inside the Python wheels

Several wheels carry compiled libraries of their own. These ship inside the frozen engine and keep their own licences. Versions are those in the pinned wheels listed above (Linux x86_64). The macOS and Windows wheels carry a similar, but not identical, set; re-run the check at the end of this file on each build platform.

| Wheel | Bundled library | License |
| --- | --- | --- |
| Pillow 12.3.0 | FreeType 2.14.3 | FreeType License (FTL), chosen over GPL-2.0 |
| Pillow 12.3.0 | libjpeg-turbo (IJG and BSD-3-Clause parts) | IJG License, BSD-3-Clause, Zlib |
| Pillow 12.3.0 | libpng, zlib 1.3 | libpng License, Zlib |
| Pillow 12.3.0 | libtiff 4.7.1 | libtiff License (BSD-like) |
| Pillow 12.3.0 | libwebp 1.6.0 (with libsharpyuv) | BSD-3-Clause |
| Pillow 12.3.0 | libavif 1.4.2 | BSD-2-Clause |
| Pillow 12.3.0 | OpenJPEG 2.5.4 | BSD-2-Clause |
| Pillow 12.3.0 | Little CMS 2.19 | MIT |
| Pillow 12.3.0 | HarfBuzz, raqm 0.10.5 | MIT |
| Pillow 12.3.0 | Brotli | MIT |
| Pillow 12.3.0 | zstd | BSD-3-Clause |
| Pillow 12.3.0 | XZ Utils (liblzma) | 0BSD |
| Pillow 12.3.0 | libxcb, libXau (Linux) | MIT |
| opencv-python-headless 5.0.0.93 | FFmpeg (libavcodec 62.28, libavformat 62.12, libavutil, libswscale, libswresample), Linux and Windows wheels | LGPL-2.1-or-later. The macOS wheel carries GPL FFmpeg parts (libx264, libx265, rubberband, vidstab, postproc), so macOS builds install OpenCV from source without FFmpeg and `setup/freeze_backend` stops if any of those libraries reach the engine |
| opencv-python-headless 5.0.0.93 | libvpx | BSD-3-Clause |
| opencv-python-headless 5.0.0.93 | libaom | BSD-2-Clause, with the Alliance for Open Media Patent License 1.0 |
| opencv-python-headless 5.0.0.93 | libavif | BSD-2-Clause |
| opencv-python-headless 5.0.0.93 | OpenSSL 1.1.1k (libssl, libcrypto) | OpenSSL License and original SSLeay License (dual; not Apache-2.0, which applies only from OpenSSL 3.0). Confirmed in the wheel's `LICENSE-3RD-PARTY.txt` (copy in `licenses/python/opencv-python-headless/`) and the bundled `libssl`/`libcrypto` 1.1.1k files |
| opencv-python-headless 5.0.0.93 | libdrm (Linux) | MIT |
| opencv-python-headless 5.0.0.93 | libjpeg-turbo 3.1.2, libpng 1.6.58, libtiff 4.7.1, libwebp, OpenJPEG 2.5.3 | as for Pillow above |
| opencv-python-headless 5.0.0.93 | OpenBLAS 0.3.15 | BSD-3-Clause |
| numpy 2.5.3, scipy 1.18.1 (ML extra), opencv | OpenBLAS (scipy-openblas) | BSD-3-Clause |
| numpy 2.5.3, scipy 1.18.1 (ML extra), opencv | libgfortran | GPL-3.0-or-later WITH GCC-exception-3.1 |
| numpy 2.5.3, scipy 1.18.1 (ML extra), opencv | libquadmath | LGPL-2.1-or-later |
| rawpy 0.27.1 | LibRaw 0.22.1 | LGPL-2.1 or CDDL-1.0, at the recipient's choice |
| rawpy 0.27.1 | JasPer | JasPer License 2.0 (MIT-style) |
| rawpy 0.27.1 | libjpeg, Little CMS | as for Pillow above |
| rawpy 0.27.1 | libgomp | GPL-3.0-or-later WITH GCC-exception-3.1 |
| onnxruntime 1.30.0 | its third-party components | as listed in the wheel's `onnxruntime/ThirdPartyNotices.txt`, reproduced as `licenses/onnxruntime-ThirdPartyNotices.txt` |
| OpenEXR 3.5.2 | OpenEXR, Imath, libdeflate | BSD-3-Clause, BSD-3-Clause, MIT |

The GCC runtime libraries (libgfortran, libgomp) are distributed under the GCC Runtime Library Exception 3.1, which permits distributing them with formvis under its own licence.

### Required credits

- Portions of this software are copyright © 2026 The FreeType Project (www.freetype.org). All rights reserved.
- This software is based in part on the work of the Independent JPEG Group.

### LGPL libraries and their source

formvis ships these LGPL libraries unmodified, as the shared libraries their wheels provide, inside the frozen engine: FFmpeg (in opencv-python-headless), LibRaw (in rawpy, also available under CDDL-1.0) and libquadmath (in numpy, scipy and opencv). You may replace them. formvis's own source, including `setup/freeze_backend`, is public under Apache-2.0, so you can rebuild the engine against modified versions of these libraries. Their source code is available from:

- FFmpeg: https://ffmpeg.org/download.html, and the opencv-python build sources at https://github.com/opencv/opencv-python
- LibRaw: https://www.libraw.org/download and https://github.com/LibRaw/LibRaw
- libquadmath (part of GCC): https://gcc.gnu.org/

On request to the formvis maintainers, we will also provide the exact source of the versions shipped in any formvis release, for at least three years after that release.

### Linux AppImage

The Linux AppImage that `tauri build` makes (`"targets": "all"`) bundles the system's WebKitGTK, GTK and GLib libraries, which are under LGPL-2.1-or-later (WebKitGTK also includes BSD-licensed parts). They are included unmodified as separate shared libraries. Their source is available from https://webkitgtk.org/, https://www.gtk.org/ and https://gitlab.gnome.org/GNOME/glib. The .deb and .rpm packages use the system's copies instead and do not include them. On macOS and Windows, formvis uses the system web view (WKWebView, WebView2) and ships none of it.

## Keeping this file current

The licence texts themselves are in `licenses/` at the repository root, bundled into every installer through `bundle.resources` in `src-tauri/tauri.conf.json`; `setup/collect_licenses.py` regenerates them (see `licenses/README.md`). flatbuffers, antlr4-python3-runtime and cuda-toolkit ship no licence file in their wheels, so their texts are not in that folder yet.

After any dependency change, regenerate the tables above:

```
cd src-tauri && cargo metadata --format-version 1 > ../build/tauri-meta.json   # crates, with licences
python -m venv /tmp/fv-notice && /tmp/fv-notice/bin/pip install -r backend/requirements.txt
/tmp/fv-notice/bin/python -c "import importlib.metadata as m; [print(d.metadata['Name'], d.version, d.metadata.get('License-Expression') or d.metadata.get('License')) for d in m.distributions()]"
ls /tmp/fv-notice/lib/python3*/site-packages/*.libs                               # native libraries the wheels carry
```
