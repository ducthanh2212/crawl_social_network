@echo off
chcp 65001 >nul
title [Brand Safety AI] - Facebook KOL Crawler & Auditor Dashboard
color 0A

echo =========================================================================
echo      🌟 HE THONG CAO DU LIEU FACEBOOK & DANH GIA BRAND SAFETY KOL
echo =========================================================================
echo.
echo [*] Dang khoi dong Web UI Dashboard tai cong 3000...
echo [*] Vui long cho trong giay lat...
echo.

:: Mo trinh duyet sau 3 giay
start "" cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3000"

:: Khoi chay Web Server Node.js
npm run ui

pause
