#!/usr/bin/env python3
"""
Command Center — System Telemetry Daemon
Collects CPU, RAM, disk, and system info every N seconds.
Writes JSON to data/telemetry.json (served statically by serve.py).
"""

import json
import os
import platform
import sys
import time
import traceback
from pathlib import Path

import psutil

DATA_DIR = Path(__file__).resolve().parent / "data"
OUTPUT = DATA_DIR / "telemetry.json"
POLL_INTERVAL = 15  # seconds

# Ensure data dir exists
DATA_DIR.mkdir(parents=True, exist_ok=True)


def collect() -> dict:
    """Return a snapshot of system metrics."""
    cpu_percent = psutil.cpu_percent(interval=0.3)
    cpu_per_core = psutil.cpu_percent(interval=0.1, percpu=True)
    mem = psutil.virtual_memory()
    disk = psutil.disk_usage("/")
    boot_ts = psutil.boot_time()
    uptime_seconds = time.time() - boot_ts

    # Format uptime nicely
    days, remainder = divmod(int(uptime_seconds), 86400)
    hours, remainder = divmod(remainder, 3600)
    minutes = remainder // 60
    if days > 0:
        uptime_str = f"{days}d {hours}h {minutes}m"
    elif hours > 0:
        uptime_str = f"{hours}h {minutes}m"
    else:
        uptime_str = f"{minutes}m"

    return {
        "timestamp": time.time(),
        "time_iso": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "cpu": {
            "percent": round(cpu_percent, 1),
            "per_core": [round(c, 1) for c in cpu_per_core],
            "count_logical": psutil.cpu_count(),
            "count_physical": psutil.cpu_count(logical=False),
        },
        "memory": {
            "percent": round(mem.percent, 1),
            "used_gb": round(mem.used / 1e9, 1),
            "total_gb": round(mem.total / 1e9, 1),
            "available_gb": round(mem.available / 1e9, 1),
        },
        "disk": {
            "percent": round(disk.percent, 1),
            "used_gb": round(disk.used / 1e9, 1),
            "total_gb": round(disk.total / 1e9, 1),
            "free_gb": round(disk.free / 1e9, 1),
        },
        "system": {
            "hostname": platform.node(),
            "platform": sys.platform,
            "uptime_seconds": int(uptime_seconds),
            "uptime": uptime_str,
            "boot_time": time.strftime(
                "%Y-%m-%dT%H:%M:%S%z", time.localtime(boot_ts)
            ),
            "process_count": len(psutil.pids()),
        },
    }


def write(data: dict) -> None:
    """Atomically write JSON to OUTPUT."""
    tmp = OUTPUT.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2), encoding="utf-8")
    tmp.replace(OUTPUT)


def loop() -> None:
    """Main poll loop."""
    print(f"[telemetry] starting — poll interval {POLL_INTERVAL}s, output {OUTPUT}")
    # First write immediately
    try:
        write(collect())
        print(f"[telemetry] initial write OK ({OUTPUT.stat().st_size} bytes)")
    except Exception:
        traceback.print_exc()

    while True:
        time.sleep(POLL_INTERVAL)
        try:
            write(collect())
        except Exception:
            traceback.print_exc()


if __name__ == "__main__":
    try:
        loop()
    except KeyboardInterrupt:
        print("[telemetry] stopped by user")
        sys.exit(0)
