"""本地预览服务器：所有响应禁用缓存，保证改动即时可见。

用法：python tools/preview_server.py <目录> [端口]
"""

from __future__ import annotations

import http.server
import os
import socketserver
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


def main() -> None:
    directory = sys.argv[1] if len(sys.argv) > 1 else '.'
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 4175
    os.chdir(directory)
    with socketserver.TCPServer(('127.0.0.1', port), NoCacheHandler) as httpd:
        print(f'preview server: http://127.0.0.1:{port} (no-cache)')
        httpd.serve_forever()


if __name__ == '__main__':
    main()
