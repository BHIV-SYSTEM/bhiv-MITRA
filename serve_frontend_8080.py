import http.server
import socket
import contextlib
import os
import sys
import time
import traceback
import subprocess
import mimetypes
import json
import re
import html
import urllib.request
import ssl

PORT = 8080
ROOT_DIR = os.path.abspath(os.path.dirname(__file__))
BUILD_DIR = os.path.abspath(os.path.join(ROOT_DIR, "frontend", "frontend", "build"))

def kill_port_occupants(port):
    """Ensure port 8080 is completely free from conflicting servers."""
    try:
        out = subprocess.check_output(f'netstat -ano | findstr :{port}', shell=True).decode()
        current_pid = str(os.getpid())
        pids = set()
        for line in out.strip().splitlines():
            parts = line.split()
            if len(parts) >= 5 and f":{port}" in parts[1]:
                pid = parts[-1]
                if pid != current_pid and pid != "0":
                    pids.add(pid)
        for pid in pids:
            try:
                subprocess.call(f'taskkill /F /PID {pid}', shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            except Exception:
                pass
    except Exception:
        pass

class SPAHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BUILD_DIR, **kwargs)

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_POST(self):
        req_path = self.path.split("?")[0].split("#")[0].lstrip("/\\")
        if req_path == "api/scrape":
            try:
                content_len = int(self.headers.get("Content-Length", 0))
                post_body = self.rfile.read(content_len).decode("utf-8")
                data = json.loads(post_body)
                target_url = data.get("url", "").strip()
                if not target_url:
                    self._send_json({"error": "url is required"}, 400)
                    return

                if not target_url.startswith("http://") and not target_url.startswith("https://"):
                    target_url = "https://" + target_url

                ssl_ctx = ssl.create_default_context()
                ssl_ctx.check_hostname = False
                ssl_ctx.verify_mode = ssl.CERT_NONE

                req = urllib.request.Request(
                    target_url,
                    headers={
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
                    }
                )
                with urllib.request.urlopen(req, context=ssl_ctx, timeout=10) as response:
                    raw_html = response.read().decode("utf-8", errors="ignore")

                # Parse title
                title_match = re.search(r"<title[^>]*>([^<]+)</title>", raw_html, re.I)
                title = title_match.group(1).strip() if title_match else target_url

                # Parse description
                desc_match = re.search(r'<meta[^>]*name=["\']description["\'][^>]*content=["\']([^"\']+)["\']', raw_html, re.I)
                if not desc_match:
                    desc_match = re.search(r'<meta[^>]*property=["\']og:description["\'][^>]*content=["\']([^"\']+)["\']', raw_html, re.I)
                desc = desc_match.group(1).strip() if desc_match else ""

                # Parse paragraphs
                p_matches = re.findall(r"<p[^>]*>([\s\S]*?)</p>", raw_html, re.I)
                clean_ps = []
                for p in p_matches:
                    clean_text = re.sub(r"<[^>]+>", " ", p)
                    clean_text = re.sub(r"\s+", " ", clean_text).strip()
                    if len(clean_text) > 40:
                        clean_ps.append(clean_text)
                    if len(clean_ps) >= 8:
                        break

                body_content = "\n\n".join(clean_ps) if clean_ps else desc or "Web page parsed successfully."

                self._send_json({
                    "status": "success",
                    "url": target_url,
                    "title": html.unescape(title),
                    "description": html.unescape(desc),
                    "content": html.unescape(body_content[:2500])
                }, 200)
            except Exception as e:
                self._send_json({"error": str(e)}, 500)
            return

        self.send_response(404)
        self.end_headers()

    def _send_json(self, data, status_code=200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        try:
            req_path = self.path.split("?")[0].split("#")[0].lstrip("/\\")

            # Prioritize live repo root for /src/ and /styles/ so chatbot updates are instant
            if req_path.startswith("src/") or req_path.startswith("src\\"):
                root_src_file = os.path.join(ROOT_DIR, os.path.normpath(req_path))
                if os.path.exists(root_src_file) and os.path.isfile(root_src_file):
                    return self._serve_direct_file(root_src_file, "application/javascript")

            if req_path.startswith("styles/") or req_path.startswith("styles\\"):
                root_style_file = os.path.join(ROOT_DIR, os.path.normpath(req_path))
                if os.path.exists(root_style_file) and os.path.isfile(root_style_file):
                    return self._serve_direct_file(root_style_file, "text/css")

            # If a real static file exists in build/, serve it directly
            local_path = os.path.normpath(os.path.join(BUILD_DIR, req_path))
            if os.path.exists(local_path) and os.path.isfile(local_path):
                return super().do_GET()

            # Handle clean URLs for privacy and terms
            if req_path.rstrip("/") in ["privacy", "privacy.html"]:
                privacy_file = os.path.join(BUILD_DIR, "privacy.html")
                if not os.path.exists(privacy_file):
                    privacy_file = os.path.join(ROOT_DIR, "privacy.html")
                if os.path.exists(privacy_file):
                    return self._serve_direct_file(privacy_file, "text/html; charset=utf-8")

            if req_path.rstrip("/") in ["terms", "terms.html"]:
                terms_file = os.path.join(BUILD_DIR, "terms.html")
                if not os.path.exists(terms_file):
                    terms_file = os.path.join(ROOT_DIR, "terms.html")
                if os.path.exists(terms_file):
                    return self._serve_direct_file(terms_file, "text/html; charset=utf-8")

            # For SPA client routes (like /auth/callback, /settings, /dashboard, /), serve build/index.html
            index_file = os.path.join(BUILD_DIR, "index.html")
            if os.path.exists(index_file):
                return self._serve_direct_file(index_file, "text/html; charset=utf-8")

            return super().do_GET()
        except (ConnectionResetError, BrokenPipeError, ConnectionAbortedError):
            pass
        except Exception as e:
            print(f"[SPAHandler Error] {e}")

    def _serve_direct_file(self, file_path, content_type):
        try:
            with open(file_path, "rb") as f:
                content = f.read()
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)
        except (ConnectionResetError, BrokenPipeError, ConnectionAbortedError):
            pass
        except Exception as e:
            print(f"[WARN] Failed serving {file_path}: {e}")

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        super().end_headers()

    def log_message(self, format, *args):
        # Clean logging that safely formats without IndexErrors
        try:
            msg = format % args if args else format
            sys.stdout.write(f"[PORT 8080] {msg}\n")
            sys.stdout.flush()
        except Exception:
            pass

if __name__ == "__main__":
    if not os.path.exists(BUILD_DIR):
        print(f"[ERROR] Build directory not found at: {BUILD_DIR}")
        print("Please run 'npm run build' inside frontend/frontend first.")
        sys.exit(1)

    try:
        kill_port_occupants(PORT)
    except Exception:
        pass

    http.server.ThreadingHTTPServer.allow_reuse_address = True
    server = http.server.ThreadingHTTPServer(("0.0.0.0", PORT), SPAHandler)
    server.daemon_threads = True

    print("====================================================")
    print(f"[READY] BHIV MITRA Frontend SPA Active on Port {PORT}")
    print(f"[READY] Open in Browser: http://localhost:{PORT}/")
    print(f"[READY] Build Directory: {BUILD_DIR}")
    print("====================================================")
    sys.stdout.flush()

    while True:
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\n[STOPPED] Frontend server stopped.")
            break
        except Exception as e:
            with open("server_crash.log", "a", encoding="utf-8") as f:
                f.write(f"RESTARTING: {traceback.format_exc()}\n")
            time.sleep(1)
