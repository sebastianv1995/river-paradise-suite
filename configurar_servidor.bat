@echo off
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Ejecuta este archivo como administrador.
  pause
  exit /b 1
)
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
netsh advfirewall firewall delete rule name="River Paradise - Red local" >nul 2>&1
netsh advfirewall firewall add rule name="River Paradise - Red local" dir=in action=allow protocol=TCP localport=5173 profile=private
schtasks /Create /F /SC ONLOGON /TN "River Paradise - Servidor" /TR "cmd.exe /c '%~dp0iniciar_servidor.bat'"
schtasks /Create /F /SC DAILY /ST 23:30 /TN "River Paradise - Respaldo" /TR "powershell.exe -WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File '%~dp0respaldar.ps1'"
echo.
echo Servidor configurado: inicio automatico, sin suspension y respaldo diario.
echo IMPORTANTE: reserva la IP de esta computadora en el router.
ipconfig | findstr /i "IPv4"
pause
