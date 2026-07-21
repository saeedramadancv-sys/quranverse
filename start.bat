@echo off
chcp 65001 >nul
title QuranVerse - Local Server
cd /d "%~dp0"

echo.
echo   ========================================
echo     QuranVerse Transcription - Server
echo   ========================================
echo.
echo   Starting server on http://localhost:8123/
echo.

REM Open the app in the default browser after a short delay.
start "" http://localhost:8123/

REM Start the Node static server (keeps this window open).
node server.js

echo.
echo   Server stopped. Press any key to close.
pause >nul
