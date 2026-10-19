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

## Not in v1

Pixels are 8 bit RGBA of the whole layer, not normalised f32 in the document's colour model; no bands, channels, deep or CMYK data, and no panels, access to other layers or file-format hooks (ABI v2).

## Build the sample

See `examples/wasm-filter/Cargo.toml`. In short: `rustup target add wasm32-unknown-unknown`, then `cargo build --release` in that folder.
