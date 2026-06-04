@echo off
REM ============================================================
REM  Hermes Auto-Start Setup — Run once (double-click).
REM  Creates a scheduled task that launches the Command Center
REM  at login with admin privileges — no UAC prompts ever again.
REM ============================================================

REM --- Keep the window open on error ---
set "EXIT_ON_ERROR=true"

REM --- Self-elevate ---
net session >nul 2>&1
if %errorlevel% neq 0 (
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo.
echo  ┌─────────────────────────────────────────────┐
echo  │  Hermes Command Center — Admin Setup         │
echo  │  Creating silent boot task...                │
echo  └─────────────────────────────────────────────┘
echo.

set "PROJECT_DIR=C:\Users\Zaim-Work\Projects\command-center"
set "PYTHON=C:\Users\Zaim-Work\AppData\Local\hermes\hermes-agent\venv\Scripts\python.exe"
set "SCRIPT=%PROJECT_DIR%\serve.py"
set "TASK_NAME=HermesCommandCenter"
set "SHORTCUT_DIR=%AppData%\Microsoft\Windows\Start Menu\Programs\Startup"

REM --- Remove old startup shortcut if it exists ---
if exist "%SHORTCUT_DIR%\HermesDashboard.lnk" (
    del "%SHORTCUT_DIR%\HermesDashboard.lnk"
    echo  ✓ Removed old startup shortcut
)
if exist "%SHORTCUT_DIR%\Hermes.lnk" (
    del "%SHORTCUT_DIR%\Hermes.lnk"
    echo  ✓ Removed old Hermes shortcut
)
if exist "%SHORTCUT_DIR%\HermesCommandCenter.lnk" (
    del "%SHORTCUT_DIR%\HermesCommandCenter.lnk"
    echo  ✓ Removed old Command Center shortcut
)

REM --- Create scheduled task ---
schtasks /create /tn "%TASK_NAME%" /tr "\"%PYTHON%\" \"%SCRIPT%\"" /sc onlogon /ru "%USERDOMAIN%\%USERNAME%" /rl HIGHEST /f /delay 0000:30

if %errorlevel% neq 0 (
    echo.
    echo  ✗ ERROR: Could not create scheduled task.
    echo    Try running this file again or check Task Scheduler permissions.
    pause
    exit /b 1
)

echo  ✓ Scheduled task created: "%TASK_NAME%"
echo  ✓ Runs at logon with highest privileges (no UAC)
echo  ✓ 30-second delay on boot to let system settle
echo.

REM --- Apply firewall rules ---
echo  🔧 Applying firewall rules...
netsh advfirewall firewall add rule name="Hermes Dashboard 9119" dir=in action=allow protocol=TCP localport=9119 profile=private description="Allow Hermes Agent Dashboard from iPad on home WiFi" >nul 2>&1
netsh advfirewall firewall add rule name="Command Center 8080" dir=in action=allow protocol=TCP localport=8080 profile=private description="Allow Command Center from iPad on home WiFi" >nul 2>&1
echo  ✓ Firewall rules added

REM --- Start the server now ---
echo.
echo  🚀 Starting Command Center...
start "Command Center" /B /MIN python "%SCRIPT%"

echo.
echo  ┌─────────────────────────────────────────────┐
echo  │  ✅ All set!                                │
echo  │                                             │
echo  │  The Command Center will launch silently    │
echo  │  every time you log in. No more UAC.        │
echo  │                                             │
echo  │  Access from iPad at:                       │
echo  │    http://<YOUR-IP>:8080/                   │
echo  │                                             │
echo  │  (Press any key to close)                   │
echo  └─────────────────────────────────────────────┘
pause >nul
