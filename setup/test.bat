@echo off
setlocal
cd /d "%~dp0.."
set "FAIL=0"
set "PY=backend\venv\Scripts\python.exe"
if not exist "%PY%" set "PY=python"
echo [sonny] unit tests (vitest)
pushd frontend
call npm test --silent || set "FAIL=1"
popd
echo [sonny] backend tests (pytest)
"%PY%" -c "import pytest, httpx" >nul 2>nul || "%PY%" -m pip install -q pytest httpx
pushd backend
"%PY%" -m pytest -q tests || set "FAIL=1"
popd
"%PY%" -c "import pytest, playwright" >nul 2>nul && ( echo [sonny] browser tests & "%PY%" -m pytest -q e2e || set "FAIL=1" ) || echo [sonny] browser tests skipped: pip install pytest playwright, then python -m playwright install chromium
rem The native GPU renderer (native\sonny-render), on this machine's GPU backend (Direct3D 12 or Vulkan); built outside the repo.
where cargo >nul 2>nul && ( echo [sonny] native renderer tests (cargo) & pushd native\sonny-render & set "CARGO_TARGET_DIR=%TEMP%\sonny-render-target" & cargo test --quiet || set "FAIL=1" & popd ) || echo [sonny] native renderer tests skipped: install Rust from https://rustup.rs
exit /b %FAIL%
