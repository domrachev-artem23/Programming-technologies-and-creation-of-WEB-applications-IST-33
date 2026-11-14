@echo off
cd /d "%~dp0"
set "PYTHON_CMD="
where py >nul 2>nul
if not errorlevel 1 set "PYTHON_CMD=py -3"
if not defined PYTHON_CMD (
  where python >nul 2>nul
  if not errorlevel 1 set "PYTHON_CMD=python"
)
if not defined PYTHON_CMD if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" set PYTHON_CMD="%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
if not defined PYTHON_CMD (echo Python 3.10+ not found. Install Python and retry.& start "" https://www.python.org/downloads/& pause& exit /b 1)
if not exist .env copy .env.example .env >nul
findstr /c:"DB_PASSWORD=CHANGE_ME" .env >nul
if not errorlevel 1 (echo Set PostgreSQL password in .env, save, then double-click again.& start notepad .env& pause& exit /b 1)
set "VENV_DIR=%LOCALAPPDATA%\FinBuddyLab12\venv"
if not exist "%VENV_DIR%\Scripts\python.exe" (
  %PYTHON_CMD% -m venv "%VENV_DIR%"
  if errorlevel 1 (echo Python environment creation failed.& pause& exit /b 1)
)
"%VENV_DIR%\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 (pause& exit /b 1)
"%VENV_DIR%\Scripts\python.exe" setup_db.py
if errorlevel 1 (pause& exit /b 1)
if not defined OPEN_BROWSER set "OPEN_BROWSER=0"
start "" /b "%VENV_DIR%\Scripts\python.exe" app.py
timeout /t 2 /nobreak >nul
if not defined SKIP_BROWSER start "" http://127.0.0.1:5000/
echo FinBuddy backend is running. Close this window or press Ctrl+C to stop it.
pause
