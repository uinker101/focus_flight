"""Focus Flight local server: serves app/ and keeps the save file in userdata/.

Usage: python3 server.py [--port 8742] [--no-browser]

No internet access is needed. The save file is userdata/state.json; every
write keeps the previous version in userdata/backups/ (last 30).
"""
import argparse
import datetime as dt
import json
import os
import re
import threading
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
APP_DIR = ROOT / "app"
PACKS_DIR = APP_DIR / "packs"
PACK_INDEX = PACKS_DIR / "index.json"
VERSION_RE = re.compile(r"^[A-Za-z0-9._-]{1,64}$")
SUPPORTED_SCHEMA = 1
USER_DIR = ROOT / "userdata"
STATE_PATH = USER_DIR / "state.json"
HEARTBEAT_PATH = USER_DIR / "heartbeat.json"
BACKUP_DIR = USER_DIR / "backups"
KEEP_BACKUPS = 30
LOCK = threading.Lock()


def read_saved():
    if not STATE_PATH.exists():
        return {"rev": 0, "state": None}
    return json.loads(STATE_PATH.read_text(encoding="utf-8"))


def write_saved(saved):
    USER_DIR.mkdir(exist_ok=True)
    BACKUP_DIR.mkdir(exist_ok=True)
    if STATE_PATH.exists():
        stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S-%f")
        os.replace(STATE_PATH, BACKUP_DIR / f"state-{stamp}.json")
        for old in sorted(BACKUP_DIR.glob("state-*.json"))[:-KEEP_BACKUPS]:
            old.unlink()
    tmp = STATE_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(saved, ensure_ascii=False, indent=1), encoding="utf-8")
    os.replace(tmp, STATE_PATH)


def write_json(path, data):
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    os.replace(tmp, path)


def check_pack(pack):
    """Return an error message, or None if the pack can be installed."""
    if not isinstance(pack, dict) or pack.get("schema_version") != SUPPORTED_SCHEMA:
        return f"不是 schema_version {SUPPORTED_SCHEMA} 的数据包"
    if not VERSION_RE.match(str(pack.get("dataset_version", ""))):
        return "dataset_version 只能用字母、数字和 . _ -"
    for key in ("airports", "airlines", "aircraft_types"):
        if not isinstance(pack.get(key), dict):
            return f"缺少 {key}"
    schedules = pack.get("schedules")
    if not isinstance(schedules, list) or not schedules:
        return "没有班表"
    for s in schedules:
        if s.get("origin") not in pack["airports"] or s.get("destination") not in pack["airports"]:
            return f"班表 {s.get('id')} 的机场不在机场表里"
        if not isinstance(s.get("duration_min"), int) or s["duration_min"] <= 0:
            return f"班表 {s.get('id')} 的航程不合理"
    if pack.get("start_airport") not in pack["airports"]:
        return "起始机场不在机场表里"
    return None


def pause_active(state, journey_id, at_ms):
    """Pause the running flight when the page is closed (sent via sendBeacon)."""
    j = (state or {}).get("active")
    if not j or j.get("id") != journey_id or j.get("stage") != "flying" or j.get("resumed_at") is None:
        return False
    real = max(0, at_ms - j["resumed_at"])
    j["accumulated_ms"] = j.get("accumulated_ms", 0) + real * j.get("speed", 1)
    j["real_ms"] = j.get("real_ms", 0) + real
    j["resumed_at"] = None
    j["paused_at"] = at_ms
    return True


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(APP_DIR), **kwargs)

    def log_message(self, fmt, *args):
        if "/api/" in self.path:
            super().log_message(fmt, *args)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_json(self, code, payload, extra_headers=None):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        for k, v in (extra_headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def read_body(self):
        length = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(length) or b"{}")

    def do_GET(self):
        if self.path == "/api/state":
            with LOCK:
                saved = read_saved()
                saved["heartbeat"] = json.loads(HEARTBEAT_PATH.read_text(encoding="utf-8")) if HEARTBEAT_PATH.exists() else None
                return self.send_json(200, saved)
        if self.path == "/api/export":
            with LOCK:
                saved = read_saved()
            name = f"focus-flight-save-{dt.date.today().isoformat()}.json"
            return self.send_json(200, saved, {"Content-Disposition": f'attachment; filename="{name}"'})
        return super().do_GET()

    def do_PUT(self):
        if self.path != "/api/state":
            return self.send_json(404, {"error": "not found"})
        body = self.read_body()
        with LOCK:
            saved = read_saved()
            if body.get("rev") != saved["rev"]:
                return self.send_json(409, saved)
            saved = {"rev": saved["rev"] + 1, "state": body["state"]}
            write_saved(saved)
        return self.send_json(200, {"rev": saved["rev"]})

    def do_POST(self):
        if self.path == "/api/pause":
            body = self.read_body()
            with LOCK:
                saved = read_saved()
                if pause_active(saved["state"], body.get("journey_id"), int(body.get("at", 0))):
                    saved["rev"] += 1
                    write_saved(saved)
            return self.send_json(200, {"rev": saved["rev"]})
        if self.path == "/api/heartbeat":
            # Kept outside state.json so it never bumps the save revision.
            body = self.read_body()
            with LOCK:
                USER_DIR.mkdir(exist_ok=True)
                write_json(HEARTBEAT_PATH, {"journey_id": body.get("journey_id"), "at": int(body.get("at", 0))})
            return self.send_json(200, {})
        if self.path == "/api/packs/active":
            version = str(self.read_body().get("version", ""))
            with LOCK:
                index = json.loads(PACK_INDEX.read_text(encoding="utf-8"))
                if not any(p["version"] == version for p in index["packs"]):
                    return self.send_json(404, {"error": f"没有安装 {version}"})
                index["active"] = version
                write_json(PACK_INDEX, index)
            return self.send_json(200, index)
        if self.path == "/api/packs/import":
            pack = self.read_body().get("pack")
            error = check_pack(pack)
            if error:
                return self.send_json(400, {"error": error})
            version = pack["dataset_version"]
            with LOCK:
                index = json.loads(PACK_INDEX.read_text(encoding="utf-8"))
                if any(p["version"] == version for p in index["packs"]):
                    return self.send_json(409, {"error": f"版本 {version} 已经安装；新数据请换一个版本号"})
                write_json(PACKS_DIR / f"{version}.json", pack)
                index["packs"].append({"version": version, "title": pack.get("title", version), "file": f"{version}.json", "generated_at": pack.get("generated_at", "")})
                write_json(PACK_INDEX, index)
            return self.send_json(200, index)
        if self.path == "/api/import":
            body = self.read_body()
            if not isinstance(body.get("state"), dict):
                return self.send_json(400, {"error": "不是 Focus Flight 存档"})
            with LOCK:
                saved = read_saved()
                saved = {"rev": saved["rev"] + 1, "state": body["state"]}
                write_saved(saved)
            return self.send_json(200, {"rev": saved["rev"]})
        return self.send_json(404, {"error": "not found"})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8742)
    ap.add_argument("--no-browser", action="store_true")
    args = ap.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    url = f"http://localhost:{args.port}/"
    print(f"Focus Flight 正在运行：{url}  （关闭此窗口或按 Ctrl+C 停止）")
    if not args.no_browser:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
