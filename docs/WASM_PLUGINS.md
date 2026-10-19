# WebAssembly filter plug-ins, ABI v1

A plug-in is one `.wasm` module. formvis runs it in a sandboxed Worker, once per preview or apply, on a fresh instance.

## Module contract

| Export | Signature | Meaning |
| --- | --- | --- |
| `memory` | memory | The module's own memory. It must declare a maximum no larger than the memory limit (256 MB by default). |
| `abi_version` | `() -> i32` | Returns 1. |
| `alloc` | `(size: u32) -> u32` | A pointer to `size` writable bytes, or 0. The host calls it twice per run: pixels, then parameters. |
| `filter` | `(ptr: u32, width: u32, height: u32, params: u32) -> i32` | Filters in place. `ptr` holds `width * height * 4` bytes of 8 bit straight RGBA. `params` points at little-endian f32 values, one per schema parameter in schema order (range: the value, select: the option index, check: 0 or 1). Returns 0, or an error code. |
| `schema_ptr`, `schema_len` | `() -> u32` | The JSON schema as UTF-8 (at most 64 KB). Optional when a `.json` sidecar with the same text is installed beside the module. |

The only import allowed is `env.progress(percent: i32)`. A module that imports anything else is refused, so a plug-in has no network, no files, no clock and no page.

## Schema

```json
{ "abi": 1, "id": "tint-mix", "name": "Tint Mix", "version": "1.0.0", "author": "", "description": "", "reach": 0,
  "params": [
    { "key": "amount", "label": "Amount (%)", "kind": "range", "min": 0, "max": 100, "step": 1, "def": 40 },
    { "key": "mode", "label": "Mode", "kind": "select", "options": [["mix", "Mix"], ["multiply", "Multiply"]], "def": "mix" },
    { "key": "skip", "label": "Leave transparent pixels alone", "kind": "check", "def": true } ] }
```

`id` is lower case letters, digits and hyphens; installing the same id replaces the plug-in. `reach` is how many pixels past a pixel the filter reads (it pads the layer by that much and sets a smart filter's margin). At most 32 parameters. The dialog is generated from `params` and previews live.

## Limits

- Module size 1 MB. Memory: the declared maximum must not exceed the memory limit, and a layer that needs more than the limit is refused. Time: 10 s by default; a run that passes it is ended by terminating its Worker. Both limits are set in Filter > Plug-ins (WebAssembly) > Manage (time 1 to 120 s, memory 16 to 1024 MB).
- Cancelling a run (Cancel in the dialog) terminates the Worker the same way. `env.progress` feeds the dialog's progress text.

## Where they live

Installed plug-ins are kept in the browser's storage (IndexedDB `formvis-wasm-plugins`) and loaded at startup. A plug-in is a smart filter when a smart object is the active layer: the settings are stored as `{ values }` under the filter kind `wasm:[id]`, and the object renders it in the background.

## ABI v2: 16 bit, 32 bit float, CMYK, Lab, one channel and alpha

v2 sits beside v1; a v1 module and its schema work unchanged (8 bit RGBA, `abi` 1). A v2 module exports `abi_version() -> 2` and `filter2` in place of `filter`; `memory`, `alloc`, the schema exports and the single `env.progress` import are as in v1.

| Export | Signature | Meaning |
| --- | --- | --- |
| `filter2` | `(ptr: u32, width: u32, height: u32, params: u32, desc: u32) -> i32` | Filters in place. `ptr` holds `width * height` pixels of interleaved samples, colour channels first and straight alpha last when `desc` says so. `params` is as in v1. Returns 0, or an error code. |

`desc` points at eight little-endian u32 words: `[0]` 2, `[1]` format (0 u8, 1 u16, 2 f32), `[2]` model (0 rgb, 1 gray, 2 cmyk, 3 lab), `[3]` colour channels, `[4]` alpha present (0 or 1), `[5]` bytes per sample, `[6]` row stride in bytes, `[7]` 1 when the values are linear light (a 32 bit document). `alloc` must return pointers aligned to the sample size. Samples are normalised: u8 is 0 to 255, u16 is 0 to 65535, f32 is 0 to 1 (CMYK ink: 0 paper, 1 full ink; linear RGB in a 32 bit document may pass 1; Lab is L 0 to 100 and signed a, b, f32 only).

The v2 schema adds three fields (all optional): `"formats": ["u8", "u16", "f32"]` (default `["u8"]`), `"models": ["rgb", "gray", "cmyk", "lab"]` (default `["rgb"]`) and `"alpha"`: `"none"` (alpha is not sent and stays as it was), `"pass"` (sent, and kept as it was whatever the module writes; the default) or `"process"` (the module's alpha replaces the layer's). The host sends the first format in this order that the module declares: for an 8 bit layer u8, u16, f32; for 16 bit u16, f32, u8; for 32 bit f32 only (a module without f32 is refused rather than clipping the document). A module that does not list the layer's colour model is refused with that said. A one-channel plane (`gray`, no alpha) is how an alpha channel or a mask is filtered.

The host side is `frontend/src/engine/wasm-abi2.ts` (descriptor, pack and unpack, format choice) and `runWasmPlane` in `wasm-plugin-host.ts`; Filter > Plug-ins applies a v2 plug-in to a 16 bit, 32 bit or CMYK layer's own float pixels as one undo step inside the selection. The sample is `examples/wasm-filter-v2` (Channel Gain).

## Not yet

Bands and neighbourhood tiles for very large layers, a panel UI for a plug-in, access to other layers, and file-format hooks.

## Build the sample

See `examples/wasm-filter/Cargo.toml`. In short: `rustup target add wasm32-unknown-unknown`, then `cargo build --release` in that folder.
