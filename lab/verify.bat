@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
echo HealthHub AI diagnostics
echo ========================
where node >nul 2>nul && (echo [OK] Node.js found) || (echo [FAIL] Node.js missing)
where npm >nul 2>nul && (echo [OK] npm found) || (echo [FAIL] npm missing)
if exist "server\.env" (echo [OK] server\.env exists) else (echo [FAIL] server\.env missing)
echo.
echo Checking API database connection...
curl -sS --max-time 5 http://localhost:4000/api/health
if errorlevel 1 echo [FAIL] API is not responding or database is unavailable.
echo.
echo Checking web server...
curl -sS -I --max-time 5 http://localhost:5173
if errorlevel 1 echo [FAIL] Web client is not responding.
echo.
pause
endlocal
