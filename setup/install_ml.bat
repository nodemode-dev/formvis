@echo off
setlocal
cd /d "%~dp0..\backend"
if not exist venv\Scripts\activate.bat ( echo [sonny] backend venv missing, run sonny.bat install & exit /b 1 )
call venv\Scripts\activate.bat
pip install -r requirements_ml.txt || exit /b 1
if not "%SONNY_SKIP_MODEL%"=="1" python -c "from rembg import new_session; new_session(u2net)"
echo [sonny] ML background removal ready
