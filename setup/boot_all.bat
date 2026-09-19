@echo off
setlocal
cd /d "%~dp0.."
start "sonny backend" cmd /k "cd /d %cd%\backend && boot_backend.bat"
start "sonny frontend" cmd /k "cd /d %cd%\frontend && boot_frontend.bat"
echo [sonny] frontend http://localhost:5190 and backend http://127.0.0.1:8190
