"""Local dev server for the game: like `python -m http.server`, but with caching disabled so edits show up on reload.

Run from this folder:  python serve.py   (then open http://localhost:8000)
"""
import http.server
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


# threaded, because a browser preconnect that sends nothing would otherwise block every other request
with http.server.ThreadingHTTPServer(("127.0.0.1", PORT), NoCacheHandler) as httpd:
    print(f"Serving on http://localhost:{PORT}")
    httpd.serve_forever()
