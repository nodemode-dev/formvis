@echo off
setlocal
cd /d "%~dp0.."
set "LITE=0"
if /i "%~1"=="--lite" set "LITE=1"
echo [formvis] installing backend
pushd backend
call oc_install.bat || ( popd & exit /b 1 )
popd
if "%LITE%"=="1" ( echo [formvis] skipping the ML extra, Remove Background uses the lightweight engine ) else ( call setup\install_ml.bat || echo [formvis] ML extra did not install, retry with formvis.bat install-ml )
echo [formvis] installing frontend
pushd frontend
call oc_install.bat || ( popd & exit /b 1 )
popd
echo [formvis] done. Boot with formvis.bat
