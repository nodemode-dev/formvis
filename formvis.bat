@echo off
setlocal
set "CMD=%~1"
set REST=%*
if defined REST call set REST=%%REST:*%1=%%
set "PY=%~dp0backend\venv\Scripts\python.exe"
if not exist "%PY%" set "PY=python"
for %%c in (mcp cli agents headless perf corpus) do if /i "%CMD%"=="%%c" goto :py
cd /d "%~dp0"
set "ARG=%~2"
if "%CMD%"=="" set "CMD=boot"
if /i "%CMD%"=="boot" ( call setup\boot_all.bat & goto :eof )
if /i "%CMD%"=="dev" ( call setup\boot_all.bat & goto :eof )
if /i "%CMD%"=="install" ( call setup\install_all.bat %REST% & goto :eof )
if /i "%CMD%"=="install-ml" ( call setup\install_ml.bat & goto :eof )
if /i "%CMD%"=="install-desktop" ( call setup\install_desktop.bat & goto :eof )
if /i "%CMD%"=="backend" ( call setup\boot_backend.bat & goto :eof )
if /i "%CMD%"=="frontend" ( call setup\boot_frontend.bat & goto :eof )
if /i "%CMD%"=="build" ( call setup\build_frontend.bat & goto :eof )
if /i "%CMD%"=="serve" ( call setup\serve.bat & goto :eof )
if /i "%CMD%"=="freeze" ( call setup\freeze_backend.bat & goto :eof )
if /i "%CMD%"=="desktop" (
  if /i "%ARG%"=="build" ( call setup\desktop_build.bat ) else ( call setup\desktop_dev.bat )
  goto :eof
)
if /i "%CMD%"=="doctor" ( call setup\doctor.bat & goto :eof )
if /i "%CMD%"=="test" ( call setup\test.bat & goto :eof )
if /i "%CMD%"=="counts" ( call setup\counts.bat %REST% & goto :eof )
if /i "%CMD%"=="bench" ( call setup\bench.bat %REST% & goto :eof )
if /i "%CMD%"=="verify-local" ( call setup\verify_local.bat %REST% & goto :eof )
if /i "%CMD%"=="clean" ( call setup\clean.bat %REST% & goto :eof )
if /i "%CMD%"=="version" ( "%PY%" setup\mcp_stdio.py --version & goto :eof )
if /i "%CMD%"=="help" ( call :usage & exit /b 0 )
echo [formvis] unknown command: %CMD%
call :usage
exit /b 2
:py
set "SCRIPT=%CMD%"
if /i "%CMD%"=="mcp" set "SCRIPT=mcp_stdio"
"%PY%" "%~dp0setup\%SCRIPT%.py" %REST%
exit /b %ERRORLEVEL%
:usage
echo formvis.bat [command]
echo   boot ^| install [--lite] ^| install-ml ^| install-desktop ^| backend ^| frontend
echo   build ^| serve ^| freeze ^| desktop dev ^| desktop build ^| doctor ^| test ^| clean [--all] ^| help
echo   counts ^| bench ^| verify-local ^| mcp ^| cli ^| agents ^| headless ^| perf ^| corpus ^| version
exit /b 0
