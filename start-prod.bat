@echo off
cd /d "%~dp0"
set "PATH=C:\Program Files\nodejs;%PATH%"
title yuhitsu 本番モード

echo ==================================================
echo   yuhitsu 本番モード（ビルド → 起動 / 高速・安定）
echo   URL : http://localhost:3000
echo   停止: このウィンドウで Ctrl+C、またはウィンドウを閉じる
echo ==================================================
echo.

if not exist "node_modules\next" call npm install

echo ビルド中です。しばらくお待ちください...
call npm run build
if errorlevel 1 (
  echo.
  echo ビルドに失敗しました。エラー内容を確認してください。
  pause
  exit /b 1
)

start "" /min cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:3000"
call npm start

echo.
echo サーバーが停止しました。ウィンドウを閉じてください。
pause