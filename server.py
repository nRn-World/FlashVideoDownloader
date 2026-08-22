# Localhost HTTP Server for Flash Video Downloader (with RFC 7233 Range Request Support)
import http.server
import socketserver
import os
import re
import mimetypes
import sys

PORT = 3000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class RangeRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_GET(self):
        # Default root to test_player.html
        if self.path == '/' or self.path == '/index.html':
            self.path = '/test_player.html'
        
        path = self.translate_path(self.path)
        if not os.path.isfile(path):
            return super().do_GET()

        range_header = self.headers.get('Range')
        if not range_header:
            return super().do_GET()

        size = os.path.getsize(path)
        range_match = re.match(r'bytes=(\d+)-(\d*)', range_header)
        if not range_match:
            return super().do_GET()

        first_byte, last_byte = range_match.groups()
        first_byte = int(first_byte)
        last_byte = int(last_byte) if last_byte else size - 1

        if first_byte >= size:
            self.send_error(416, 'Requested Range Not Satisfiable')
            return

        length = last_byte - first_byte + 1
        content_type, _ = mimetypes.guess_type(path)
        content_type = content_type or 'application/octet-stream'

        self.send_response(206)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Range', f'bytes {first_byte}-{last_byte}/{size}')
        self.send_header('Content-Length', str(length))
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()

        with open(path, 'rb') as f:
            f.seek(first_byte)
            chunk_size = 64 * 1024
            bytes_left = length
            while bytes_left > 0:
                read_amount = min(chunk_size, bytes_left)
                data = f.read(read_amount)
                if not data:
                    break
                try:
                    self.wfile.write(data)
                except (BrokenPipeError, ConnectionResetError):
                    break
                bytes_left -= len(data)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()

class ThreadingHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True

if __name__ == '__main__':
    handler = RangeRequestHandler
    socketserver.TCPServer.allow_reuse_address = True
    try:
        with ThreadingHTTPServer(('127.0.0.1', PORT), handler) as httpd:
            print(f"==================================================")
            print(f" Flash Video Downloader - Local Test Server Ready ")
            print(f" Server running at: http://localhost:{PORT}")
            print(f" Direct Player:     http://localhost:{PORT}/test_player.html")
            print(f"==================================================")
            sys.stdout.flush()
            httpd.serve_forever()
    except Exception as e:
        print(f"Error starting server: {e}")
