import socket
import webbrowser
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import sys
import os

# Set UTF-8 encoding for console
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

PORT = 8200  # Dedicated port for Pokemon Math Game

# Change to the script's directory
os.chdir(os.path.dirname(os.path.abspath(__file__)))

# Detect Local IP (School Wi-Fi IP)
hostname = socket.gethostname()
try:
    ip = socket.gethostbyname(hostname)
except Exception:
    ip = "127.0.0.1"

# Check if port 8200 is available, if not find next
def get_free_port(start_port):
    for p in range(start_port, start_port + 20):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(('127.0.0.1', p)) != 0:
                return p
    return start_port

PORT = get_free_port(PORT)

print("\n" + "=" * 65)
print("  🎮 포켓몬 GO : 소수의 나눗셈 대모험 (실시간 학급 멀티플레이)")
print("=" * 65)
print(f"  [1] 교실 Wi-Fi 내부 IP : {ip}")
print(f"  [2] 전용 통신 포트     : {PORT}")
print(f"  [3] 학생 기기 접속 주소 : http://{ip}:{PORT}/index.html")
print(f"  [4] 칠판 화면(선생님용) : http://localhost:{PORT}/index.html")
print("=" * 65)
print("  ✔ [중요] 학생 스마트폰/태블릿도 교실 Wi-Fi에 연결되어 있어야 합니다.")
print("  ✔ 포켓몬 나눗셈 게임이 브라우저에서 자동으로 실행됩니다.")
print("  ✔ 수업을 마치실 때 이 검은 창을 닫아주시면 서버가 종료됩니다.")
print("=" * 65 + "\n")

# Open Browser with hostIp parameter
webbrowser.open(f"http://localhost:{PORT}/index.html?hostIp={ip}&port={PORT}")

# Multi-threaded HTTP Server Handler
class MyHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        super().end_headers()

    # Suppress verbose log spam in console
    def log_message(self, format, *args):
        # Only log student connections
        if "role=student" in args[0] or "GET /index.html" in args[0]:
            print(f"  [접속 감지] {self.client_address[0]} -> {args[0]}")

ThreadingHTTPServer.allow_reuse_address = True

try:
    with ThreadingHTTPServer(("", PORT), MyHandler) as httpd:
        httpd.serve_forever()
except KeyboardInterrupt:
    print("\n서버가 종료되었습니다.")
except Exception as e:
    print(f"\n[오류] 서버 실행 중 문제 발생: {e}")
    input("엔터 키를 누르면 종료합니다...")
