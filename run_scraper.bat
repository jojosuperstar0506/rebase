@echo off
REM ============================================================
REM  Rebase Competitor Intelligence Scraper
REM  Double-click to run. Scrapes all 20 brands and pushes
REM  updated data to GitHub (triggers Vercel auto-deploy).
REM
REM  Prerequisites (one-time):
REM    1. python -m services.competitor-intel.setup_profiles
REM    2. Add SCRAPER_PROFILE_DIR to your .env file
REM ============================================================

echo.
echo  Rebase Competitor Intelligence Scraper
echo  %date% %time%
echo ============================================================
echo.

REM Move to the project root (same folder as this .bat file)
cd /d "%~dp0"

REM Activate virtual environment if present
if exist ".venv\Scripts\activate.bat" (
    echo  Activating virtual environment...
    call ".venv\Scripts\activate.bat"
) else if exist "venv\Scripts\activate.bat" (
    echo  Activating virtual environment...
    call "venv\Scripts\activate.bat"
)

REM Check Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo  ERROR: Python not found. Make sure Python is installed and on your PATH.
    pause
    exit /b 1
)

echo  Starting scrape...
echo.

REM Run the full scrape and push to GitHub
python -m services.competitor-intel.orchestrator --full --push

echo.
if errorlevel 1 (
    echo  ============================================================
    echo   Scraper finished with errors. Check the output above.
    echo  ============================================================
) else (
    echo  ============================================================
    echo   Done! Data pushed to GitHub.
    echo   Vercel will auto-deploy the updated dashboard in ~1 min.
    echo  ============================================================
)

echo.
echo  Finished at %date% %time%
echo.
pause
