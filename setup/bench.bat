@echo off
setlocal
cd /d "%~dp0.."
rem ./formvis bench (1.61.5, the register's H4): drawing paths timed on this computer's graphics; see setup\bench.py.
set "PY=backend\venv\Scripts\python.exe"
if not exist "%PY%" set "PY=python"
"%PY%" setup\bench.py %*
exit /b %ERRORLEVEL%
