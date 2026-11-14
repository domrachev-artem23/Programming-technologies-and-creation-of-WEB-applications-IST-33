@echo off
cd /d "%~dp0"
if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
if exist "%ProgramFiles%\nodejs\npm.cmd" set "PATH=%ProgramFiles%\nodejs;%PATH%"
if not exist .env copy .env.example .env >nul
findstr /c:"DB_PASSWORD=CHANGE_ME" .env >nul
if not errorlevel 1 (echo Set your PostgreSQL password in .env, then double-click this file again. & start notepad .env & pause & exit /b 1)
if not exist node_modules\express\package.json (
 call npm install
 if errorlevel 1 (
  pause
  exit /b 1
 )
)
call npm run setup
if errorlevel 1 (
 pause
 exit /b 1
)
if not defined OPEN_BROWSER set "OPEN_BROWSER=1"
node server.js
pause
