#!/usr/bin/env bash
FORMVIS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export FORMVIS_ROOT
cv_say() { printf '[formvis] %s\n' "$*"; }
cv_die() { printf '[formvis] error: %s\n' "$*" >&2; exit 1; }
cv_os() {
  case "$(uname -s 2>/dev/null)" in
    Darwin) echo macos ;;
    Linux) echo linux ;;
    MINGW*|MSYS*|CYGWIN*) echo windows ;;
    *) echo unknown ;;
  esac
}
cv_python() {
  local c
  for c in python3.14 python3.13 python3.12 python3; do
    if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 12) else 1)' 2>/dev/null; then
      echo "$c"
      return 0
    fi
  done
  return 1
}
cv_venv() {
  [ -f "$FORMVIS_ROOT/backend/venv/bin/activate" ] || cv_die "backend venv missing, run ./formvis install"
  # shellcheck disable=SC1091
  source "$FORMVIS_ROOT/backend/venv/bin/activate"
}
cv_target_triple() {
  if [ -n "${FORMVIS_TARGET:-}" ]; then echo "$FORMVIS_TARGET"; return 0; fi
  command -v rustc >/dev/null 2>&1 || return 1
  rustc -vV | awk '/^host:/ {print $2}'
}
cv_exe() { [ "$(cv_os)" = windows ] && echo ".exe" || echo ""; }
cv_rust_env() {
  [ -d "$HOME/.cargo/bin" ] && PATH="$HOME/.cargo/bin:$PATH"
  export PATH
  unset RUSTC RUSTC_WORKSPACE_WRAPPER RUSTFLAGS CARGO_ENCODED_RUSTFLAGS CARGO_BUILD_RUSTFLAGS CARGO_BUILD_TARGET CARGO_TARGET_DIR CARGO_BUILD_TARGET_DIR CARGO_BUILD_RUSTC
  export RUSTC_WRAPPER="" CARGO_BUILD_RUSTC_WRAPPER=""
  if command -v rustup >/dev/null 2>&1 && rustup toolchain list 2>/dev/null | grep -q '^stable'; then
    export RUSTUP_TOOLCHAIN="${FORMVIS_RUST_TOOLCHAIN:-stable}"
  fi
}
cv_rust_fresh() {
  local target="$FORMVIS_ROOT/src-tauri/target" now
  now="$(rustc -vV 2>/dev/null | tr '\n' ' ')"
  if [ -d "$target/release" ] && [ "$(cat "$target/.formvis-rustc" 2>/dev/null)" != "$now" ]; then
    cv_say "the Rust compiler differs from the one that built src-tauri/target; cleaning it"
    ( cd "$FORMVIS_ROOT/src-tauri" && cargo clean )
  fi
  mkdir -p "$target"
  printf '%s' "$now" > "$target/.formvis-rustc"
}
