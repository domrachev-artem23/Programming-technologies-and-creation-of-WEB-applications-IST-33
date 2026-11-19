﻿@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"
title HealthHub AI - Launcher

echo ============================================
echo          HealthHub AI - START
echo ============================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is not installed. Install Node.js 20 LTS from https://nodejs.org/
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo ERROR: npm was not found. Reinstall Node.js.
  pause
  exit /b 1
)

if not exist "server\.env" (
  copy "server\.env.example" "server\.env" >nul
  echo Created server\.env from the example.
  echo Opening database settings. Save the file and close Notepad to continue.
  start /wait "" notepad "server\.env"
)

if not exist "server\node_modules" (
  echo Installing API packages...
  pushd server
  call npm install
  if errorlevel 1 (popd & echo API dependency installation failed. & pause & exit /b 1)
  popd
)
if not exist "client\node_modules" (
  echo Installing web packages...
  pushd client
  call npm install
  if errorlevel 1 (popd & echo Web dependency installation failed. & pause & exit /b 1)
  popd
)

echo Starting API server...
start "HealthHub AI API" cmd /k "cd /d ""%~dp0server"" && npm run dev"
timeout /t 3 /nobreak >nul
echo Starting web client...
start "HealthHub AI Web" cmd /k "cd /d ""%~dp0client"" && npm run dev"
echo.
echo ============================================
echo Startup commands sent.
echo Web: http://localhost:5173
echo API health: http://localhost:4000/api/health
echo Keep the API and Web windows open.
echo Close both windows to stop the application.
echo ============================================
echo.
pause
endlocal
