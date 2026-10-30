@echo off
setlocal
cd /d "%~dp0.."
start "formvis backend" cmd /k "cd /d %cd%\backend && boot_backend.bat"
start "formvis frontend" cmd /k "cd /d %cd%\frontend && boot_frontend.bat"
echo [formvis] frontend http://localhost:5190 and backend http://127.0.0.1:8190
