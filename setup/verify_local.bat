@echo off
setlocal
cd /d "%~dp0.."
rem ./formvis verify-local (1.61.8, the register's M7): the local image models each run once; see setup\verify_local.py.
set "PY=backend\venv\Scripts\python.exe"
if not exist "%PY%" set "PY=python"
"%PY%" setup\verify_local.py %*
exit /b %ERRORLEVEL%
