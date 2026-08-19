@echo off
setlocal
set "DESTINO=C:\RiverParadise"
set "RESPALDO=C:\RiverParadise-Respaldo-Actualizacion"

if not exist "%DESTINO%\backend\river_paradise.sqlite" (
  echo ERROR: No se encontro la base real en %DESTINO%\backend\river_paradise.sqlite
  echo No se realizo ningun cambio.
  pause
  exit /b 1
)

echo Cerrando procesos de River Paradise...
schtasks /End /TN "River Paradise - Servidor" >nul 2>&1
taskkill /FI "WINDOWTITLE eq River Paradise - Backend*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq River Paradise - Frontend*" /T /F >nul 2>&1
timeout /t 2 /nobreak >nul

if not exist "%RESPALDO%" mkdir "%RESPALDO%"
copy /Y "%DESTINO%\backend\river_paradise.sqlite" "%RESPALDO%\river_paradise.sqlite" >nul
if exist "%DESTINO%\backend\river_paradise.sqlite-wal" copy /Y "%DESTINO%\backend\river_paradise.sqlite-wal" "%RESPALDO%\river_paradise.sqlite-wal" >nul
if exist "%DESTINO%\backend\river_paradise.sqlite-shm" copy /Y "%DESTINO%\backend\river_paradise.sqlite-shm" "%RESPALDO%\river_paradise.sqlite-shm" >nul
if exist "%DESTINO%\menu.json" copy /Y "%DESTINO%\menu.json" "%RESPALDO%\menu.json" >nul
if exist "%DESTINO%\impresion\config.json" copy /Y "%DESTINO%\impresion\config.json" "%RESPALDO%\config.json" >nul

echo Copiando la version actualizada...
robocopy "%~dp0" "%DESTINO%" /E /XD node_modules dist .git respaldos /XF river_paradise.sqlite river_paradise.sqlite-wal river_paradise.sqlite-shm river_paradise.json river_paradise.json.tmp config.json /R:1 /W:1
if errorlevel 8 (
  echo ERROR: La copia no pudo completarse. Los respaldos estan en %RESPALDO%.
  pause
  exit /b 1
)

copy /Y "%RESPALDO%\river_paradise.sqlite" "%DESTINO%\backend\river_paradise.sqlite" >nul
if exist "%RESPALDO%\river_paradise.sqlite-wal" copy /Y "%RESPALDO%\river_paradise.sqlite-wal" "%DESTINO%\backend\river_paradise.sqlite-wal" >nul
if exist "%RESPALDO%\river_paradise.sqlite-shm" copy /Y "%RESPALDO%\river_paradise.sqlite-shm" "%DESTINO%\backend\river_paradise.sqlite-shm" >nul
if exist "%RESPALDO%\menu.json" copy /Y "%RESPALDO%\menu.json" "%DESTINO%\menu.json" >nul
if exist "%RESPALDO%\config.json" copy /Y "%RESPALDO%\config.json" "%DESTINO%\impresion\config.json" >nul

cd /d "%DESTINO%"
call instalar.bat
echo.
echo Actualizacion terminada. Base, Carta e impresora conservadas.
schtasks /Run /TN "River Paradise - Servidor" >nul 2>&1
echo El servidor actualizado se inicio automaticamente en el puerto 8080.
pause
