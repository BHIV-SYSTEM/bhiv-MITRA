import http.server
import socket
import contextlib
import os
import sys

PORT = 8080
BUILD_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "frontend", "frontend", "build"))

class SPAHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BUILD_DIR, **kwargs)

    def do_GET(self):
        # Extract path without query parameters or hash
        req_path = self.path.split("?")[0].split("#")[0]
        local_path = os.path.normpath(os.path.join(BUILD_DIR, req_path.lstrip("/\\")))

        # If a real static file exists, serve it directly
        if os.path.exists(local_path) and os.path.isfile(local_path):
            return super().do_GET()

        # Handle clean URLs for privacy and terms
        if req_path.rstrip("/") in ["/privacy", "/privacy.html"]:
            privacy_file = os.path.join(BUILD_DIR, "privacy.html")
            if os.path.exists(privacy_file):
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                with open(privacy_file, "rb") as f:
                    content = f.read()
                self.send_header("Content-Length", str(len(content)))
                self.end_headers()
                self.wfile.write(content)
                return

        if req_path.rstrip("/") in ["/terms", "/terms.html"]:
            terms_file = os.path.join(BUILD_DIR, "terms.html")
            if os.path.exists(terms_file):
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                with open(terms_file, "rb") as f:
                    content = f.read()
                self.send_header("Content-Length", str(len(content)))
                self.end_headers()
                self.wfile.write(content)
                return

        # For SPA client routes (like /auth/callback, /settings, /dashboard), serve index.html
        index_file = os.path.join(BUILD_DIR, "index.html")
        if os.path.exists(index_file):
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Cache-Control", "no-cache")
            with open(index_file, "rb") as f:
                content = f.read()
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)
            return

        return super().do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        super().end_headers()

class DualStackServer(http.server.ThreadingHTTPServer):
    def server_bind(self):
        with contextlib.suppress(Exception):
            self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        super().server_bind()

if __name__ == "__main__":
    if not os.path.exists(BUILD_DIR):
        print(f"[ERROR] Build directory not found at: {BUILD_DIR}")
        print("Please run 'npm run build' inside frontend/frontend first.")
        sys.exit(1)

    print(f"[STARTING] Serving Raj MITRA SPA on http://localhost:{PORT}")
    print(f"[SOURCE] Build directory: {BUILD_DIR}")
    server = DualStackServer(("", PORT), SPAHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[STOPPED] Frontend server stopped.")
