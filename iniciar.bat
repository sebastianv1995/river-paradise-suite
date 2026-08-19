@echo off
echo ================================================
echo   River Paradise - Sistema de Mesas
echo ================================================
echo.
echo Abriendo River Paradise...
echo.

start "River Paradise - Servidor" /min powershell.exe -WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File "%~dp0servidor.ps1"
timeout /t 3 /nobreak > nul
start "" http://localhost:8080

echo Listo! El sistema se abrio en tu navegador.
echo.
echo Para abrir desde otra computadora o tablet usa:
echo http://192.168.0.18:8080
echo.
pause
