@echo off
setlocal
cd /d "%~dp0.."
set "FAIL=0"
set "PY=backend\venv\Scripts\python.exe"
if not exist "%PY%" set "PY=python"
echo [formvis] unit tests (vitest)
pushd frontend
call npm test --silent || set "FAIL=1"
popd
echo [formvis] backend tests (pytest)
"%PY%" -c "import pytest, httpx" >nul 2>nul || "%PY%" -m pip install -q pytest httpx
pushd backend
"%PY%" -m pytest -q tests || set "FAIL=1"
popd
"%PY%" -c "import pytest, playwright" >nul 2>nul && ( echo [formvis] browser tests & "%PY%" -m pytest -q e2e || set "FAIL=1" ) || echo [formvis] browser tests skipped: pip install pytest playwright, then python -m playwright install chromium
rem The native GPU renderer (native\formvis-render), on this machine's GPU backend (Direct3D 12 or Vulkan); built outside the repo.
where cargo >nul 2>nul && ( echo [formvis] native renderer tests ^(cargo^) & pushd native\formvis-render & set "CARGO_TARGET_DIR=%TEMP%\formvis-render-target" & cargo test --quiet || set "FAIL=1" & popd ) || echo [formvis] native renderer tests skipped: install Rust from https://rustup.rs
exit /b %FAIL%
