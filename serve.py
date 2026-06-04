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


def ensure_react_build():
    """Build the React app if dist/ doesn't exist or is stale."""
    dist_dir = HERE / "dist"
    needs_build = not dist_dir.is_dir()

    if not needs_build:
        # Check if any src/ files are newer than dist/
        dist_index = dist_dir / "index.html"
        if dist_index.exists():
            dist_mtime = dist_index.stat().st_mtime
            for src_file in (HERE / "src").rglob("*"):
                if src_file.is_file() and src_file.stat().st_mtime > dist_mtime:
                    needs_build = True
                    break

    if needs_build:
        print("[Command Center] Building React app...")
        npx_paths = [
            str(Path(os.environ.get("ProgramFiles", "C:\\Program Files")) / "nodejs" / "npx.cmd"),
            str(Path(os.environ.get("ProgramFiles(x86)", "C:\\Program Files (x86)")) / "nodejs" / "npx.cmd"),
        ]
        npx = None
        for p in npx_paths:
            if os.path.exists(p):
                npx = p
                break
        if npx is None:
            # Try PATH
            import shutil
            npx = shutil.which("npx.cmd") or shutil.which("npx")

        if npx:
            result = subprocess.run([npx, "run", "build"], cwd=str(HERE),
                                    capture_output=True, text=True, timeout=120)
            if result.returncode == 0:
                print("[Command Center] React build complete.")
            else:
                print(f"[Command Center] React build failed: {result.stderr}")
        else:
            print("[Command Center] WARNING: npx not found. Run 'npm run build' manually.")
    else:
        print("[Command Center] React build is up to date.")


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
        # Serve from dist/ (React production build) if it exists, otherwise cwd
        dist_dir = HERE / "dist"
        serve_dir = str(dist_dir) if dist_dir.is_dir() else str(HERE)
        super().__init__(*args, directory=serve_dir, **kwargs)

    def end_headers(self):
        # Add CORS headers so ES module scripts with crossorigin attribute work
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
        super().end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        # Serve the work queue data for the Kanban board
        if path == "/api/queue":
            queue_path = HERE / "data" / "work-queue.json"
            if queue_path.exists():
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                with open(queue_path, "rb") as f:
                    self.wfile.write(f.read())
                return
            self.send_response(404)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"error": "work-queue.json not found"}).encode())
            return

        # Proxy API calls to Hermes dashboard
        if path.startswith("/api/") or path == "/health":
            self.proxy_to_hermes(path, parsed.query)
            return

        # Serve /data/* from project root (telemetry, etc.)
        if path.startswith("/data/"):
            file_path = HERE / path.lstrip("/")
            if file_path.exists() and file_path.is_file():
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                with open(file_path, "rb") as f:
                    self.wfile.write(f.read())
                return
            # Fall through to 404 below if file doesn't exist

        # Serve static files from the command center directory (or dist/)
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
        self.send_header("Access-Control-Allow-Methods", "GET, PATCH, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
        self.end_headers()

    def do_PATCH(self):
        parsed = urlparse(self.path)
        path = parsed.path

        # PATCH /api/queue/<id> — update a queue item's status
        if path.startswith("/api/queue/"):
            item_id = path[len("/api/queue/"):]
            content_length = int(self.headers.get("Content-Length", 0))
            if content_length == 0:
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "No request body"}).encode())
                return

            body = json.loads(self.rfile.read(content_length))
            new_status = body.get("status")
            valid_statuses = {"waiting", "in_progress", "done", "failed", "paused"}
            if new_status not in valid_statuses:
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"error": f"Invalid status: {new_status}. Must be one of {valid_statuses}"}).encode())
                return

            queue_path = HERE / "data" / "work-queue.json"
            if not queue_path.exists():
                self.send_response(404)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "work-queue.json not found"}).encode())
                return

            with open(queue_path, "r") as f:
                queue_data = json.load(f)

            updated = False
            for item in queue_data.get("queue", []):
                if item["id"] == item_id:
                    item["status"] = new_status
                    if new_status == "done":
                        item["completed_at"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
                    item.pop("last_error", None)
                    updated = True
                    break

            if not updated:
                self.send_response(404)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"error": f"Item '{item_id}' not found"}).encode())
                return

            queue_data["last_updated"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
            with open(queue_path, "w") as f:
                json.dump(queue_data, f, indent=2)

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": True, "id": item_id, "status": new_status}).encode())
            return

        self.send_response(405)
        self.send_header("Access-Control-Allow-Origin", "*")
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

    # Auto-build the React app if needed
    ensure_react_build()

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
