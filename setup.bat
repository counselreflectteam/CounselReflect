@echo off
REM Setup script for LLM Model Therapist Tool (Windows)
REM This script sets up virtual environments for each module

echo 🚀 Setting up LLM Model Therapist Tool...

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python is not installed. Please install Python 3.8 or higher.
    pause
    exit /b 1
)

echo [SUCCESS] Python detected


REM Setup api module (if exists)
if exist "api" (
    echo [INFO] Setting up api module...
    cd api

    if not exist ".venv" (
        python -m venv .venv
        echo [SUCCESS] Created api virtual environment
    ) else (
        echo [WARNING] API virtual environment already exists
    )

    call .venv\Scripts\activate.bat
    python -m pip install --upgrade pip
    pip install -e ".[dev]"
    if errorlevel 0 (
        echo [SUCCESS] API module ready
    ) else (
        echo [ERROR] Failed to install API dependencies
    )
    cd ..
)

REM Setup cli module (if exists)
if exist "cli" (
    echo [INFO] Setting up CLI module...
    cd cli

    if not exist ".venv" (
        python -m venv .venv
        echo [SUCCESS] Created CLI virtual environment
    ) else (
        echo [WARNING] CLI virtual environment already exists
    )

    call .venv\Scripts\activate.bat
    python -m pip install --upgrade pip
    
    if exist "requirements.txt" (
        pip install -r requirements.txt
        echo [SUCCESS] CLI dependencies installed
    )
    
    echo [SUCCESS] CLI module ready
    cd ..
)

REM Setup Node.js workspace (frontend, extension, shared)
echo [INFO] Setting up Node.js workspace (frontend, extension, shared)...

where npm >nul 2>nul
if errorlevel 1 (
    echo [ERROR] npm is not installed. Please install Node.js.
    echo [WARNING] Skipping Node.js workspace setup...
) else (
    if exist "package.json" (
        echo [INFO] Installing workspace dependencies...
        npm install
        if errorlevel 0 (
            echo [SUCCESS] Workspace dependencies installed
        ) else (
            echo [ERROR] Failed to install workspace dependencies
        )
    ) else (
        echo [WARNING] No root package.json found
    )
)

echo [SUCCESS] 🎉 Setup complete!
echo.
echo Module-specific virtual environments have been created.
echo.
echo To activate environments:
echo   API: cd api ^&^& .venv\Scripts\activate.bat
echo   CLI: cd cli ^&^& .venv\Scripts\activate.bat
echo.
echo To run the API server:
echo   cd api ^&^& .venv\Scripts\activate.bat ^&^& uvicorn main:app --reload
echo.
echo To run the CLI tool:
echo   cd cli ^&^& .venv\Scripts\activate.bat ^&^& python cli_tool.py --help
echo.
echo To run the frontend ^& extension (from root directory):
echo   npm run dev
echo.
echo To load the Chrome extension:
echo   1. Open Chrome and go to chrome://extensions/
echo   2. Enable 'Developer mode'
echo   3. Click 'Load unpacked'
echo   4. Select the 'extension\dist' directory (build first: cd extension ^&^& npm run build)
pause
