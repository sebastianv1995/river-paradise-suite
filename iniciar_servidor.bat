@echo off
cd /d "%~dp0backend"
start "River Paradise - Backend" /min cmd /c npm start
timeout /t 3 /nobreak >nul
cd /d "%~dp0frontend"
start "River Paradise - Frontend" /min cmd /c npm run dev
