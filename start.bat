@echo off
title Wallet Project Control Panel
cls

:menu
echo ===================================================
echo             Wallet Project Control Panel
echo ===================================================
echo.
echo  1. Run locally (without Docker)
echo  2. Run via Docker Compose (db + app + monitoring)
echo  3. Run backend unit/integration tests
echo  4. Stop Docker Compose containers
echo  5. Exit
echo.
echo ===================================================
set /p choice="Enter choice (1-5): "

if "%choice%"=="1" goto run_local
if "%choice%"=="2" goto run_docker
if "%choice%"=="3" goto run_tests
if "%choice%"=="4" goto stop_docker
if "%choice%"=="5" goto exit
echo Invalid choice. Please try again.
pause
cls
goto menu

:run_local
echo.
if not exist .env (
    echo .env file not found. Copying .env.example to .env...
    copy .env.example .env
    echo Please configure your .env file with your local MySQL credentials before continuing.
    pause
)
echo.
echo [1/3] Installing dependencies...
call npm run install:all
if %errorlevel% neq 0 (
    echo Error installing dependencies.
    pause
    cls
    goto menu
)
echo.
echo [2/3] Setting up local database (make sure MySQL is running locally)...
call npm run db:setup
if %errorlevel% neq 0 (
    echo Error setting up database. Make sure local MySQL is running and .env is configured.
    pause
    cls
    goto menu
)
echo.
echo [3/3] Starting backend and frontend in separate processes...
start cmd /k "echo Starting Backend... && npm run dev:backend"
start cmd /k "echo Starting Frontend... && npm run dev:frontend"
echo Backend and Frontend are starting in separate windows.
pause
cls
goto menu

:run_docker
echo.
echo Starting application via Docker Compose...
docker compose up --build
pause
cls
goto menu

:run_tests
echo.
echo Running backend test suite...
call npm run test
pause
cls
goto menu

:stop_docker
echo.
echo Stopping Docker containers and removing volumes...
docker compose down -v
pause
cls
goto menu

:exit
echo.
echo Goodbye!
exit
