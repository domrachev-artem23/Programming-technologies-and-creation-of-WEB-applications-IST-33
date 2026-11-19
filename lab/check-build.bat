@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
echo HealthHub AI - source checks
echo ==========================
node --check server\src\index.js
if errorlevel 1 (echo [FAIL] API JavaScript syntax & pause & exit /b 1)
echo [OK] API JavaScript syntax
pushd client
if not exist node_modules (echo Dependencies missing. Run start.bat first. & popd & pause & exit /b 1)
call npm run build
if errorlevel 1 (echo [FAIL] Web build & popd & pause & exit /b 1)
popd
echo [OK] Web production build
pause
endlocal
