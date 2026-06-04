#!/usr/bin/env python3
"""
Queue API server for the Command Center Kanban board.
Lightweight standalone server on port 8089 that handles GET /api/queue
and PATCH /api/queue/<id> by reading/writing data/work-queue.json.
This avoids needing to restart the main serve.py process.
"""
import json
import os
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse

HERE = Path(__file__).parent
PORT = 8089
QUEUE_FILE = HERE / "data" / "work-queue.json"
VALID_STATUSES = {"waiting", "in_progress", "done", "failed", "paused"}


class QueueAPIHandler(BaseHTTPRequestHandler):
    def _send_json(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _load_queue(self):
        if not QUEUE_FILE.exists():
            self._send_json(404, {"error": "work-queue.json not found"})
            return None
        with open(QUEUE_FILE, "r") as f:
            return json.load(f)

    def _save_queue(self, data):
        with open(QUEUE_FILE, "w") as f:
            json.dump(data, f, indent=2)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, PATCH, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/queue":
            q = self._load_queue()
            if q is not None:
                self._send_json(200, q)
        elif parsed.path.startswith("/api/queue/"):
            # GET single item
            item_id = parsed.path[len("/api/queue/"):]
            q = self._load_queue()
            if q is None:
                return
            for item in q.get("queue", []):
                if item["id"] == item_id:
                    self._send_json(200, item)
                    return
            self._send_json(404, {"error": f"Item '{item_id}' not found"})
        else:
            self._send_json(404, {"error": "Not found"})

    def do_PATCH(self):
        parsed = urlparse(self.path)
        if not parsed.path.startswith("/api/queue/"):
            self._send_json(404, {"error": "Not found. Use PATCH /api/queue/<id>"})
            return

        item_id = parsed.path[len("/api/queue/"):]
        content_length = int(self.headers.get("Content-Length", 0))
        if content_length == 0:
            self._send_json(400, {"error": "No request body"})
            return

        body = json.loads(self.rfile.read(content_length))
        new_status = body.get("status")
        if new_status not in VALID_STATUSES:
            self._send_json(400, {"error": f"Invalid status: {new_status}. Must be one of {VALID_STATUSES}"})
            return

        q = self._load_queue()
        if q is None:
            return

        updated = False
        for item in q.get("queue", []):
            if item["id"] == item_id:
                item["status"] = new_status
                if new_status == "done":
                    item["completed_at"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
                item.pop("last_error", None)
                updated = True
                break

        if not updated:
            self._send_json(404, {"error": f"Item '{item_id}' not found"})
            return

        q["last_updated"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
        self._save_queue(q)
        self._send_json(200, {"ok": True, "id": item_id, "status": new_status})

    def log_message(self, format, *args):
        print(f"[Queue API] {self.client_address[0]} - {format % args}")


if __name__ == "__main__":
    print(f"[Queue API] Starting on port {PORT}...")
    server = HTTPServer(("0.0.0.0", PORT), QueueAPIHandler)
    print(f"[Queue API] http://0.0.0.0:{PORT}/api/queue")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[Queue API] Shutting down.")
        server.server_close()
