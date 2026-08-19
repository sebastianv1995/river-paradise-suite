@echo off
setlocal
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Haz clic derecho sobre este archivo y elige Ejecutar como administrador.
  pause
  exit /b 1
)
echo River Paradise - Configurar impresora local
powershell -NoProfile -Command "Get-Printer | Select-Object Name"
set /p RP_LOCAL=Escriba restaurante o cafeteria: 
set /p RP_SERVER=Direccion del servidor (ej. http://192.168.0.18:8080):
set /p RP_PRINTER=Nombre exacto de la impresora: 
powershell -NoProfile -ExecutionPolicy Bypass -Command "$c=@{location='%RP_LOCAL%';server_url='%RP_SERVER%';printer_name='%RP_PRINTER%'}; $c|ConvertTo-Json|Set-Content -Encoding UTF8 -LiteralPath '%~dp0config.json'"
schtasks /End /TN "River Paradise - Impresora" >nul 2>&1
taskkill /FI "WINDOWTITLE eq River Paradise - Impresora*" /T /F >nul 2>&1
schtasks /Create /F /SC ONLOGON /DELAY 0000:15 /RL HIGHEST /TN "River Paradise - Impresora" /TR "powershell.exe -WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File \"%~dp0agente-supervisor.ps1\" -ConfigPath \"%~dp0config.json\""
if %errorlevel% neq 0 (
  echo ERROR: Windows no pudo crear el inicio automatico del agente.
  pause
  exit /b 1
)
schtasks /Run /TN "River Paradise - Impresora" >nul 2>&1
echo Configuracion guardada permanentemente.
echo El agente iniciara 15 segundos despues de entrar a Windows, esperara la impresora USB y se reconectara solo.
echo No necesitas volver a configurarlo al apagar o desconectar la impresora.
pause
