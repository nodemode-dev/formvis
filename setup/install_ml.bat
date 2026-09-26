@echo off
setlocal
cd /d "%~dp0..\backend"
if not exist venv\Scripts\activate.bat ( echo [sonny] backend venv missing, run sonny.bat install & exit /b 1 )
call venv\Scripts\activate.bat
pip install -r requirements_ml.txt || exit /b 1
rem Click-to-select: Meta's SAM 2.1 (Apache-2.0) at a pinned commit, built in this environment, no CUDA extension.
pip install -r requirements_sam2.txt || exit /b 1
set SAM2_BUILD_CUDA=0
pip install --no-build-isolation "sam-2 @ git+https://github.com/facebookresearch/sam2.git@2b90b9f5ceec907a1c18123530e92e794ad901a4" || exit /b 1
if not "%SONNY_SKIP_MODEL%"=="1" python -c "from rembg import new_session; new_session('u2net')"
if not "%SONNY_SKIP_MODEL%"=="1" python -c "from app.services.segment import ensure_checkpoint; print(ensure_checkpoint())"
echo [sonny] ML background removal and click-to-select ready
