@echo off
setlocal
echo River Paradise - Configurar impresora local
powershell -NoProfile -Command "Get-Printer | Select-Object Name"
set /p RP_LOCAL=Escriba restaurante o cafeteria: 
set /p RP_SERVER=Direccion del servidor (ej. http://192.168.1.50:5173): 
set /p RP_PRINTER=Nombre exacto de la impresora: 
powershell -NoProfile -ExecutionPolicy Bypass -Command "$c=@{location='%RP_LOCAL%';server_url='%RP_SERVER%';printer_name='%RP_PRINTER%'}; $c|ConvertTo-Json|Set-Content -Encoding UTF8 -LiteralPath '%~dp0config.json'"
schtasks /Create /F /SC ONLOGON /TN "River Paradise - Impresora" /TR "powershell.exe -WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File '%~dp0print-agent.ps1' -ConfigPath '%~dp0config.json'"
start "River Paradise - Impresora" powershell -WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File "%~dp0print-agent.ps1" -ConfigPath "%~dp0config.json"
echo Configuracion guardada. El agente iniciara con Windows.
pause
