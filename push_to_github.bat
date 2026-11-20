@echo off
title Push Project to GitHub
echo ============================================================
echo   Pushing to https://github.com/raviprabhakar913-creator
echo ============================================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0push_to_github.ps1"
echo.
pause
