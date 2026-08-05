@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  start "踉踉跄跄网页服务" /min py -m http.server 4173 --directory src
) else (
  where python >nul 2>nul
  if not %errorlevel%==0 (
    echo 未找到 Python。请双击“打开预览.vbs”，或使用 GitHub Pages 手机版链接。
    pause
    exit /b 1
  )
  start "踉踉跄跄网页服务" /min python -m http.server 4173 --directory src
)
timeout /t 1 /nobreak >nul
start "" http://127.0.0.1:4173/
