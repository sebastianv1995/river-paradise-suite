@echo off
setlocal
set "DESTINO=C:\RiverParadise"
set "RESPALDO=C:\RiverParadise-Respaldo-Actualizacion"

if not exist "%DESTINO%\backend\river_paradise.json" (
  echo ERROR: No se encontro la base real en %DESTINO%\backend\river_paradise.json
  echo No se realizo ningun cambio.
  pause
  exit /b 1
)

echo Cerrando procesos de River Paradise...
taskkill /FI "WINDOWTITLE eq River Paradise - Backend*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq River Paradise - Frontend*" /T /F >nul 2>&1

if not exist "%RESPALDO%" mkdir "%RESPALDO%"
copy /Y "%DESTINO%\backend\river_paradise.json" "%RESPALDO%\river_paradise.json" >nul
if exist "%DESTINO%\menu.json" copy /Y "%DESTINO%\menu.json" "%RESPALDO%\menu.json" >nul
if exist "%DESTINO%\impresion\config.json" copy /Y "%DESTINO%\impresion\config.json" "%RESPALDO%\config.json" >nul

echo Copiando la version actualizada...
robocopy "%~dp0" "%DESTINO%" /E /XD node_modules dist .git respaldos /XF river_paradise.json river_paradise.json.tmp config.json /R:1 /W:1
if errorlevel 8 (
  echo ERROR: La copia no pudo completarse. Los respaldos estan en %RESPALDO%.
  pause
  exit /b 1
)

copy /Y "%RESPALDO%\river_paradise.json" "%DESTINO%\backend\river_paradise.json" >nul
if exist "%RESPALDO%\menu.json" copy /Y "%RESPALDO%\menu.json" "%DESTINO%\menu.json" >nul
if exist "%RESPALDO%\config.json" copy /Y "%RESPALDO%\config.json" "%DESTINO%\impresion\config.json" >nul

cd /d "%DESTINO%"
call instalar.bat
echo.
echo Actualizacion terminada. Base, Carta e impresora conservadas.
echo Ahora ejecuta iniciar.bat y reinicia el agente de impresion.
pause
