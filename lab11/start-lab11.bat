@echo off
setlocal
title FinBuddy API - lab11
cd /d "%~dp0backend"
set "NPM_CMD=%ProgramFiles%\nodejs\npm.cmd"
if not exist "%NPM_CMD%" set "NPM_CMD=npm.cmd"
if not exist .env (echo ERROR: backend\.env is missing. Copy .env.example to .env and configure PostgreSQL.& pause & exit /b 1)
if not exist node_modules\express\package.json (
  echo Installing backend packages...
  call "%NPM_CMD%" install
  if errorlevel 1 (echo Package installation failed.& pause & exit /b 1)
)
set "PORT=3001"
set "API_RUNNING=0"
curl.exe -s -f http://localhost:3001/api/health >nul 2>&1
if not errorlevel 1 set "API_RUNNING=1"
if "%API_RUNNING%"=="0" (
  set "PORT="
  for %%P in (3001 3002 3003 3004 3005) do (
    netstat -ano | findstr /R /C:":%%P .*LISTENING" >nul
    if errorlevel 1 (set "PORT=%%P" & goto port_selected)
  )
)
:port_selected
if "%PORT%"=="" (echo No free API port from 3001 to 3005.& pause & exit /b 1)
if exist ..\..\lab10\frontend ( >..\..\lab10\frontend\api-port.txt echo %PORT% )
if exist ..\..\Работа 10\frontend ( >..\..\Работа 10\frontend\api-port.txt echo %PORT% )
if "%API_RUNNING%"=="0" (
  echo Preparing database finbuddy...
  call "%NPM_CMD%" run db:init
  if errorlevel 1 (echo Database initialization failed. Check PostgreSQL service and backend\.env.& pause & exit /b 1)
  echo Starting FinBuddy API on port %PORT%...
  start "FinBuddy API" cmd.exe /k "set PORT=%PORT% && node src/server.js"
  timeout /t 3 /nobreak >nul
) else (echo FinBuddy API is already running on port %PORT%.)
set "WEBROOT=%~dp0.."
for %%I in ("%WEBROOT%") do set "WEBROOT=%%~fI"
if exist "%WEBROOT%\lab10\start-lab10.bat" (
  call "%WEBROOT%\lab10\start-lab10.bat"
) else if exist "%WEBROOT%\Работа 10\start-lab10.bat" (
  call "%WEBROOT%\Работа 10\start-lab10.bat"
) else (
  echo Could not find the lab10 folder next to lab11.
  pause
)