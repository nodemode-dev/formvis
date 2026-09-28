@echo off
setlocal
cd /d "%~dp0.."
if not exist frontend\dist\index.html call setup\build_frontend.bat
set "FORMVIS_DIST=%cd%\frontend\dist"
cd backend
if not exist venv\Scripts\activate.bat ( echo [formvis] backend venv missing, run formvis.bat install & exit /b 1 )
call venv\Scripts\activate.bat
if not defined FORMVIS_HOST set "FORMVIS_HOST=127.0.0.1"
if not defined FORMVIS_PORT set "FORMVIS_PORT=8190"
echo [formvis] serving http://%FORMVIS_HOST%:%FORMVIS_PORT%
uvicorn app.main:app --host %FORMVIS_HOST% --port %FORMVIS_PORT%
