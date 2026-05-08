@echo off
setlocal

cd /d "%~dp0"

echo ============================================================
echo ASG Leads Web App Deployment
echo ============================================================
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy.ps1"
set DEPLOY_EXIT_CODE=%ERRORLEVEL%

echo.
if "%DEPLOY_EXIT_CODE%"=="0" (
    echo ============================================================
    echo DEPLOYMENT WORKFLOW COMPLETED SUCCESSFULLY
    echo ============================================================
) else (
    echo ============================================================
    echo DEPLOYMENT WORKFLOW FAILED
    echo Review the log file printed above before retrying.
    echo ============================================================
)
echo.
pause
exit /b %DEPLOY_EXIT_CODE%
