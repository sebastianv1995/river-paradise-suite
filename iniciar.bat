@echo off
setlocal
echo ================================================
echo   River Paradise - Sistema de Mesas
echo ================================================
echo.
echo Abriendo River Paradise...
echo.

netstat -ano | findstr ":8080" | findstr "LISTEN" >nul
if not errorlevel 1 goto :abrir

schtasks /Run /TN "River Paradise - Servidor" >nul 2>&1
timeout /t 6 /nobreak >nul
netstat -ano | findstr ":8080" | findstr "LISTEN" >nul
if not errorlevel 1 goto :abrir

start "River Paradise - Servidor" /min powershell.exe -WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File "%~dp0servidor.ps1"
timeout /t 6 /nobreak >nul

:abrir
start "" http://localhost:8080

netstat -ano | findstr ":8080" | findstr "LISTEN" >nul
if errorlevel 1 (
  echo AVISO: el servidor todavia no responde. Revisa C:\RiverParadise\logs\servidor.log
) else (
  echo Listo! El sistema se abrio en tu navegador.
)
echo.
echo Para abrir desde otra computadora o tablet usa:
echo http://IP-DE-ESTA-COMPUTADORA:8080
echo.
pause
