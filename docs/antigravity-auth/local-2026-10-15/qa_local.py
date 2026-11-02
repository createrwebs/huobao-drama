#!/usr/bin/env python3
"""
Independent QA Local Test Runner for Huobao Multi-User & Auth
File: docs/antigravity-auth/local-2026-10-15/qa_local.py
Author: Independent QA
Date: 2026-10-15

Execution Boundaries:
- Strict read-only on product code (no staging, modifying, or resetting dirty files).
- Isolated temporary SQLite database, data directory, and synthetic secret key.
- Loopback-only synthetic Tora identity & credits HTTP server (no live API keys).
- All subprocess commands prefixed with 'rtk'.
- Real backend (5679) and real frontend Nuxt dev server (3013).
- Real browser automation (Node Playwright) testing login dialog, dashboard, and logout.
- Honest defect tracking; unrun items explicitly labeled NOT RUN.
"""

import os
import sys
import json
import re
import time
import socket
import signal
import shutil
import secrets
import tempfile
import threading
import subprocess
import urllib.request
import urllib.error
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path

# Paths
SCRIPT_PATH = os.path.abspath(__file__)
ARTIFACTS_DIR = os.path.dirname(SCRIPT_PATH)
PROJECT_ROOT = "/Users/noppanan/huobao-drama"
assert os.path.isfile(os.path.join(PROJECT_ROOT, "backend", "src", "index.ts")), f"backend/src/index.ts not found in {PROJECT_ROOT}"
BACKEND_DIR = os.path.join(PROJECT_ROOT, "backend")
FRONTEND_DIR = os.path.join(PROJECT_ROOT, "frontend")
LOGS_DIR = os.path.join(ARTIFACTS_DIR, "logs")
SCREENSHOTS_DIR = os.path.join(ARTIFACTS_DIR, "screenshots")
TRACES_DIR = os.path.join(ARTIFACTS_DIR, "traces")

# Playwright path
NODE_PLAYWRIGHT_PATH = "/Users/noppanan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright"

def is_port_in_use(port: int, host: str = "127.0.0.1") -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.8)
        return s.connect_ex((host, port)) == 0

# Synthetic Fixture Credentials (never production keys)
KEY_A1 = "sk-synthetic-qa-user-a-key-primary-1001"
KEY_A2 = "sk-synthetic-qa-user-a-key-secondary-1002"
KEY_B = "sk-synthetic-qa-user-b-key-2001"
KEY_ZERO = "sk-synthetic-qa-user-zero-key-3001"
KEY_INVALID = "sk-synthetic-qa-invalid-key-9999"

FIXTURE_USERS = {
    KEY_A1: {
        "user_id": 9001,
        "token_id": 101,
        "username": "test_user_a",
        "display_name": "Test User A",
        "quota": 500000000,
    },
    KEY_A2: {
        "user_id": 9001,  # Same external user ID as A1!
        "token_id": 102,
        "username": "test_user_a",
        "display_name": "Test User A",
        "quota": 500000000,
    },
    KEY_B: {
        "user_id": 9002,  # Separate tenant
        "token_id": 201,
        "username": "test_user_b",
        "display_name": "Test User B",
        "quota": 200000000,
    },
    KEY_ZERO: {
        "user_id": 9003,  # Zero-quota user
        "token_id": 301,
        "username": "test_user_zero",
        "display_name": "Zero Quota User",
        "quota": 0,
    },
}

def mask_token(token: str) -> str:
    if not token or len(token) <= 8:
        return "********"
    return f"{token[:4]}...{token[-4:]}"

def get_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]

# ---------------------------------------------------------------------------
# Synthetic Upstream Tora Identity & Credits Server
# ---------------------------------------------------------------------------
class SyntheticToraHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Quiet logger
        pass

    def _send_json(self, status: int, payload: dict):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()

    def do_GET(self):
        auth_header = self.headers.get("Authorization", "")
        token = auth_header.replace("Bearer ", "").strip() if "Bearer " in auth_header else ""
        path = self.path.split("?")[0]

        if path in ("/api/huobao/identity", "/v1/huobao/identity"):
            user = FIXTURE_USERS.get(token)
            if not user:
                self._send_json(401, {"success": False, "message": "Invalid or revoked Tora API key (401)"})
                return
            self._send_json(200, {
                "success": True,
                "data": {
                    "user_id": user["user_id"],
                    "token_id": user["token_id"],
                    "username": user["username"],
                    "display_name": user["display_name"],
                    "account_status": 1,
                    "token_status": 1,
                    "expires_at": 0,
                    "quota": user["quota"]
                }
            })
            return

        if path in ("/api/huobao/credits", "/v1/huobao/credits"):
            user = FIXTURE_USERS.get(token)
            if not user:
                self._send_json(401, {"success": False, "message": "Invalid Tora API key"})
                return
            self._send_json(200, {
                "success": True,
                "data": {
                    "user_id": user["user_id"],
                    "token_id": user["token_id"],
                    "token_unlimited": False,
                    "token_quota": user["quota"],
                    "user_quota": user["quota"],
                    "spendable_quota": user["quota"],
                    "spendable_credit": float(user["quota"]) / 1000.0,
                    "spendable_credits": float(user["quota"]) / 1000.0,
                    "quota_per_credit": 1000
                }
            })
            return

        self._send_json(404, {"error": "Not Found"})

    def do_POST(self):
        auth_header = self.headers.get("Authorization", "")
        token = auth_header.replace("Bearer ", "").strip() if "Bearer " in auth_header else ""
        path = self.path.split("?")[0]

        if path in ("/api/huobao/video/quote", "/v1/huobao/video/quote"):
            user = FIXTURE_USERS.get(token)
            if not user:
                self._send_json(401, {"message": "Invalid key"})
                return
            self._send_json(200, {
                "success": True,
                "data": {
                    "model": "wan3.0-video",
                    "resolution": "720P",
                    "duration_seconds": 5,
                    "quota_per_second": 1000,
                    "credit_per_second": 1,
                    "estimated_quota": 5000,
                    "estimated_credits": 5,
                    "spendable_quota": user["quota"],
                    "can_afford": user["quota"] >= 5000
                }
            })
            return

        if path in ("/api/huobao/video/reserve", "/v1/huobao/video/reserve"):
            user = FIXTURE_USERS.get(token)
            if not user or user["quota"] < 5000:
                self._send_json(402, {"message": "Insufficient credits"})
                return
            self._send_json(200, {
                "success": True,
                "data": {
                    "request_id": "req-fixture-qa-12345",
                    "model": "wan3.0-video",
                    "resolution": "720P",
                    "max_duration_seconds": 10,
                    "quota_per_second": 1000,
                    "reserved_quota": 10000,
                    "reserved_credits": 10,
                    "status": "reserved"
                }
            })
            return

        if path in ("/api/huobao/video/settle", "/v1/huobao/video/settle"):
            self._send_json(200, {
                "success": True,
                "data": {
                    "request_id": "req-fixture-qa-12345",
                    "settled_quota": 5000,
                    "settled_credits": 5,
                    "actual_duration_seconds": 5,
                    "status": "settled"
                }
            })
            return

        self._send_json(404, {"error": "Not Found"})


