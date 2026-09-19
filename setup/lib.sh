#!/usr/bin/env bash
SONNY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export SONNY_ROOT
cv_say() { printf '[sonny] %s\n' "$*"; }
cv_die() { printf '[sonny] error: %s\n' "$*" >&2; exit 1; }
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
  [ -f "$SONNY_ROOT/backend/venv/bin/activate" ] || cv_die "backend venv missing, run ./sonny install"
  # shellcheck disable=SC1091
  source "$SONNY_ROOT/backend/venv/bin/activate"
}
cv_target_triple() {
  if [ -n "${SONNY_TARGET:-}" ]; then echo "$SONNY_TARGET"; return 0; fi
  command -v rustc >/dev/null 2>&1 || return 1
  rustc -vV | awk '/^host:/ {print $2}'
}
cv_exe() { [ "$(cv_os)" = windows ] && echo ".exe" || echo ""; }
