@echo off
chcp 65001 > nul
title Antigravity Trading System Stopper
echo ===================================================
echo [Antigravity] Stopping Trading System Processes...
echo ===================================================

echo.
echo Terminating Python API Server (FastAPI) and Node/Vite Client Web Server...
rem 2^> nul 을 붙여 프로세스가 존재하지 않더라도 에러 출력을 방지합니다.
taskkill /f /im python.exe > nul 2>&1
taskkill /f /im node.exe > nul 2>&1

echo.
echo All processes terminated or verified offline.
timeout /t 2 > nul
exit
