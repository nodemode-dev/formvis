@echo off
setlocal
cd /d "%~dp0.."
set "LITE=0"
if /i "%~1"=="--lite" set "LITE=1"
echo [sonny] installing backend
pushd backend
call oc_install.bat || ( popd & exit /b 1 )
popd
if "%LITE%"=="1" ( echo [sonny] skipping the ML extra, Remove Background uses the lightweight engine ) else ( call setup\install_ml.bat || echo [sonny] ML extra did not install, retry with sonny.bat install-ml )
echo [sonny] installing frontend
pushd frontend
call oc_install.bat || ( popd & exit /b 1 )
popd
echo [sonny] done. Boot with sonny.bat
