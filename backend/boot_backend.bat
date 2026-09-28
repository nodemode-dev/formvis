@echo off
setlocal
cd /d "%~dp0"
if not exist venv\Scripts\activate.bat ( echo [formvis] backend venv missing, run formvis.bat install & exit /b 1 )
call venv\Scripts\activate.bat
if not defined FORMVIS_HOST set "FORMVIS_HOST=127.0.0.1"
if not defined FORMVIS_PORT set "FORMVIS_PORT=8190"
uvicorn app.main:app --reload --host %FORMVIS_HOST% --port %FORMVIS_PORT%
