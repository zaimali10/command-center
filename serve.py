#!/usr/bin/env python3
"""
Command Center local server.
Serves the custom Command Center HTML at / and proxies /api/* to the Hermes dashboard.
Run this on your laptop, access from iPad on the same WiFi at http://<laptop-ip>:8080/
"""

import json
import mimetypes
import os
import subprocess
import sys
import time
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen

HERMES_API = "http://localhost:9119"
PORT = 8080
HERE = Path(__file__).parent


# Extract session token from the Hermes dashboard
_DASHBOARD_TOKEN = None

def _extract_token():
    global _DASHBOARD_TOKEN
    try:
        req = Request(f"{HERMES_API}/", method="GET")
        resp = urlopen(req, timeout=5)
        html = resp.read().decode("utf-8")
        import re
        m = re.search(r'__HERMES_SESSION_TOKEN__="([^"]+)"', html)
        if m:
            _DASHBOARD_TOKEN = m.group(1)
            print(f"[Command Center] Session token extracted")
        else:
            print("[Command Center] WARNING: Could not extract session token")
    except Exception as e:
        print(f"[Command Center] WARNING: Could not fetch token: {e}")


class CommandCenterHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(HERE), **kwargs)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        # Proxy API calls to Hermes dashboard (NOT root — we serve root ourselves)
        if path.startswith("/api/") or path == "/health":
            self.proxy_to_hermes(path, parsed.query)
            return

        # Serve static files from the command center directory (including index.html at /)
        return super().do_GET()

    def proxy_to_hermes(self, path, query):
        """Forward request to the local Hermes dashboard API."""
        target = f"{HERMES_API}{path}"
        if query:
            target += f"?{query}"

        try:
            req = Request(target, method="GET")
            # Inject session token for authenticated endpoints
            if _DASHBOARD_TOKEN:
                req.add_header("X-Hermes-Session-Token", _DASHBOARD_TOKEN)
            # Forward any auth headers from the original request
            auth = self.headers.get("Authorization")
            if auth:
                req.add_header("Authorization", auth)

            resp = urlopen(req, timeout=10)
            data = resp.read()

            # Forward response headers
            self.send_response(resp.status)
            for key, val in resp.headers.items():
                # Skip transfer-encoding since we set content-length
                if key.lower() in ("transfer-encoding",):
                    continue
                self.send_header(key, val)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(data)

        except Exception as e:
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e), "detail": "Could not reach Hermes dashboard at " + HERMES_API}).encode())

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
        self.end_headers()

    def log_message(self, format, *args):
        print(f"[Command Center] {self.client_address[0]} - {format % args}")


