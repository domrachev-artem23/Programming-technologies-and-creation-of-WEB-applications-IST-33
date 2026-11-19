@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo ==========================================
echo      FOODEXPRESS - ЗАГРУЗКА ФОТОГРАФИЙ
echo ==========================================
echo.

where py >nul 2>nul
if %errorlevel%==0 (
    py -3 download_images.py
    goto finish
)

where python >nul 2>nul
if %errorlevel%==0 (
    python download_images.py
    goto finish
)

echo ОШИБКА: Python не найден на компьютере.
echo Установите Python 3 с сайта https://www.python.org/downloads/windows/
echo При установке отметьте пункт Add Python to PATH.

goto end

:finish
echo.
echo Если выше нет ошибок, фотографии находятся в папке img.
echo Теперь можно открыть index.html.

:end
echo.
pause
