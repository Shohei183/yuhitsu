@echo off
cd /d "%~dp0"
set "PATH=C:\Program Files\nodejs;%PATH%"
title yuhitsu 開発サーバー

echo ==================================================
echo   yuhitsu 開発サーバー（編集の即時反映あり）
echo   URL : http://localhost:3000
echo   停止: このウィンドウで Ctrl+C、またはウィンドウを閉じる
echo ==================================================
echo.

if not exist "node_modules\next" call npm install

echo 起動中です... 数秒後にブラウザが自動で開きます。
start "" /min cmd /c "timeout /t 7 /nobreak >nul & start http://localhost:3000"

call npm run dev

echo.
echo サーバーが停止しました。ウィンドウを閉じてください。
pause