def ensure_dashboard_running():
    """Make sure the Hermes dashboard is up and accessible."""
    try:
        resp = urlopen(f"{HERMES_API}/api/status", timeout=3)
        _extract_token()
        return True
    except Exception:
        print("[Command Center] Hermes dashboard not running. Starting it...")
        _kill_process_on_port(9119)
        subprocess.Popen(
            [
                str(Path(sys.executable).parent / "hermes.exe"),
                "dashboard",
                "--host", "0.0.0.0",
                "--port", "9119",
                "--no-open",
                "--skip-build",
                "--insecure",
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
        )
        # Wait for it to come up
        for i in range(15):
            time.sleep(1)
            try:
                urlopen(f"{HERMES_API}/api/status", timeout=2)
                print("[Command Center] Hermes dashboard is up.")
                _extract_token()
                return True
            except Exception:
                continue
        print("[Command Center] WARNING: Could not verify Hermes dashboard started.")
        return False


def start_claude_remote_control():
    """Start Claude remote-control server for phone access."""
    # Check if already running
    if _is_claude_rc_running():
        print("[Command Center] Claude remote-control already running.")
        return True

    print("[Command Center] Starting Claude remote-control...")
    try:
        proc = subprocess.Popen(
            ["cmd.exe", "/c", "echo y | claude remote-control --name \"Command Center\" --spawn same-dir"],
            cwd=str(HERE),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
        )
        # Give it a moment to start
        time.sleep(5)
        if _is_claude_rc_running():
            print("[Command Center] Claude remote-control is up.")
            return True
        else:
            print("[Command Center] Claude remote-control may still be starting (PID: %d)" % proc.pid)
            return True  # Don't block the main server on this
    except Exception as e:
        print(f"[Command Center] WARNING: Could not start Claude remote-control: {e}")
        return False


def _is_claude_rc_running():
    """Check if a claude remote-control server is already running in our project dir."""
    try:
        import subprocess
        result = subprocess.run(
            ["powershell.exe", "-Command",
             "Get-WmiObject Win32_Process -Filter \"Name like '%node%'\" | "
             "Select-Object CommandLine | ConvertTo-Json"],
            capture_output=True, text=True, timeout=5
        )
        output = result.stdout
        # If any node process has 'remote-control' in its command line, it's running
        if 'remote-control' in output and f'{HERE}' in output:
            return True
        return False
    except Exception:
        return False


def _kill_process_on_port(port):
    """Kill any process holding a given TCP port (Windows)."""
    try:
        result = subprocess.run(
            ["powershell.exe", "-Command",
             f"Get-NetTCPConnection -LocalPort {port} -ErrorAction SilentlyContinue | "
             f"Select-Object -ExpandProperty OwningProcess -ErrorAction SilentlyContinue"],
            capture_output=True, text=True, timeout=5
        )
        pids = result.stdout.strip().split('\n')
        seen = set()
        killed = False
        for pid in pids:
            pid = pid.strip()
            if pid and pid.isdigit() and int(pid) > 0 and pid not in seen:
                seen.add(pid)
                subprocess.run(["taskkill", "/F", "/PID", pid],
                               capture_output=True, timeout=5)
                print(f"[Command Center] Killed stale process on port {port} (PID {pid})")
                killed = True
        if not killed:
            print(f"[Command Center] Port {port} is free.")
    except Exception:
        pass


def ensure_firewall_rules():
    """Add Windows Firewall rules if running as admin (idempotent)."""
    try:
        import ctypes
        is_admin = ctypes.windll.shell32.IsUserAnAdmin()
    except Exception:
        is_admin = False

    if not is_admin:
        print("[Command Center] Not running as admin — skipping firewall setup.")
        return False

    print("[Command Center] Admin detected. Ensuring firewall rules...")
    rules = [
        ("Hermes Dashboard 9119", 9119, "Allow Hermes Agent Dashboard from iPad on home WiFi"),
        ("Command Center 8080", 8080, "Allow Command Center from iPad on home WiFi"),
    ]
    for name, port, desc in rules:
        result = subprocess.run(
            ["netsh", "advfirewall", "firewall", "add", "rule",
             f"name={name}", "dir=in", "action=allow",
             "protocol=TCP", f"localport={port}",
             "profile=private", f"description={desc}"],
            capture_output=True, text=True, timeout=10,
        )
        if "OK" in result.stdout or "already exists" in result.stdout.lower():
            print(f"[Command Center]   ✓ {name} (port {port})")
        else:
            # Rule may already exist — netsh returns "ok" for new, but
            # idempotent re-add shows "already exists" depending on version.
            print(f"[Command Center]   {name} (port {port}): {result.stdout.strip() or result.stderr.strip()}")
    return True

def start_telemetry():
    """Start the system telemetry daemon in background if not already running."""
    telemetry_py = HERE / "telemetry.py"
    if not telemetry_py.exists():
        print("[Command Center] telemetry.py not found, skipping.")
        return False
    # Check if already running (by pidfile or simple process scan)
    pidfile = HERE / "data" / "telemetry.pid"
    if pidfile.exists():
        try:
            old_pid = int(pidfile.read_text().strip())
            # Use psutil for cross-platform PID check (os.kill doesn't work on Windows)
            import psutil
            if psutil.pid_exists(old_pid):
                print(f"[Command Center] Telemetry daemon already running (PID {old_pid}).")
                return True
            else:
                pidfile.unlink(missing_ok=True)
        except (OSError, ValueError, ImportError):
            pidfile.unlink(missing_ok=True)

    print("[Command Center] Starting telemetry daemon...")
    try:
        proc = subprocess.Popen(
            [sys.executable, str(telemetry_py)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
        )
        pidfile.parent.mkdir(parents=True, exist_ok=True)
        pidfile.write_text(str(proc.pid))
        print(f"[Command Center] Telemetry daemon started (PID {proc.pid}).")
        return True
    except Exception as e:
        print(f"[Command Center] WARNING: Could not start telemetry: {e}")
        return False

if __name__ == "__main__":
    # Clear stale bytecode cache to prevent version mismatch crashes
    import pathlib
    pycache = HERE / "__pycache__"
    if pycache.exists():
        import shutil
        shutil.rmtree(pycache, ignore_errors=True)

    print(f"🏗️  Command Center Server")
    print(f"   Hermes API:  {HERMES_API}")

    # Kill any stale processes holding our port
    _kill_process_on_port(PORT)

    # Check/start Hermes dashboard
    ensure_dashboard_running()

    # Apply firewall rules if running as admin
    ensure_firewall_rules()

    # Start system telemetry daemon
    start_telemetry()

    # Start Claude remote-control for phone access
    start_claude_remote_control()

    server = HTTPServer(("0.0.0.0", PORT), CommandCenterHandler)
    print(f"\n🌐 Command Center: http://0.0.0.0:{PORT}/")
    print(f"   From iPad:      http://192.168.1.30:{PORT}/")
    print(f"   Claude RC:   https://claude.ai/code")
    print(f"   (Ctrl+C to stop)\n")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.")
    except Exception as e:
        print(f"\n[Command Center] Server error: {e}")
    finally:
        server.server_close()
