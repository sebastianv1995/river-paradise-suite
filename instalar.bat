@echo off
echo ================================================
echo   River Paradise - Instalacion de dependencias
echo ================================================
echo.

echo [1/2] Instalando backend...
cd backend
call npm install
if %errorlevel% neq 0 (
    echo ERROR: Fallo la instalacion del backend.
    pause
    exit /b 1
)
cd ..

echo.
echo [2/2] Instalando frontend...
cd frontend
call npm install
if %errorlevel% neq 0 (
    echo ERROR: Fallo la instalacion del frontend.
    pause
    exit /b 1
)
call npm run build
if %errorlevel% neq 0 (
    echo ERROR: Fallo la compilacion del frontend.
    pause
    exit /b 1
)
cd ..

echo.
echo ================================================
echo   Instalacion completada con exito!
echo   Ahora ejecuta: iniciar.bat
echo ================================================
pause
