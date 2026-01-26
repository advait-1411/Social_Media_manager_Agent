@echo off
REM VelvetQueue Startup Script for Windows
setlocal enabledelayedexpansion

echo ========================================
echo Starting VelvetQueue
echo ========================================

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python is not installed or not in PATH
    pause
    exit /b 1
)

REM Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is not installed or not in PATH
    pause
    exit /b 1
)

REM Check if npm is installed
npm --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] npm is not installed or not in PATH
    pause
    exit /b 1
)

REM Kill processes on ports 3000 and 8000
echo Stopping any existing processes...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
timeout /t 1 /nobreak >nul

REM Check if frontend dependencies are installed
if not exist "frontend\node_modules" (
    echo [INFO] Installing frontend dependencies...
    cd frontend
    call npm install
    if errorlevel 1 (
        echo [ERROR] Failed to install frontend dependencies
        pause
        exit /b 1
    )
    cd ..
)

REM Start Backend
echo [INFO] Starting Backend server...
cd backend

REM Check if virtual environment exists
if not exist "venv" (
    if not exist ".venv" (
        echo [INFO] Creating Python virtual environment...
        python -m venv venv
    )
)

REM Activate virtual environment
if exist "venv\Scripts\activate.bat" (
    call venv\Scripts\activate.bat
) else if exist ".venv\Scripts\activate.bat" (
    call .venv\Scripts\activate.bat
)

REM Install backend dependencies if needed
python -c "import fastapi" >nul 2>&1
if errorlevel 1 (
    echo [INFO] Installing backend dependencies...
    pip install -r requirements.txt
    if errorlevel 1 (
        echo [ERROR] Failed to install backend dependencies
        pause
        exit /b 1
    )
)

REM Start backend in background
start "VelvetQueue Backend" /MIN cmd /c "python -m uvicorn app.main:app --reload --port 8000 > ..\backend.log 2>&1"
cd ..

REM Wait for backend to start
timeout /t 3 /nobreak >nul

REM Start Frontend
echo [INFO] Starting Frontend server...
cd frontend
start "VelvetQueue Frontend" /MIN cmd /c "npm run dev > ..\frontend.log 2>&1"
cd ..

REM Wait for frontend to start
timeout /t 3 /nobreak >nul

echo.
echo ========================================
echo [SUCCESS] Services Started!
echo ========================================
echo Frontend: http://localhost:3000
echo Backend:  http://localhost:8000
echo API Docs: http://localhost:8000/docs
echo.
echo Logs are being written to:
echo   - backend.log
echo   - frontend.log
echo.
echo Press any key to view logs, or close this window to stop services...
pause >nul

REM Open log files
start notepad backend.log
start notepad frontend.log

echo.
echo Services are running in background windows.
echo To stop them, close the "VelvetQueue Backend" and "VelvetQueue Frontend" windows,
echo or use Task Manager to end the processes.
echo.
pause
