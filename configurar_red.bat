@echo off
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Este archivo debe ejecutarse como administrador.
  echo Clic derecho sobre configurar_red.bat y selecciona Ejecutar como administrador.
  pause
  exit /b 1
)

echo Configurando acceso de River Paradise en la red privada...
powershell -NoProfile -Command "Get-NetConnectionProfile | Where-Object {$_.IPv4Connectivity -ne 'Disconnected'} | Set-NetConnectionProfile -NetworkCategory Private"
if %errorlevel% neq 0 (
  echo ERROR: No se pudo marcar la red como Privada.
  pause
  exit /b 1
)
netsh advfirewall firewall delete rule name="River Paradise - Red local" >nul 2>&1
netsh advfirewall firewall add rule name="River Paradise - Red local" dir=in action=allow protocol=TCP localport=5173 profile=private

if %errorlevel% neq 0 (
  echo ERROR: No se pudo configurar el Firewall de Windows.
  pause
  exit /b 1
)

echo.
echo Configuracion completada.
echo Solo se habilito el acceso web en redes marcadas como Privadas.
echo Al iniciar el sistema, usa la direccion Network mostrada por Vite.
pause
