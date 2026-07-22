@echo off
chcp 65001 > nul
title Antigravity Trading System Runner

echo ========================================================
echo [Antigravity] 자동매매 시스템을 백그라운드에서 구동합니다...
echo ========================================================

rem 1. 백엔드(FastAPI)를 백그라운드(무창)에서 구동하고 로그는 backend.log에 기록합니다.
powershell -WindowStyle Hidden -Command "Start-Process cmd -ArgumentList '/c cd /d %~dp0backend && python main.py > ..\backend.log 2>&1' -WindowStyle Hidden"

rem 2. 프론트엔드(Vite React)를 백그라운드(무창)에서 구동하고 로그는 frontend.log에 기록합니다.
powershell -WindowStyle Hidden -Command "Start-Process cmd -ArgumentList '/c cd /d %~dp0frontend && npm run dev > ..\frontend.log 2>&1' -WindowStyle Hidden"

echo.
echo 시스템이 완전히 구동될 때까지 5초간 대기합니다...
timeout /t 5 > nul

rem 3. 브라우저로 대시보드 자동 연결
start http://localhost:5173

echo.
echo 자동매매 시스템 구동이 완료되었습니다!
echo 실행 중인 로그는 프로젝트 폴더 아래의 [backend.log] 및 [frontend.log] 파일에서 확인하실 수 있습니다.
echo.
timeout /t 3 > nul
exit
