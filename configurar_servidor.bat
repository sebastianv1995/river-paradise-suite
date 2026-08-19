@echo off
setlocal
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Ejecuta este archivo como administrador.
  pause
  exit /b 1
)
if not exist "C:\RiverParadise\servidor.ps1" (
  echo No se encontro C:\RiverParadise\servidor.ps1
  echo Ejecuta primero instalar.bat desde la version nueva.
  pause
  exit /b 1
)
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
netsh advfirewall firewall delete rule name="River Paradise - Red local" >nul 2>&1
netsh advfirewall firewall add rule name="River Paradise - Red local" dir=in action=allow protocol=TCP localport=8080 profile=private
schtasks /End /TN "River Paradise - Servidor" >nul 2>&1
schtasks /Delete /F /TN "River Paradise - Servidor" >nul 2>&1
schtasks /Delete /F /TN "River Paradise - Respaldo" >nul 2>&1
schtasks /Create /F /SC ONSTART /RU SYSTEM /RL HIGHEST /TN "River Paradise - Servidor" /TR "powershell.exe -WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File C:\RiverParadise\servidor.ps1"
if errorlevel 1 goto :error
schtasks /Create /F /SC DAILY /ST 23:30 /RU SYSTEM /RL HIGHEST /TN "River Paradise - Respaldo" /TR "powershell.exe -WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File C:\RiverParadise\respaldar.ps1"
if errorlevel 1 goto :error
schtasks /Run /TN "River Paradise - Servidor"
timeout /t 6 /nobreak >nul
echo.
echo Servidor configurado en el puerto 8080: inicio automatico, reinicio si falla, sin suspension y respaldo diario.
echo IMPORTANTE: reserva la IP de esta computadora en el router.
ipconfig | findstr /i "IPv4"
pause
exit /b 0

:error
echo.
echo ERROR: Windows no pudo crear las tareas automaticas.
echo Vuelve a ejecutar este archivo como administrador.
pause
exit /b 1
