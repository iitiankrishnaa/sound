@echo off
setlocal
set PATH=%LOCALAPPDATA%\Programs\Git\cmd;%PATH%
echo ===================================================
echo   SyncBeat: Pushing to GitHub (sound.git)
echo ===================================================
echo.
git push -u origin main
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Push failed. If GitHub asked for authentication:
    echo 1. Generate a Personal Access Token on GitHub:
    echo    https://github.com/settings/tokens
    echo 2. When prompted:
    echo    Username: iitiankrishnaa
    echo    Password: [Paste your GitHub Token]
) else (
    echo.
    echo [SUCCESS] Successfully pushed SyncBeat to https://github.com/iitiankrishnaa/sound.git!
)
echo.
pause
