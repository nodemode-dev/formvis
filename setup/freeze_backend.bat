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
set ML=--additional-hooks-dir "%ROOT%\setup\pyi_hooks"
if "%FORMVIS_FREEZE_ML%"=="1" set ML=%ML% --collect-all rembg --hidden-import onnxruntime --hidden-import rembg
if "%FORMVIS_HEIF%"=="0" (
  set ML=%ML% --exclude-module pillow_heif
  echo [formvis] FORMVIS_HEIF=0: the engine is frozen without HEIC decoding
) else (
  python "%ROOT%\setup\heif_decode.py" || ( echo [formvis] HEIC decoding could not be built without GPL code, see setup\heif_decode.py, or set FORMVIS_HEIF=0 & exit /b 1 )
  set ML=%ML% --hidden-import pillow_heif
)
if exist build\pyinstaller rmdir /s /q build\pyinstaller
if exist dist-engine rmdir /s /q dist-engine
pyinstaller --noconfirm --clean --onefile --name formvis-engine --distpath dist-engine --workpath build\pyinstaller --specpath build\pyinstaller --add-data "%ROOT%\frontend\dist;frontend_dist" --add-data "%ROOT%\backend\app\profiles;profiles" --add-data "%ROOT%\backend\app\data;data" --add-data "%ROOT%\setup\mcp_stdio.py;setup" --add-data "%ROOT%\setup\agents.py;setup" --collect-submodules app --collect-submodules uvicorn --collect-submodules keyring --hidden-import cv2 --hidden-import OpenEXR %ML% "%ROOT%\backend\formvis_engine.py" || exit /b 1
python "%ROOT%\setup\heif_decode.py" --check dist-engine build\pyinstaller || ( echo [formvis] a GPL codec library, x265 or x264, is in the frozen engine & exit /b 1 )
if not exist "%ROOT%\src-tauri\binaries" mkdir "%ROOT%\src-tauri\binaries"
copy /y dist-engine\formvis-engine.exe "%ROOT%\src-tauri\binaries\formvis-engine-%TRIPLE%.exe" >nul
"%ROOT%\src-tauri\binaries\formvis-engine-%TRIPLE%.exe" --selfcheck
