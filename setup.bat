@echo off
title DBT Wallet Setup & Controller
setlocal enabledelayedexpansion

:: Define colors using ANSI escape sequences
set "ESC="
for /f %%A in ('"prompt $E & for %%B in (1) do rem"') do set "ESC=%%A"

if not "%ESC%"=="" (
    set "COLOR_TITLE=%ESC%[1;36m"
    set "COLOR_MENU=%ESC%[1;33m"
    set "COLOR_SUCCESS=%ESC%[1;32m"
    set "COLOR_WARN=%ESC%[1;35m"
    set "COLOR_ERROR=%ESC%[1;31m"
    set "COLOR_RESET=%ESC%[0m"
) else (
    set "COLOR_TITLE="
    set "COLOR_MENU="
    set "COLOR_SUCCESS="
    set "COLOR_WARN="
    set "COLOR_ERROR="
    set "COLOR_RESET="
)

:MENU
cls
echo %COLOR_TITLE%===========================================================%COLOR_RESET%
echo %COLOR_TITLE%                DBT WALLET CONTROL PANEL                    %COLOR_RESET%
echo %COLOR_TITLE%===========================================================%COLOR_RESET%
echo.
echo Please choose an option:
echo.
echo   %COLOR_MENU%[1]%COLOR_RESET% Run Complete Setup (Install Dependencies + DB Init)
echo   %COLOR_MENU%[2]%COLOR_RESET% Start Full Stack Dev (Backend + Frontend in separate windows)
echo   %COLOR_MENU%[3]%COLOR_RESET% Start Backend Dev Only
echo   %COLOR_MENU%[4]%COLOR_RESET% Start Frontend Dev Only
echo   %COLOR_MENU%[5]%COLOR_RESET% Setup/Reset Database Only
echo   %COLOR_MENU%[6]%COLOR_RESET% Run SQL Tests
echo   %COLOR_MENU%[7]%COLOR_RESET% Exit
echo.
echo %COLOR_TITLE%-----------------------------------------------------------%COLOR_RESET%
set /p choice="Enter choice (1-7): "

if "%choice%"=="1" goto SETUP
if "%choice%"=="2" goto START_ALL
if "%choice%"=="3" goto START_BACKEND
if "%choice%"=="4" goto START_FRONTEND
if "%choice%"=="5" goto DB_SETUP
if "%choice%"=="6" goto RUN_TESTS
if "%choice%"=="7" goto EXIT

echo.
echo %COLOR_ERROR%Invalid choice, please select 1-7.%COLOR_RESET%
timeout /t 2 >nul
goto MENU

:SETUP
echo.
echo %COLOR_TITLE%--- Running Project Setup ---%COLOR_RESET%
:: Check Node.js
call node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo %COLOR_ERROR%Error: Node.js is not installed or not in PATH.%COLOR_RESET%
    echo Please install Node.js (version 20+) before proceeding.
    pause
    goto MENU
)

:: Environment file setup
if not exist .env (
    echo %COLOR_WARN%.env file not found. Copying .env.example to .env...%COLOR_RESET%
    copy .env.example .env
    echo %COLOR_SUCCESS%.env file created. Please open .env and update DATABASE_URL and JWT_SECRET if needed.%COLOR_RESET%
    echo.
) else (
    echo %COLOR_SUCCESS%.env file already exists.%COLOR_RESET%
)

echo %COLOR_MENU%Installing all dependencies (this may take a minute)...%COLOR_RESET%
call npm run install:all
if %errorlevel% neq 0 (
    echo %COLOR_ERROR%Failed to install dependencies.%COLOR_RESET%
    pause
    goto MENU
)

echo.
echo %COLOR_MENU%Setting up the database...%COLOR_RESET%
call npm run db:setup
if %errorlevel% neq 0 (
    echo %COLOR_ERROR%Failed to set up the database.%COLOR_RESET%
    echo Make sure MySQL is running and your .env DATABASE_URL is correct.
    pause
    goto MENU
)

echo.
echo %COLOR_SUCCESS%Setup completed successfully!%COLOR_RESET%
pause
goto MENU

:START_ALL
echo.
echo %COLOR_TITLE%--- Starting Full Stack Development Servers ---%COLOR_RESET%
echo Opening Backend Server in a new window...
start "DBT Wallet - Backend" cmd /k "npm run dev:backend"
echo Opening Frontend Server in a new window...
start "DBT Wallet - Frontend" cmd /k "npm run dev:frontend"
echo.
echo %COLOR_SUCCESS%Both servers launched!%COLOR_RESET%
echo Frontend: http://localhost:5173
echo Backend API: http://localhost:3000
echo.
pause
goto MENU

:START_BACKEND
echo.
echo %COLOR_TITLE%--- Starting Backend Server ---%COLOR_RESET%
start "DBT Wallet - Backend" cmd /k "npm run dev:backend"
echo.
echo %COLOR_SUCCESS%Backend server launched!%COLOR_RESET%
pause
goto MENU

:START_FRONTEND
echo.
echo %COLOR_TITLE%--- Starting Frontend Server ---%COLOR_RESET%
start "DBT Wallet - Frontend" cmd /k "npm run dev:frontend"
echo.
echo %COLOR_SUCCESS%Frontend server launched!%COLOR_RESET%
pause
goto MENU

:DB_SETUP
echo.
echo %COLOR_TITLE%--- Running Database Setup ---%COLOR_RESET%
call npm run db:setup
if %errorlevel% neq 0 (
    echo %COLOR_ERROR%Failed to set up database. Verify MySQL connection settings in .env.%COLOR_RESET%
) else (
    echo %COLOR_SUCCESS%Database configured successfully.%COLOR_RESET%
)
pause
goto MENU

:RUN_TESTS
echo.
echo %COLOR_TITLE%--- Running SQL Tests ---%COLOR_RESET%
call npm run test:sql
pause
goto MENU

:EXIT
echo.
echo Goodbye!
exit /b
