@echo off
echo ================================================
echo   River Paradise - Sistema de Mesas
echo ================================================
echo.
echo Abriendo backend y frontend...
echo.

start "River Paradise - Backend" cmd /k "cd /d %~dp0backend && npm start"

timeout /t 2 /nobreak > nul

start "River Paradise - Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

timeout /t 3 /nobreak > nul

start "" http://localhost:5173

echo Listo! El sistema se abrio en tu navegador.
echo.
echo Para abrir desde otra computadora o tablet usa la direccion Network
echo que aparece en la ventana "River Paradise - Frontend".
echo Ejemplo: http://192.168.1.50:5173
echo Para cerrar: cierra las dos ventanas negras.
echo.
pause
