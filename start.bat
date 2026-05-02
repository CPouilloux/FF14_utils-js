@echo off
setlocal
cd /d "%~dp0"

echo Installation des dependances npm...
call npm install
if errorlevel 1 (
    echo Echec : npm install
    exit /b 1
)

echo Demarrage du serveur Node...
call npm start

endlocal
