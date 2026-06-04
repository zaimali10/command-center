@echo off
REM ============================================================
REM  Hermes Firewall Setup — Just double-click this file.
REM  Self-elevates to admin automatically (UAC prompt appears).
REM  Opens ports 8080 and 9119 for iPad access on home WiFi.
REM ============================================================

REM --- Self-elevate ---
net session >nul 2>&1
if %errorlevel% neq 0 (
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

REM --- We are now running as admin ---
cd /d "%~dp0"

echo.
echo  🔧 Adding Windows Firewall rules for Hermes...
echo.

netsh advfirewall firewall add rule name="Hermes Dashboard 9119" dir=in action=allow protocol=TCP localport=9119 profile=private description="Allow Hermes Agent Dashboard from iPad on home WiFi"

netsh advfirewall firewall add rule name="Command Center 8080" dir=in action=allow protocol=TCP localport=8080 profile=private description="Allow Command Center from iPad on home WiFi"

echo.
echo  ✅ Done! Both ports are now open on your home/private network.
echo.
echo  Find your laptop IP with:  ipconfig  (look for IPv4 Address)
echo  Then open this on your iPad:
echo    http://<YOUR_IP>:8080/     —  Command Center (recommended)
echo    http://<YOUR_IP>:9119/     —  Native Hermes Dashboard
echo.
echo  (Press any key to close)
pause >nul
