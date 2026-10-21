@echo off
chcp 65001 >nul
title [Facebook Login] - Dang nhap va Luu Cookie Session
color 0B

echo =========================================================================
echo      🔑 DANG NHAP TAI KHOAN FACEBOOK VA LUU PHIEN LAM VIEC (COOKIE)
echo =========================================================================
echo.
echo [*] Trinh duyet Chrome se tu dong mo len.
echo [*] Ban hay tien hanh dang nhap vao Facebook tren cua so do.
echo [*] Sau khi dang nhap thanh cong, he thong se tu dong luu phien vao:
echo     data/sessions/storageState.json
echo.

npm run login:manual

echo.
echo =========================================================================
echo [*] Hoan tat! Ban co the tat cua so nay va khoi chay RUN_WEB_UI.bat
echo =========================================================================
pause
