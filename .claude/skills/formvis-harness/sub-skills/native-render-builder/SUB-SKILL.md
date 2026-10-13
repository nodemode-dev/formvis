---
name: native-render-builder
description: The Rust crate native/formvis-render and how the desktop app uses it. Use for the wgpu compositor, tiled GPU layers, the GPU brush dab, blend.wgsl blend modes, the display surface, the memory budget, the brush benchmark and the formvis-render command line, the window example, the Tauri native commands in src-tauri/src/native.rs, and the frontend NativeDisplay in frontend/src/gpu/native-display.ts.
---

# native-render-builder

`native/formvis-render` is formvis's own GPU renderer on wgpu (Metal, Vulkan, Direct3D 12): tiled layers, a GPU brush and compositing. It is opt-in. The desktop app starts it only when the person chooses the native renderer in Preferences; the web app never uses it.

## Crate layout (`native/formvis-render`)

| File | Role |
| --- | --- |
| `Cargo.toml` | Package `formvis-render` (its own version, not one of the 8 release sites). Pinned dependencies `wgpu`, `pollster`, `bytemuck`, `sysinfo`, `png`, `serde_json`; optional `winit` behind the `window` feature |
| `src/lib.rs` | `Gpu` (`new`, `describe`, `for_window`), `TILE` (256), `Native`, `enabled()` (the `FORMVIS_NATIVE` variable), `native_start`, `native_force`, `TiledLayer` (`new`, `write`, `allocated`, `dab`, `read`) |
| `src/composite.rs` | `Blender`, `Stack` (`new`, `adjustment`, `transformed`, `masked`, `clipped_to`), `Affine` (`translate`, `rotate_about`, `scale_about`, `apply`, `inverse`), `Source`, `Clip` |
| `src/blend.wgsl` | The blend modes in WGSL; the 27 mode ids must match `BLEND_MODES` order in `frontend/src/engine/types.ts` |
| `src/document.rs` | `Document` and `LayerSpec`: `put_pixels`, `put_table`, `set_stack`, `remove`, `layer`, `stack` |
| `src/display.rs` | `Display` (`new`, `resize`, `present`), `View`, `Checker`, `Presented` |
| `src/budget.rs` | `Budget`, `budget_for(ram)`, `system_budget()`, `SHARE` 0.6, `BYTES_PER_PIXEL` 16 |
| `src/bench.rs`, `src/bin/brush_bench.rs` | The brush benchmark: pointer updates across a 4,000 px document, median, 95th percentile and worst time |
| `src/bin/formvis-render.rs` | Command line over the same code (it uses `Blender`, `Stack`, `bench`, `budget`, `native_force`, `TiledLayer` and a 27 name blend table); read its `arg` handling before extending it |
| `examples/window.rs` | A winit window, needs `--features window` |
| `tests/` | `blend.rs`, `budget.rs`, `document.rs`, `layers.rs`, `tiles.rs`, `transform.rs` |

## The bridge to the app

- `src-tauri/src/native.rs` owns `NativeState` and the Tauri commands the page calls with `invoke`: `native_start`, `native_stop`, `native_doc`, `native_put` (raw pixel bytes with header values), `native_table`, `native_stack`, `native_remove`, `native_present`. `src-tauri/Cargo.toml` depends on the crate by path. `src-tauri/capabilities/default.json` is `core:default`; a new command needs a capability check there.
- `frontend/src/gpu/native-display.ts` (`NativeDisplay.create`, a `ScreenDisplay`) mirrors the document: each image, mask and table gets a stable id and is sent again only when its version changes, then the stack and the view. Frames in flight are coalesced to the latest. `unsupported()` names what the native path cannot draw yet (3D tables, folder masks, a mask placed apart from the document) and the stage falls back to the CPU with that reason.
- Renderer choice: `frontend/src/gpu/probe.ts` (`probeGpu`, `chooseRenderer`, `GpuRenderer` includes `'native'`), fallback rules in `frontend/src/gpu/fallback.ts`, the web displays in `display.ts`, `gl-display.ts` and `blender.ts`, the benchmark in `bench.ts`. Help > Performance Benchmark times both paths.
- macOS note in `native.rs`: the Metal layer must sit beneath the web view; it has not been confirmed on a Mac in this tree.

## Working on it

1. Build and test outside the repo tree so `native/formvis-render/target` is not created: `./formvis test native` sets `CARGO_TARGET_DIR` to a temporary folder (`${TMPDIR:-/tmp}/formvis-render-target`) and runs `cargo test --quiet`. If Rust is missing, it says so and skips. `native/formvis-render/target/` is untracked build output: never commit it, never zip it.
2. Benchmark: `cargo run --release --bin brush_bench` from the crate folder (with `CARGO_TARGET_DIR` set elsewhere); the figure is meaningless without the adapter line it prints.
3. Keep blend maths, mask semantics and tile size identical in WGSL and in the TypeScript renderers (`frontend/src/gpu/blend-wgsl.ts`, `engine/blend.ts`); a new blend mode lands in all of them together, with `BLEND_MODES` and the "N blend modes" figure in `README.md` that `./formvis counts --check` verifies.
4. Rust lines count toward the README Stack sentence (`src-tauri/src` and `native/`, tests excluded); run `./formvis counts --check` after sizeable changes.
5. Pin dependencies exactly (`=x.y.z`) as the manifest does; commit `Cargo.lock`.
6. Log changes in a HASHOUT log (`frontend/HASHOUT_LOG.md` for the page side, `backend/HASHOUT_LOG.md` for the engine service and the desktop shell's version lines), with removed code quoted in full.
