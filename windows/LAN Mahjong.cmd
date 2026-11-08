@echo off
rem Starts LAN Mahjong. This window stays open while the game runs; close it to stop the game.
title LAN Mahjong - close this window to stop the game
cd /d "%~dp0"
set "DATA_FILE=%LOCALAPPDATA%\LAN Mahjong\games.json"
set "CLIENT_DIR=%~dp0app\client"
set "OPEN_BROWSER=1"
"%~dp0node\node.exe" "%~dp0app\server.mjs"
if errorlevel 1 pause