def parse_node_test_counts(stdout_text: str):
    # Try node:test aggregate line (e.g. ℹ tests 7 | suites 0 | pass 7 | fail 0)
    m = re.search(r'tests\s+(\d+)\s*\|\s*suites\s+\d+\s*\|\s*pass\s+(\d+)\s*\|\s*fail\s+(\d+)', stdout_text)
    if m:
        return {"tests": int(m.group(1)), "pass": int(m.group(2)), "fail": int(m.group(3))}
    # Try TAP format (e.g. # tests 7, # pass 7, # fail 0)
    m_t = re.search(r'#\s*tests\s+(\d+)', stdout_text)
    m_p = re.search(r'#\s*pass\s+(\d+)', stdout_text)
    m_f = re.search(r'#\s*fail\s+(\d+)', stdout_text)
    if m_t and m_p:
        return {"tests": int(m_t.group(1)), "pass": int(m_p.group(1)), "fail": int(m_f.group(1)) if m_f else 0}
    return {"tests": "unknown", "pass": "unknown", "fail": "unknown"}

# ---------------------------------------------------------------------------
# Runner Class
# ---------------------------------------------------------------------------
class LocalQARunner:
    def __init__(self):
        self.temp_dir = tempfile.mkdtemp(prefix="huobao_qa_local_")
        self.synthetic_secret_key = secrets.token_hex(32)
        self.fixture_port = get_free_port()
        self.fixture_proc = None

        self.backend_proc = None
        self.frontend_proc = None
        self.start_time = time.time()
        self.total_deadline_seconds = 270

        self.results = {
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
            "temp_dir": self.temp_dir,
            "synthetic_fixture_port": self.fixture_port,
            "typecheck": {},
            "individual_tests": [],
            "runtime": {},
            "api_assertions": [],
            "browser_checks": {},
            "verdict": "PARTIAL",
            "not_run": [
                "Production Tora upstream authentication",
                "Real payment / credit billing transactions",
                "Paid video rendering via external Colab / R2 workers",
                "Real MySQL schema migration on production data"
            ],
            "defects": []
        }

        os.makedirs(LOGS_DIR, exist_ok=True)
        os.makedirs(SCREENSHOTS_DIR, exist_ok=True)
        os.makedirs(TRACES_DIR, exist_ok=True)

    def check_deadline(self) -> bool:
        elapsed = time.time() - self.start_time
        if elapsed > self.total_deadline_seconds:
            print(f"[FATAL] Global deadline exceeded ({elapsed:.1f}s > {self.total_deadline_seconds}s). Aborting.")
            self.results["verdict"] = "PARTIAL"
            self.results["defects"].append({
                "severity": "CRITICAL",
                "title": f"Execution deadline exceeded ({self.total_deadline_seconds}s limit)",
                "details": f"Elapsed time: {elapsed:.1f}s"
            })
            return False
        return True

    def start_fixture_server(self):
        print(f"[*] Starting synthetic Tora identity/credit HTTP server on 127.0.0.1:{self.fixture_port} as detached subprocess...")
        fixture_log = open(os.path.join(LOGS_DIR, "runtime_fixture.log"), "w", encoding="utf-8")
        cmd = ["rtk", "proxy", sys.executable, SCRIPT_PATH, "--fixture", str(self.fixture_port)]
        self.fixture_proc = subprocess.Popen(
            cmd,
            cwd=PROJECT_ROOT,
            stdout=fixture_log,
            stderr=fixture_log,
            start_new_session=True
        )

        # Wait for fixture to be responsive
        fixture_ready = self._wait_for_url(f"http://127.0.0.1:{self.fixture_port}/api/huobao/identity", timeout=10)
        fixture_alive = (self.fixture_proc.poll() is None)
        if not fixture_ready or not fixture_alive:
            raise RuntimeError(f"Fixture subprocess failed to start on 127.0.0.1:{self.fixture_port}")

        self.results["runtime"]["fixture_tora"] = {
            "pid": self.fixture_proc.pid,
            "port": self.fixture_port,
            "ready": True
        }
        print(f"[+] Synthetic Tora server running (PID: {self.fixture_proc.pid}) on http://127.0.0.1:{self.fixture_port}")

    def run_cmd(self, cmd_args, cwd=None, env=None, log_file=None, timeout=60):
        # Enforce 'rtk' prefix on all shell commands
        if cmd_args[0] != "rtk":
            cmd_args = ["rtk"] + cmd_args

        t0 = time.time()
        try:
            res = subprocess.run(
                cmd_args,
                cwd=cwd or PROJECT_ROOT,
                env=env or os.environ.copy(),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=timeout
            )
            duration_ms = round((time.time() - t0) * 1000, 2)
            stdout = res.stdout
            stderr = res.stderr
            retcode = res.returncode
        except subprocess.TimeoutExpired as e:
            duration_ms = round((time.time() - t0) * 1000, 2)
            stdout = e.stdout or ""
            stderr = f"Command timed out after {timeout} seconds\n{e.stderr or ''}"
            retcode = -999

        if log_file:
            with open(log_file, "w", encoding="utf-8") as f:
                f.write(f"COMMAND: {' '.join(cmd_args)}\n")
                f.write(f"CWD: {cwd or PROJECT_ROOT}\n")
                f.write(f"EXIT CODE: {retcode}\n")
                f.write(f"DURATION_MS: {duration_ms}\n")
                f.write("\n=== STDOUT ===\n")
                f.write(stdout)
                f.write("\n=== STDERR ===\n")
                f.write(stderr)

        class ExecResult:
            def __init__(self, returncode, stdout, stderr):
                self.returncode = returncode
                self.stdout = stdout
                self.stderr = stderr

        return ExecResult(retcode, stdout, stderr), duration_ms

    def run_phase_1_tests(self):
        if not self.check_deadline():
            return

        print("\n=== Phase 1: Focused Unit & Integration Tests (Isolated Environment) ===")
        tsx_bin = os.path.join(BACKEND_DIR, "node_modules", ".bin", "tsx")

        # 1. Typecheck
        print("[*] Running backend typecheck (rtk npm --prefix backend run typecheck)...")
        log_typecheck = os.path.join(LOGS_DIR, "backend_typecheck.log")
        res_tc, tc_ms = self.run_cmd(["rtk", "npm", "--prefix", "backend", "run", "typecheck"], cwd=PROJECT_ROOT, log_file=log_typecheck, timeout=45)
        tc_status = "PASS" if res_tc.returncode == 0 else "FAIL"
        print(f"[{tc_status}] Backend typecheck (exit: {res_tc.returncode}, {tc_ms}ms)")
        self.results["typecheck"] = {
            "status": tc_status,
            "exit_code": res_tc.returncode,
            "duration_ms": tc_ms,
            "log": log_typecheck
        }
        if tc_status == "FAIL":
            self.results["defects"].append({
                "severity": "CRITICAL",
                "title": "Backend TypeScript typecheck failed",
                "details": res_tc.stderr or res_tc.stdout
            })

        # 2. Individual Unit/Integration Tests
        test_files = [
            "backend/tests/auth-a1.test.ts",
            "backend/tests/ownership-a3.test.ts",
            "backend/tests/media-a4.test.ts",
            "backend/tests/migration-a2.test.ts",
            "backend/tests/billing-a5.test.ts",
            "backend/tests/request-logger.test.ts"
        ]

        for tf in test_files:
            if not self.check_deadline():
                break

            basename = os.path.basename(tf).replace(".test.ts", "")
            log_path = os.path.join(LOGS_DIR, f"test_{basename}.log")

            test_env = os.environ.copy()
            test_env["SQLITE_PATH"] = os.path.join(self.temp_dir, f"db_{basename}.sqlite3")
            test_env["HUOBAO_DATA_DIR"] = os.path.join(self.temp_dir, f"data_{basename}")
            test_env["STORAGE_PATH"] = os.path.join(self.temp_dir, f"data_{basename}", "static")
            test_env["HUOBAO_SECRET_KEY"] = self.synthetic_secret_key
            test_env["MYSQL_AUTO_IMPORT"] = "false"
            test_env["NODE_ENV"] = "development"
            test_env["HUOBAO_SERVER_MODE"] = "true"
            test_env["TORA_API_BASE_URL"] = f"http://127.0.0.1:{self.fixture_port}"

            print(f"[*] Running test {basename}...")
            cmd = ["rtk", "proxy", tsx_bin, "--test", tf]
            res, duration = self.run_cmd(cmd, cwd=PROJECT_ROOT, env=test_env, log_file=log_path, timeout=50)
            status = "PASS" if res.returncode == 0 else "FAIL"
            counts = parse_node_test_counts(res.stdout)
            print(f"[{status}] {tf} (exit: {res.returncode}, {duration}ms, pass: {counts['pass']}, fail: {counts['fail']})")

            self.results["individual_tests"].append({
                "file": tf,
                "status": status,
                "exit_code": res.returncode,
                "duration_ms": duration,
                "test_counts": counts,
                "log": log_path
            })

            if status == "FAIL":
                self.results["defects"].append({
                    "severity": "HIGH",
                    "title": f"Test failure in {tf}",
                    "details": res.stderr[:500] if res.stderr else res.stdout[:500]
                })

    def start_runtime_servers(self):
        if not self.check_deadline():
            return False

        print("\n=== Phase 2: Starting Backend & Frontend Runtime ===")
        tsx_bin = os.path.join(BACKEND_DIR, "node_modules", ".bin", "tsx")

        # Socket preflights: ensure 5679 and 3013 are NOT occupied
        if is_port_in_use(5679):
            print("[FATAL] Port 5679 is already occupied before starting. Aborting to avoid attaching to unrelated server.")
            self.results["verdict"] = "BLOCKED"
            self.results["defects"].append({"severity": "BLOCKER", "title": "Port 5679 occupied before runtime launch"})
            return False

        if is_port_in_use(3013):
            print("[FATAL] Port 3013 is already occupied before starting. Aborting to avoid attaching to unrelated server.")
            self.results["verdict"] = "BLOCKED"
            self.results["defects"].append({"severity": "BLOCKER", "title": "Port 3013 occupied before runtime launch"})
            return False

        # 1. Start Backend on 5679
        backend_env = os.environ.copy()
        backend_env["PORT"] = "5679"
        backend_env["HUOBAO_SERVER_MODE"] = "true"
        backend_env["MYSQL_AUTO_IMPORT"] = "false"
        backend_env["SQLITE_PATH"] = os.path.join(self.temp_dir, "runtime.sqlite3")
        backend_env["HUOBAO_DATA_DIR"] = os.path.join(self.temp_dir, "runtime_data")
        backend_env["STORAGE_PATH"] = os.path.join(self.temp_dir, "runtime_data", "static")
        backend_env["HUOBAO_SECRET_KEY"] = self.synthetic_secret_key
        backend_env["NODE_ENV"] = "development"
        backend_env["TORA_API_BASE_URL"] = f"http://127.0.0.1:{self.fixture_port}"

        backend_log = open(os.path.join(LOGS_DIR, "runtime_backend.log"), "w", encoding="utf-8")
        print("[*] Launching backend on 5679 with start_new_session=True...")
        self.backend_proc = subprocess.Popen(
            ["rtk", "proxy", tsx_bin, "src/index.ts"],
            cwd=BACKEND_DIR,
            env=backend_env,
            stdout=backend_log,
            stderr=backend_log,
            start_new_session=True
        )

        # 2. Start Frontend on 3013
        frontend_log = open(os.path.join(LOGS_DIR, "runtime_frontend.log"), "w", encoding="utf-8")
        print("[*] Launching frontend Nuxt dev on 3013 with start_new_session=True...")
        self.frontend_proc = subprocess.Popen(
            ["rtk", "npm", "run", "dev", "--", "--host", "127.0.0.1", "--port", "3013"],
            cwd=FRONTEND_DIR,
            env=os.environ.copy(),
            stdout=frontend_log,
            stderr=frontend_log,
            start_new_session=True
        )

        # 3. Wait for readiness and verify child processes remain alive
        print("[*] Waiting for servers to become ready and verifying child processes...")
        backend_ready = (
            self.backend_proc.poll() is None
            and self._wait_for_url("http://127.0.0.1:5679/api/v1/health", timeout=30)
            and self.backend_proc.poll() is None
        )
        frontend_ready = (
            self.frontend_proc.poll() is None
            and self._wait_for_url("http://127.0.0.1:3013/storyvdo/", timeout=40)
            and self.frontend_proc.poll() is None
        )

        self.results["runtime"]["backend"] = {
            "pid": self.backend_proc.pid,
            "port": 5679,
            "ready": backend_ready,
            "alive": self.backend_proc.poll() is None,
            "log": os.path.join(LOGS_DIR, "runtime_backend.log")
        }
        self.results["runtime"]["frontend"] = {
            "pid": self.frontend_proc.pid,
            "port": 3013,
            "ready": frontend_ready,
            "alive": self.frontend_proc.poll() is None,
            "log": os.path.join(LOGS_DIR, "runtime_frontend.log")
        }

        if not backend_ready:
            print("[FATAL] Backend failed to start or died on 5679")
            self.results["verdict"] = "BLOCKED"
            self.results["defects"].append({"severity": "BLOCKER", "title": "Backend runtime failed or exited on port 5679"})
            self._cleanup_own_process_groups()
            return False

        if not frontend_ready:
            print("[FATAL] Frontend failed to start or died on 3013")
            self.results["verdict"] = "BLOCKED"
            self.results["defects"].append({"severity": "BLOCKER", "title": "Frontend Nuxt dev server failed or exited on port 3013"})
            self._cleanup_own_process_groups()
            return False

        print("[+] Both backend and frontend listeners verified ready and owned by active child processes.")
        return True

    def _wait_for_url(self, url: str, timeout: int = 30) -> bool:
        start = time.time()
        while time.time() - start < timeout:
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "Independent-QA-Check"})
                with urllib.request.urlopen(req, timeout=3) as resp:
                    if resp.status in (200, 304, 401):
                        return True
            except urllib.error.HTTPError as e:
                if e.code in (200, 304, 401):
                    return True
            except Exception:
                pass
            time.sleep(1)
        return False

    def run_phase_3_api_matrix(self):
        print("\n=== Phase 3: Real Backend & Nuxt Proxy API Assertions ===")
        api_results = []

        def record_api(check_id, desc, passed, detail=""):
            status = "PASS" if passed else "FAIL"
            print(f"[{status}] {check_id}: {desc} ({detail})")
            api_results.append({
                "check_id": check_id,
                "description": desc,
                "status": status,
                "detail": detail
            })
            if not passed:
                self.results["defects"].append({
                    "severity": "HIGH",
                    "title": f"API Check Failed: {check_id}",
                    "details": f"{desc} -> {detail}"
                })

        # 1. Unauthenticated /api/v1/dramas -> 401
        try:
            req = urllib.request.Request("http://127.0.0.1:5679/api/v1/dramas")
            with urllib.request.urlopen(req) as resp:
                record_api("API-01", "Unauthenticated request rejected with 401", False, f"Returned HTTP {resp.status}")
        except urllib.error.HTTPError as e:
            record_api("API-01", "Unauthenticated request rejected with 401", e.code == 401, f"Returned HTTP {e.code}")

        # 2. Invalid login rejected -> 401
        try:
            body = json.dumps({"apiKey": KEY_INVALID}).encode("utf-8")
            req = urllib.request.Request("http://127.0.0.1:5679/api/v1/auth/login", data=body, headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req) as resp:
                record_api("API-02", "Invalid login key rejected with 401", False, f"Returned HTTP {resp.status}")
        except urllib.error.HTTPError as e:
            record_api("API-02", "Invalid login key rejected with 401", e.code == 401, f"Returned HTTP {e.code}")

        # 3. User A login (Key A1) & create drama
        session_a = None
        cookie_a = None
        drama_a_id = None
        try:
            body = json.dumps({"apiKey": KEY_A1}).encode("utf-8")
            req = urllib.request.Request("http://127.0.0.1:5679/api/v1/auth/login", data=body, headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                cookie_header = resp.headers.get("Set-Cookie", "")
                if "huobao_session=" in cookie_header:
                    cookie_a = cookie_header.split("huobao_session=")[1].split(";")[0]
                session_a = data.get("data", {}).get("sessionToken")
                user_a = data.get("data", {}).get("user", {})
                passed = (resp.status == 200 and user_a.get("username") == "test_user_a")
                record_api("API-03", "User A login with Key A1", passed, f"User ID: {user_a.get('id')}")
        except Exception as e:
            record_api("API-03", "User A login with Key A1", False, str(e))

        # Create Drama A
        if session_a or cookie_a:
            try:
                body = json.dumps({"title": "QA Isolated Drama User A", "aspect_ratio": "16:9"}).encode("utf-8")
                headers = {"Content-Type": "application/json"}
                if cookie_a: headers["Cookie"] = f"huobao_session={cookie_a}"
                if session_a: headers["X-Session-Token"] = session_a

                req = urllib.request.Request("http://127.0.0.1:5679/api/v1/dramas", data=body, headers=headers)
                with urllib.request.urlopen(req) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                    drama_a_id = data.get("data", {}).get("id")
                    record_api("API-04", "User A creates drama project", (resp.status in (200, 201) and drama_a_id is not None), f"Drama A ID: {drama_a_id}")
            except Exception as e:
                record_api("API-04", "User A creates drama project", False, str(e))

        # 4. User B login (Key B) & create drama
        session_b = None
        cookie_b = None
        drama_b_id = None
        try:
            body = json.dumps({"apiKey": KEY_B}).encode("utf-8")
            req = urllib.request.Request("http://127.0.0.1:5679/api/v1/auth/login", data=body, headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                cookie_header = resp.headers.get("Set-Cookie", "")
                if "huobao_session=" in cookie_header:
                    cookie_b = cookie_header.split("huobao_session=")[1].split(";")[0]
                session_b = data.get("data", {}).get("sessionToken")
                user_b = data.get("data", {}).get("user", {})
                passed = (resp.status == 200 and user_b.get("username") == "test_user_b")
                record_api("API-05", "User B login with Key B", passed, f"User ID: {user_b.get('id')}")
        except Exception as e:
            record_api("API-05", "User B login with Key B", False, str(e))

        # Create Drama B
        if session_b or cookie_b:
            try:
                body = json.dumps({"title": "QA Isolated Drama User B", "aspect_ratio": "16:9"}).encode("utf-8")
                headers = {"Content-Type": "application/json"}
                if cookie_b: headers["Cookie"] = f"huobao_session={cookie_b}"
                if session_b: headers["X-Session-Token"] = session_b

                req = urllib.request.Request("http://127.0.0.1:5679/api/v1/dramas", data=body, headers=headers)
                with urllib.request.urlopen(req) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                    drama_b_id = data.get("data", {}).get("id")
                    record_api("API-06", "User B creates drama project", (resp.status in (200, 201) and drama_b_id is not None), f"Drama B ID: {drama_b_id}")
            except Exception as e:
                record_api("API-06", "User B creates drama project", False, str(e))

        # 5. Tenant List Isolation: A sees only A; B sees only B
        if drama_a_id and drama_b_id:
            # Check A
            try:
                headers = {}
                if cookie_a: headers["Cookie"] = f"huobao_session={cookie_a}"
                if session_a: headers["X-Session-Token"] = session_a
                req = urllib.request.Request("http://127.0.0.1:5679/api/v1/dramas", headers=headers)
                with urllib.request.urlopen(req) as resp:
                    items = json.loads(resp.read().decode("utf-8")).get("data", {}).get("items", [])
                    ids = [x["id"] for x in items]
                    passed = (drama_a_id in ids and drama_b_id not in ids)
                    record_api("API-07", "User A list includes Drama A and excludes Drama B", passed, f"Returned IDs: {ids}")
            except Exception as e:
                record_api("API-07", "User A list includes Drama A and excludes Drama B", False, str(e))

            # Check B
            try:
                headers = {}
                if cookie_b: headers["Cookie"] = f"huobao_session={cookie_b}"
                if session_b: headers["X-Session-Token"] = session_b
                req = urllib.request.Request("http://127.0.0.1:5679/api/v1/dramas", headers=headers)
                with urllib.request.urlopen(req) as resp:
                    items = json.loads(resp.read().decode("utf-8")).get("data", {}).get("items", [])
                    ids = [x["id"] for x in items]
                    passed = (drama_b_id in ids and drama_a_id not in ids)
                    record_api("API-08", "User B list includes Drama B and excludes Drama A", passed, f"Returned IDs: {ids}")
            except Exception as e:
                record_api("API-08", "User B list includes Drama B and excludes Drama A", False, str(e))

        # 6. Negative Probing: User B cannot GET, PUT, or DELETE Drama A (returns 404)
        if drama_a_id and (session_b or cookie_b):
            b_headers = {}
            if cookie_b: b_headers["Cookie"] = f"huobao_session={cookie_b}"
            if session_b: b_headers["X-Session-Token"] = session_b

            # GET probe
            try:
                req = urllib.request.Request(f"http://127.0.0.1:5679/api/v1/dramas/{drama_a_id}", headers=b_headers)
                with urllib.request.urlopen(req) as resp:
                    record_api("API-09", "User B GET Drama A returns 404", False, f"HTTP {resp.status}")
            except urllib.error.HTTPError as e:
                record_api("API-09", "User B GET Drama A returns 404", e.code == 404, f"HTTP {e.code}")

            # PUT probe
            try:
                put_body = json.dumps({"title": "Hijacked Title"}).encode("utf-8")
                b_put_headers = dict(b_headers)
                b_put_headers["Content-Type"] = "application/json"
                req = urllib.request.Request(f"http://127.0.0.1:5679/api/v1/dramas/{drama_a_id}", data=put_body, headers=b_put_headers, method="PUT")
                with urllib.request.urlopen(req) as resp:
                    record_api("API-10", "User B PUT Drama A returns 404", False, f"HTTP {resp.status}")
            except urllib.error.HTTPError as e:
                record_api("API-10", "User B PUT Drama A returns 404", e.code == 404, f"HTTP {e.code}")

            # DELETE probe
            try:
                req = urllib.request.Request(f"http://127.0.0.1:5679/api/v1/dramas/{drama_a_id}", headers=b_headers, method="DELETE")
                with urllib.request.urlopen(req) as resp:
                    record_api("API-11", "User B DELETE Drama A returns 404", False, f"HTTP {resp.status}")
            except urllib.error.HTTPError as e:
                record_api("API-11", "User B DELETE Drama A returns 404", e.code == 404, f"HTTP {e.code}")

        # 7. Multi-key User A2 (secondary key maps to same User A)
        if drama_a_id:
            try:
                body = json.dumps({"apiKey": KEY_A2}).encode("utf-8")
                req = urllib.request.Request("http://127.0.0.1:5679/api/v1/auth/login", data=body, headers={"Content-Type": "application/json"})
                with urllib.request.urlopen(req) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                    user_a2 = data.get("data", {}).get("user", {})
                    session_a2 = data.get("data", {}).get("sessionToken")

                    # Use session_a2 to get Drama A
                    a2_headers = {"X-Session-Token": session_a2}
                    req_detail = urllib.request.Request(f"http://127.0.0.1:5679/api/v1/dramas/{drama_a_id}", headers=a2_headers)
                    with urllib.request.urlopen(req_detail) as resp_d:
                        d_data = json.loads(resp_d.read().decode("utf-8"))
                        passed = (resp_d.status == 200 and d_data.get("data", {}).get("id") == drama_a_id)
                        record_api("API-12", "Secondary Key A2 sees existing Drama A", passed, f"User ID: {user_a2.get('id')}")
            except Exception as e:
                record_api("API-12", "Secondary Key A2 sees existing Drama A", False, str(e))

        # 8. Zero-credit user can login without blocker
        try:
            body = json.dumps({"apiKey": KEY_ZERO}).encode("utf-8")
            req = urllib.request.Request("http://127.0.0.1:5679/api/v1/auth/login", data=body, headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                credits_info = data.get("data", {}).get("credits", {})
                spendable = credits_info.get("spendableCredit", -1)
                passed = (resp.status == 200 and spendable == 0)
                record_api("API-13", "Zero-credit user logs in successfully", passed, f"Spendable credits: {spendable}")
        except Exception as e:
            record_api("API-13", "Zero-credit user logs in successfully", False, str(e))

        # 9. Logout session invalidation
        if session_a:
            try:
                headers = {"X-Session-Token": session_a}
                req = urllib.request.Request("http://127.0.0.1:5679/api/v1/auth/logout", data=b"{}", headers=headers)
                with urllib.request.urlopen(req) as resp:
                    logout_ok = (resp.status == 200)

                # Re-verify old session is rejected
                try:
                    req_old = urllib.request.Request("http://127.0.0.1:5679/api/v1/dramas", headers=headers)
                    with urllib.request.urlopen(req_old) as resp_old:
                        record_api("API-14", "Logged out session invalidated (401)", False, f"Old session still active: HTTP {resp_old.status}")
                except urllib.error.HTTPError as e:
                    record_api("API-14", "Logged out session invalidated (401)", e.code == 401, f"Returned HTTP {e.code}")
            except Exception as e:
                record_api("API-14", "Logged out session invalidated (401)", False, str(e))

        # 10. Fabricated fake session rejected -> 401
        try:
            fake_headers = {"X-Session-Token": "0000000000000000000000000000000000000000000000000000000000000000"}
            req = urllib.request.Request("http://127.0.0.1:5679/api/v1/dramas", headers=fake_headers)
            with urllib.request.urlopen(req) as resp:
                record_api("API-15", "Fabricated session token rejected with 401", False, f"HTTP {resp.status}")
        except urllib.error.HTTPError as e:
            record_api("API-15", "Fabricated session token rejected with 401", e.code == 401, f"HTTP {e.code}")

        # 11. Real Nuxt Proxy verification (hit 3013 /storyvdo/api/v1/health -> proxies to 5679)
        try:
            req = urllib.request.Request("http://127.0.0.1:3013/storyvdo/api/v1/health")
            with urllib.request.urlopen(req) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                passed = (resp.status == 200 and data.get("status") == "ok")
                record_api("API-16", "Nuxt Vite proxy correctly forwards API to backend", passed, f"Proxy response: {data}")
        except Exception as e:
            record_api("API-16", "Nuxt Vite proxy correctly forwards API to backend", False, str(e))

        self.results["api_assertions"] = api_results
        self.drama_a_id = drama_a_id
        self.drama_b_id = drama_b_id

    def run_phase_4_browser_playwright(self):
        if not self.check_deadline():
            return

        print("\n=== Phase 4: Browser Playwright E2E Testing ===")
        browser_script_path = os.path.join(self.temp_dir, "browser_e2e.cjs")

        drama_a_id = getattr(self, "drama_a_id", 1) or 1
        drama_b_id = getattr(self, "drama_b_id", 2) or 2

        # Never read stale summary from earlier attempt
        browser_json_path = os.path.join(ARTIFACTS_DIR, "browser_summary.json")
        if os.path.exists(browser_json_path):
            try: os.remove(browser_json_path)
            except: pass

        # Create self-contained Playwright test script
        cjs_content = f"""
const fs = require('fs');
const path = require('path');

let playwright;
try {{
    playwright = require('{NODE_PLAYWRIGHT_PATH}');
}} catch (e) {{
    try {{
        playwright = require('playwright');
    }} catch (e2) {{
        console.error('Playwright not resolvable:', e2.message);
        process.exit(10);
    }}
}}

const {{ chromium }} = playwright;

async function run() {{
    const baseUrl = 'http://127.0.0.1:3013/storyvdo/';
    const screenshotsDir = '{SCREENSHOTS_DIR}';
    const tracesDir = '{TRACES_DIR}';
    const outPath = path.join('{ARTIFACTS_DIR}', 'browser_summary.json');
    const keyA = '{KEY_A1}';
    const keyB = '{KEY_B}';
    const dramaAId = {drama_a_id};

    const out = {{
        launched: false,
        mode: 'unknown',
        steps: [],
        page_errors: [],
        failed_requests: []
    }};

    let browser = null;
    const launchConfigs = [
        {{ headless: false }},
        {{ headless: true }},
        {{ channel: 'chrome', headless: false }},
        {{ channel: 'chrome', headless: true }}
    ];

    for (const cfg of launchConfigs) {{
        try {{
            browser = await chromium.launch(cfg);
            out.launched = true;
            out.mode = `${{cfg.channel || 'bundled-chromium'}} (headless=${{cfg.headless}})`;
            break;
        }} catch (e) {{
            // try next fallback option
        }}
    }}

    if (!browser) {{
        out.error = 'All Chromium and Chrome launch configurations failed';
        fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
        process.exit(1);
    }}

    console.log(`[Browser] Launched in ${{out.mode}} mode`);

    try {{
        // --- CONTEXT A: USER A ---
        const ctxA = await browser.newContext({{ viewport: {{ width: 1280, height: 800 }} }});
        await ctxA.tracing.start({{ screenshots: true, snapshots: true }});
        const pageA = await ctxA.newPage();

        pageA.on('pageerror', err => out.page_errors.push(`PageA: ${{err.message}}`));
        pageA.on('requestfailed', req => out.failed_requests.push(`PageA: ${{req.method()}} ${{req.url()}} (${{req.failure()?.errorText}})`));

        try {{
            await pageA.goto(baseUrl, {{ waitUntil: 'networkidle', timeout: 15000 }});

            // Step 1: Assert visible actual login dialog for anon before PASS
            let keyInputVisible = await pageA.locator('#tora-api-key').isVisible();
            if (!keyInputVisible) {{
                try {{
                    await pageA.click('.login-trigger-btn', {{ timeout: 3000 }});
                    await pageA.locator('#tora-api-key').waitFor({{ state: 'visible', timeout: 5000 }});
                    keyInputVisible = await pageA.locator('#tora-api-key').isVisible();
                }} catch (e) {{}}
            }}

            await pageA.screenshot({{ path: path.join(screenshotsDir, 'screenshot_01_anon_login_dialog.png') }});
            out.steps.push({{
                name: 'anon_view',
                status: keyInputVisible ? 'PASS' : 'FAIL',
                screenshot: 'screenshot_01_anon_login_dialog.png',
                details: `#tora-api-key visible: ${{keyInputVisible}}`
            }});

            if (!keyInputVisible) throw new Error('#tora-api-key was not visible for anonymous session');

            // Step 2: Login User A and verify dashboard contains Drama A and NOT Drama B
            await pageA.locator('#tora-api-key').fill(keyA);
            await pageA.click('.login-actions button[type="submit"]');

            const userPillA = pageA.locator('.user-pill');
            await userPillA.waitFor({{ state: 'visible', timeout: 12000 }});
            const userNameA = await pageA.locator('.user-name').innerText();

            // Wait for project list to load
            await pageA.waitForTimeout(2000);
            const bodyA = await pageA.innerText('body');
            const hasDramaA = bodyA.includes('QA Isolated Drama User A');
            const hasDramaBInA = bodyA.includes('QA Isolated Drama User B');

            const passA = userNameA.includes('Test User A') && hasDramaA && !hasDramaBInA;
            await pageA.screenshot({{ path: path.join(screenshotsDir, 'screenshot_02_user_a_dashboard.png') }});
            out.steps.push({{
                name: 'user_a_login',
                status: passA ? 'PASS' : 'FAIL',
                userName: userNameA,
                screenshot: 'screenshot_02_user_a_dashboard.png',
                details: `User: ${{userNameA}}, Drama A present: ${{hasDramaA}}, Drama B absent: ${{!hasDramaBInA}}`
            }});
        }} catch (e) {{
            out.steps.push({{ name: 'user_a_login', status: 'FAIL', error: e.message }});
        }} finally {{
            await ctxA.tracing.stop({{ path: path.join(tracesDir, 'trace_user_a.zip') }});
            await ctxA.close();
        }}

        // --- CONTEXT B: USER B (Separate Isolated Storage) ---
        const ctxB = await browser.newContext({{ viewport: {{ width: 1280, height: 800 }} }});
        await ctxB.tracing.start({{ screenshots: true, snapshots: true }});
        const pageB = await ctxB.newPage();

        pageB.on('pageerror', err => out.page_errors.push(`PageB: ${{err.message}}`));
        pageB.on('requestfailed', req => out.failed_requests.push(`PageB: ${{req.method()}} ${{req.url()}} (${{req.failure()?.errorText}})`));

        try {{
            await pageB.goto(baseUrl, {{ waitUntil: 'networkidle', timeout: 15000 }});

            let keyInputVisibleB = await pageB.locator('#tora-api-key').isVisible();
            if (!keyInputVisibleB) {{
                try {{
                    await pageB.click('.login-trigger-btn', {{ timeout: 3000 }});
                    await pageB.locator('#tora-api-key').waitFor({{ state: 'visible', timeout: 5000 }});
                }} catch (e) {{}}
            }}

            await pageB.locator('#tora-api-key').fill(keyB);
            await pageB.click('.login-actions button[type="submit"]');

            const userPillB = pageB.locator('.user-pill');
            await userPillB.waitFor({{ state: 'visible', timeout: 12000 }});
            const userNameB = await pageB.locator('.user-name').innerText();

            // Wait for project list
            await pageB.waitForTimeout(2000);
            const bodyB = await pageB.innerText('body');
            const hasDramaB = bodyB.includes('QA Isolated Drama User B');
            const hasDramaAInB = bodyB.includes('QA Isolated Drama User A');

            const passB = userNameB.includes('Test User B') && hasDramaB && !hasDramaAInB;
            await pageB.screenshot({{ path: path.join(screenshotsDir, 'screenshot_03_user_b_dashboard.png') }});
            out.steps.push({{
                name: 'user_b_login',
                status: passB ? 'PASS' : 'FAIL',
                userName: userNameB,
                screenshot: 'screenshot_03_user_b_dashboard.png',
                details: `User: ${{userNameB}}, Drama B present: ${{hasDramaB}}, Drama A absent: ${{!hasDramaAInB}}`
            }});

            // Step 4: Cross-tenant direct navigation: B attempts to view A's drama
            let dramaApiStatus = null;
            pageB.on('response', resp => {{
                if (resp.url().includes(`/api/v1/dramas/${{dramaAId}}`)) {{
                    dramaApiStatus = resp.status();
                }}
            }});

            await pageB.goto(`${{baseUrl}}drama/${{dramaAId}}`, {{ waitUntil: 'networkidle', timeout: 10000 }}).catch(() => {{}});
            await pageB.waitForTimeout(1000);
            const crossBody = await pageB.innerText('body');
            const absentA = !crossBody.includes('QA Isolated Drama User A');
            const passCross = (dramaApiStatus === 404 || absentA) && absentA;

            await pageB.screenshot({{ path: path.join(screenshotsDir, 'screenshot_04_cross_tenant_denied.png') }});
            out.steps.push({{
                name: 'cross_tenant_browser_denied',
                status: passCross ? 'PASS' : 'FAIL',
                screenshot: 'screenshot_04_cross_tenant_denied.png',
                details: `API 404 returned: ${{dramaApiStatus === 404}} (status ${{dramaApiStatus}}), Drama A title absent: ${{absentA}}`
            }});

            // Step 5: Logout assert #tora-api-key visible and /auth/me is 401 through browser request
            await pageB.goto(baseUrl, {{ waitUntil: 'networkidle', timeout: 10000 }});
            await pageB.click('.user-pill');
            await pageB.click('.logout-btn');
            await pageB.waitForTimeout(1500);

            let keyVisibleAfterLogout = false;
            try {{
                await pageB.locator('#tora-api-key').waitFor({{ state: 'visible', timeout: 5000 }});
                keyVisibleAfterLogout = true;
            }} catch (e) {{}}

            const meStatus = await pageB.evaluate(async () => {{
                try {{
                    const r = await fetch('/storyvdo/api/v1/auth/me');
                    return r.status;
                }} catch (e) {{
                    return -1;
                }}
            }});

            const passLogout = keyVisibleAfterLogout && (meStatus === 401);
            await pageB.screenshot({{ path: path.join(screenshotsDir, 'screenshot_05_logged_out.png') }});
            out.steps.push({{
                name: 'logout_flow',
                status: passLogout ? 'PASS' : 'FAIL',
                screenshot: 'screenshot_05_logged_out.png',
                details: `#tora-api-key visible: ${{keyVisibleAfterLogout}}, /auth/me status: ${{meStatus}}`
            }});
        }} catch (e) {{
            out.steps.push({{ name: 'user_b_flow', status: 'FAIL', error: e.message }});
        }} finally {{
            await ctxB.tracing.stop({{ path: path.join(tracesDir, 'trace_user_b.zip') }});
            await ctxB.close();
        }}
    }} finally {{
        await browser.close();
        fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
    }}
}}

run().catch(err => {{
    console.error('Browser runner fatal error:', err);
    try {{
        fs.writeFileSync(
            path.join('{ARTIFACTS_DIR}', 'browser_summary.json'),
            JSON.stringify({{ launched: false, error: err.message, steps: [] }}, null, 2)
        );
    }} catch (e) {{}}
    process.exit(1);
}});
"""
        with open(browser_script_path, "w", encoding="utf-8") as f:
            f.write(cjs_content)

        # Run with rtk node
        cmd = ["rtk", "node", browser_script_path]
        res, duration = self.run_cmd(cmd, cwd=PROJECT_ROOT, log_file=os.path.join(LOGS_DIR, "browser_runner.log"), timeout=75)

        if os.path.exists(browser_json_path):
            with open(browser_json_path, "r", encoding="utf-8") as f:
                b_data = json.load(f)
            self.results["browser_checks"] = b_data
            all_steps_ok = all(s.get("status") == "PASS" for s in b_data.get("steps", [])) and len(b_data.get("steps", [])) >= 5
            print(f"[+] Browser Playwright test completed ({b_data.get('mode')} mode, all steps pass: {all_steps_ok}).")
        else:
            print(f"[-] Browser test failed to write output. Exit code: {res.returncode}")
            self.results["browser_checks"] = {
                "launched": False,
                "exit_code": res.returncode,
                "error": res.stderr[:500]
            }
            self.results["defects"].append({
                "severity": "HIGH",
                "title": "Playwright browser test execution failed",
                "details": res.stderr[:500]
            })

    def generate_reports(self):
        print("\n=== Phase 5: Generating QA Reports ===")
        tc_pass = self.results.get("typecheck", {}).get("status") == "PASS"
        unit_tests = self.results.get("individual_tests", [])
        unit_count = len(unit_tests)
        unit_all_pass = (unit_count == 6) and all(x["status"] == "PASS" for x in unit_tests)

        api_tests = self.results.get("api_assertions", [])
        api_count = len(api_tests)
        api_all_pass = (api_count == 16) and all(x["status"] == "PASS" for x in api_tests)

        backend_alive = self.backend_proc is not None and self.backend_proc.poll() is None
        frontend_alive = self.frontend_proc is not None and self.frontend_proc.poll() is None
        fixture_alive = hasattr(self, 'fixture_proc') and self.fixture_proc is not None and self.fixture_proc.poll() is None
        listeners_alive = backend_alive and frontend_alive and fixture_alive

        browser_checks = self.results.get("browser_checks", {})
        browser_steps = browser_checks.get("steps", [])
        required_step_names = {"anon_view", "user_a_login", "user_b_login", "cross_tenant_browser_denied", "logout_flow"}
        executed_step_names = {s.get("name") for s in browser_steps}
        browser_steps_passed = (
            browser_checks.get("launched") is True
            and len(browser_steps) >= 5
            and required_step_names.issubset(executed_step_names)
            and all(s.get("status") == "PASS" for s in browser_steps)
        )

        if tc_pass and unit_all_pass and api_all_pass and browser_steps_passed and listeners_alive:
            self.results["verdict"] = "PASS"
        elif self.results.get("verdict") == "BLOCKED":
            pass
        elif not unit_all_pass or api_count < 16 or not browser_steps_passed:
            self.results["verdict"] = "PARTIAL"
        else:
            self.results["verdict"] = "FAIL"

        # 1. Write summary.json
        summary_path = os.path.join(ARTIFACTS_DIR, "summary.json")
        with open(summary_path, "w", encoding="utf-8") as f:
            json.dump(self.results, f, indent=2)
        print(f"[+] summary.json saved: {summary_path}")

        # 2. Write QA_LOCAL.md
        report_path = os.path.join(ARTIFACTS_DIR, "QA_LOCAL.md")

        screenshot_files = [f for f in sorted(os.listdir(SCREENSHOTS_DIR)) if f.endswith(".png")] if os.path.exists(SCREENSHOTS_DIR) else []
        trace_files = [f for f in sorted(os.listdir(TRACES_DIR)) if f.endswith(".zip")] if os.path.exists(TRACES_DIR) else []

        md_content = f"""# Independent QA Local Runtime Verification Report

- **Date:** {self.results['timestamp']}
- **Verdict:** **{self.results['verdict']}**
- **Test Mode:** Actual Runtime (Node v26 / Hono Backend / Nuxt Frontend / Chromium Browser)
- **Target Base URL:** `http://localhost:3013/storyvdo/`
- **Backend API:** `http://localhost:5679`
- **Synthetic Tora Upstream Fixture:** `http://127.0.0.1:{self.fixture_port}` (PID: {self.results.get('runtime', {}).get('fixture_tora', {}).get('pid', 'N/A')})

---

## 1. Summary of Execution

| Check Category | Result | Details |
|---|---|---|
| **Backend TypeScript Typecheck** | **{self.results.get('typecheck', {}).get('status', 'NOT RUN')}** | `tsc --noEmit` exit code {self.results.get('typecheck', {}).get('exit_code', -1)} |
| **Isolated Unit/Integration Tests** | **{'PASS' if unit_all_pass else ('PARTIAL' if unit_count > 0 else 'NOT RUN')}** | {unit_count}/6 test suites executed in isolated temp SQLite/data |
| **Backend Runtime Listener** | **{'PASS' if backend_alive else 'FAIL'}** | Port 5679, PID {self.results.get('runtime', {}).get('backend', {}).get('pid', 'N/A')} (Alive: {backend_alive}) |
| **Frontend Nuxt Dev Server** | **{'PASS' if frontend_alive else 'FAIL'}** | Port 3013, PID {self.results.get('runtime', {}).get('frontend', {}).get('pid', 'N/A')} (Alive: {frontend_alive}) |
| **Synthetic Upstream Fixture** | **{'PASS' if fixture_alive else 'FAIL'}** | Port {self.fixture_port}, PID {self.results.get('runtime', {}).get('fixture_tora', {}).get('pid', 'N/A')} (Alive: {fixture_alive}) |
| **Real API & Nuxt Proxy Matrix** | **{'PASS' if api_all_pass else ('PARTIAL' if api_count > 0 else 'NOT RUN')}** | {api_count}/16 contract & tenant checks executed |
| **Browser Playwright E2E** | **{'PASS' if browser_steps_passed else ('PARTIAL' if browser_steps else 'NOT RUN')}** | {len(browser_steps)} browser journey steps verified |

---

## 2. Unit & Integration Test Suites (Per File)

| Test File | Status | Exit Code | Duration | Tests / Pass / Fail |
|---|---|---|---|---|
"""
        if unit_tests:
            for t in unit_tests:
                counts = t.get("test_counts", {})
                c_str = f"{counts.get('tests')}/{counts.get('pass')}/{counts.get('fail')}"
                md_content += f"| `{t['file']}` | **{t['status']}** | {t['exit_code']} | {t['duration_ms']}ms | {c_str} |\n"
        else:
            md_content += "| *(None executed)* | - | - | - | - |\n"

        md_content += f"""
---

## 3. Real API Contract & Tenant Isolation Checks

| Check ID | Description | Status | Evidence |
|---|---|---|---|
"""
        if api_tests:
            for a in api_tests:
                md_content += f"| `{a['check_id']}` | {a['description']} | **{a['status']}** | {a['detail']} |\n"
        else:
            md_content += "| *(None executed)* | - | - | - |\n"

        md_content += f"""
---

## 4. Browser Playwright E2E Verification

- **Browser Launched:** {browser_checks.get('launched', False)} ({browser_checks.get('mode', 'N/A')} mode)
- **Executed Steps ({len(browser_steps)}):**
"""
        if browser_steps:
            for s in browser_steps:
                md_content += f"  - `{s.get('name')}`: **{s.get('status')}** ({s.get('details', s.get('error', ''))})\n"
        else:
            md_content += "  - *(None executed)*\n"

        md_content += f"""
- **Artifacts Captured ({len(screenshot_files)} screenshots, {len(trace_files)} traces):**
"""
        for sc in screenshot_files:
            md_content += f"  - Screenshot: `{sc}`\n"
        for tr in trace_files:
            md_content += f"  - Trace: `{tr}` (contains synthetic fixture sessions only)\n"

        md_content += f"""
---

## 5. Explicit QA Boundaries (NOT RUN)

The following areas were intentionally bounded and **NOT RUN** to guarantee safety and prevent accidental production side effects:
1. **Live Production Tora Authentication:** Verified via loopback synthetic fixture contract only. Fixture credits are explicitly synthetic.
2. **Real Payment / Credit Billing Transactions:** Tested via quota contracts; no real credit charges executed.
3. **Paid Video Rendering Workers:** GPU/Colab/R2 cloud worker calls not dispatched.
4. **Real MySQL Production Migration:** Isolated SQLite test DBs used; production data untouched.

---

## 6. Running Services & Process Control

Local child listeners left running on successful execution:
- Backend: PID `{self.results.get('runtime', {}).get('backend', {}).get('pid', 'N/A')}` on `http://localhost:5679`
- Frontend: PID `{self.results.get('runtime', {}).get('frontend', {}).get('pid', 'N/A')}` on `http://localhost:3013/storyvdo/`
- Synthetic Tora: PID `{self.results.get('runtime', {}).get('fixture_tora', {}).get('pid', 'N/A')}` on `http://127.0.0.1:{self.fixture_port}`

To stop all three processes when testing is finished:
```bash
kill {self.results.get('runtime', {}).get('backend', {}).get('pid', '')} {self.results.get('runtime', {}).get('frontend', {}).get('pid', '')} {self.results.get('runtime', {}).get('fixture_tora', {}).get('pid', '')}
```
"""
        with open(report_path, "w", encoding="utf-8") as f:
            f.write(md_content)
        print(f"[+] QA_LOCAL.md saved: {report_path}")

    def run_all(self, keep_alive: bool = True):
        try:
            self.start_fixture_server()
            self.run_phase_1_tests()
            ready = self.start_runtime_servers()
            if ready:
                self.run_phase_3_api_matrix()
                self.run_phase_4_browser_playwright()
        finally:
            self.generate_reports()
            if not keep_alive or self.results.get("verdict") in ("FAIL", "BLOCKED"):
                self._cleanup_own_process_groups()

    def _cleanup_own_process_groups(self):
        print("\n[*] Cleaning up own child process groups...")
        for proc, name in [
            (self.backend_proc, "backend"),
            (self.frontend_proc, "frontend"),
            (getattr(self, "fixture_proc", None), "fixture")
        ]:
            if proc and proc.poll() is None:
                try:
                    os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
                    print(f"[+] Terminated {name} process group (PID: {proc.pid})")
                except Exception:
                    try:
                        proc.terminate()
                    except Exception:
                        pass


if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "--fixture":
        port = int(sys.argv[2])
        server = HTTPServer(("127.0.0.1", port), SyntheticToraHandler)
        print(f"[Fixture] Serving on http://127.0.0.1:{port}", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
        sys.exit(0)

    runner = LocalQARunner()
    runner.run_all(keep_alive=True)
