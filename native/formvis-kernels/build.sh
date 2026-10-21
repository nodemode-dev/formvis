#!/usr/bin/env bash
# Rebuilds the WebAssembly kernel modules into frontend/src/engine/kernels-wasm. With names, builds only those
# (for example: build.sh tone blur); with none, builds all. CARGO_TARGET_DIR may point at a scratch folder.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
out="$here/../../frontend/src/engine/kernels-wasm"
target="${CARGO_TARGET_DIR:-$here/target}"
names=("$@")
if [ ${#names[@]} -eq 0 ]; then names=(mask tone blur resample dither heal noise patch color blend transfer); fi
cd "$here"
for name in "${names[@]}"; do
  RUSTFLAGS="-C target-feature=+simd128" CARGO_TARGET_DIR="$target" cargo build --release --target wasm32-unknown-unknown --no-default-features --features "$name"
  cp "$target/wasm32-unknown-unknown/release/formvis_kernels.wasm" "$out/formvis-kernels-$name.wasm"
done
