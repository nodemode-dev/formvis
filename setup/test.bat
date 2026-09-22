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
exit /b %FAIL%
