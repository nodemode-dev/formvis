@echo off
setlocal
cd /d "%~dp0.."
if not exist frontend\dist\index.html call setup\build_frontend.bat
set "SONNY_DIST=%cd%\frontend\dist"
cd backend
if not exist venv\Scripts\activate.bat ( echo [sonny] backend venv missing, run sonny.bat install & exit /b 1 )
call venv\Scripts\activate.bat
if not defined SONNY_HOST set "SONNY_HOST=127.0.0.1"
if not defined SONNY_PORT set "SONNY_PORT=8190"
echo [sonny] serving http://%SONNY_HOST%:%SONNY_PORT%
uvicorn app.main:app --host %SONNY_HOST% --port %SONNY_PORT%
