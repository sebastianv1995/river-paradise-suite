@echo off
setlocal
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Haz clic derecho sobre este archivo y elige Ejecutar como administrador.
  pause
  exit /b 1
)

cd /d "%~dp0"
where git >nul 2>&1
if %errorlevel% neq 0 (
  echo ERROR: Git no esta instalado o no esta disponible en PATH.
  pause
  exit /b 1
)
where node >nul 2>&1
if %errorlevel% neq 0 (
  echo ERROR: Node.js no esta instalado o no esta disponible en PATH.
  pause
  exit /b 1
)

echo Creando respaldo antes de actualizar...
powershell.exe -WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File "%~dp0respaldar.ps1"
if %errorlevel% neq 0 (
  echo ERROR: No se pudo crear el respaldo. La actualizacion fue cancelada.
  pause
  exit /b 1
)

echo Deteniendo temporalmente el servidor...
schtasks /End /TN "River Paradise - Servidor" >nul 2>&1

echo Descargando la version de Git...
git pull --ff-only origin main
if %errorlevel% neq 0 goto :error

echo Instalando dependencias exactas del backend...
pushd backend
call npm ci
if %errorlevel% neq 0 (popd & goto :error)
popd

echo Compilando la interfaz...
pushd frontend
call npm ci
if %errorlevel% neq 0 (popd & goto :error)
call npm run build
if %errorlevel% neq 0 (popd & goto :error)
popd

schtasks /Run /TN "River Paradise - Servidor" >nul 2>&1
echo.
echo Actualizacion completada. La base, la carta, los respaldos y las configuraciones se conservaron.
echo Sistema: http://localhost:8080
pause
exit /b 0

:error
echo.
echo ERROR: La actualizacion no pudo completarse. Revisa el mensaje anterior.
echo Se intentara volver a iniciar el servidor con los archivos disponibles.
schtasks /Run /TN "River Paradise - Servidor" >nul 2>&1
pause
exit /b 1
