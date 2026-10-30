@echo off
setlocal
cd /d "%~dp0.."
rem The README's code sizes and blend-mode count (plan item 19.4); --check exits 1 when README.md has drifted.
set "PY=backend\venv\Scripts\python.exe"
if not exist "%PY%" set "PY=python"
"%PY%" setup\line_counts.py %*
exit /b %ERRORLEVEL%
