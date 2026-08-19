@echo off
setlocal
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Haz clic derecho sobre este archivo y elige Ejecutar como administrador.
  pause
  exit /b 1
)

cd /d "%~dp0\.."
where git >nul 2>&1
if %errorlevel% neq 0 (
  echo ERROR: Git no esta instalado o no esta disponible en PATH.
  pause
  exit /b 1
)

schtasks /End /TN "River Paradise - Impresora" >nul 2>&1
git pull --ff-only origin main
if %errorlevel% neq 0 (
  echo ERROR: No se pudo descargar la actualizacion.
  schtasks /Run /TN "River Paradise - Impresora" >nul 2>&1
  pause
  exit /b 1
)
schtasks /Run /TN "River Paradise - Impresora" >nul 2>&1
echo Agente actualizado. Se conservo impresion\config.json y el agente se reinicio oculto.
pause
