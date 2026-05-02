@echo off
setlocal
cd /d "%~dp0"

echo Mise a jour depuis GitHub (npm run update)...
call npm run update
if errorlevel 1 (
    echo Echec : voir le message ci-dessus.
    pause
    exit /b 1
)

echo Termine.
pause

endlocal
