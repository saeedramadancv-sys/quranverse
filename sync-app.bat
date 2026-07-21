@echo off
chcp 65001 >nul
title QuranVerse - Sync to Android
cd /d "%~dp0"

echo.
echo   Syncing www/ into the Android project...
echo.
call npx cap sync android

echo.
echo   Done. Now open Android Studio and rebuild:
echo     npx cap open android
echo.
pause >nul
