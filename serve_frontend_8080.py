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
        return super().server_bind()

if __name__ == "__main__":
    DualStackServer.allow_reuse_address = True
    DualStackServer.address_family = socket.AF_INET6
    try:
        with DualStackServer(("", PORT), SPAHandler) as httpd:
            print(f"Raj MITRA Frontend SPA running on http://localhost:{PORT}")
            httpd.serve_forever()
    except Exception:
        DualStackServer.address_family = socket.AF_INET
        with DualStackServer(("", PORT), SPAHandler) as httpd:
            print(f"Raj MITRA Frontend SPA running on http://localhost:{PORT}")
            httpd.serve_forever()
