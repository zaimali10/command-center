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
            # Forward any auth headers from the request
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
        return True
    except Exception:
        print("[Command Center] Hermes dashboard not running. Starting it...")
        subprocess.Popen(
            [
                str(Path(sys.executable).parent / "hermes.exe"),
                "dashboard",
                "--host", "0.0.0.0",
                "--port", "9119",
                "--no-open",
                "--skip-build",
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
                return True
            except Exception:
                continue
        print("[Command Center] WARNING: Could not verify Hermes dashboard started.")
        return False


if __name__ == "__main__":
    print(f"🏗️  Command Center Server")
    print(f"   Hermes API:  {HERMES_API}")

    # Check/start Hermes dashboard
    ensure_dashboard_running()

    server = HTTPServer(("0.0.0.0", PORT), CommandCenterHandler)
    print(f"\n🌐 Command Center: http://0.0.0.0:{PORT}/")
    print(f"   From iPad:      http://192.168.1.30:{PORT}/")
    print(f"   (Ctrl+C to stop)\n")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.")
        server.server_close()
