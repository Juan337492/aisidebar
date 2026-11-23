@echo off
rem AI Sidebar setup for Windows. Double-click this file.
rem It downloads and runs install.ps1 from https://github.com/Juan337492/aisidebar (read it there first if you like).
title AI Sidebar setup
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/Juan337492/aisidebar/main/install.ps1 | iex"
echo.
echo You can close this window now.
pause
