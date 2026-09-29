@echo off
setlocal
cd /d "%~dp0.."
set "ROOT=%cd%"
if not exist backend\venv\Scripts\activate.bat ( echo [formvis] backend venv missing, run formvis.bat install & exit /b 1 )
call backend\venv\Scripts\activate.bat
python -c "import PyInstaller" >nul 2>nul || ( echo [formvis] PyInstaller missing, run formvis.bat install-desktop & exit /b 1 )
if defined FORMVIS_TARGET ( set "TRIPLE=%FORMVIS_TARGET%" ) else ( for /f "tokens=2" %%t in ('rustc -vV ^| findstr /b "host:"') do set "TRIPLE=%%t" )
if not defined TRIPLE ( echo [formvis] rustc not found, install Rust or set FORMVIS_TARGET & exit /b 1 )
if not exist frontend\dist\index.html call setup\build_frontend.bat
cd backend
if exist build\pyinstaller rmdir /s /q build\pyinstaller
if exist dist-engine rmdir /s /q dist-engine
pyinstaller --noconfirm --clean --onefile --name formvis-engine --distpath dist-engine --workpath build\pyinstaller --specpath build\pyinstaller --add-data "%ROOT%\frontend\dist;frontend_dist" --collect-submodules app --collect-submodules uvicorn --collect-submodules keyring --hidden-import cv2 --exclude-module pillow_heif "%ROOT%\backend\formvis_engine.py" || exit /b 1
if not exist "%ROOT%\src-tauri\binaries" mkdir "%ROOT%\src-tauri\binaries"
copy /y dist-engine\formvis-engine.exe "%ROOT%\src-tauri\binaries\formvis-engine-%TRIPLE%.exe" >nul
"%ROOT%\src-tauri\binaries\formvis-engine-%TRIPLE%.exe" --selfcheck
