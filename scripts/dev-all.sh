#!/usr/bin/env bash
# 개발용: Go 서버(파일 SQLite + mock AI)와 expo 를 함께 띄운다. Ctrl+C 로 둘 다 종료.
#   사용: scripts/dev-all.sh            (PORT=8080 기본, 에뮬레이터)
#         API_HOST=192.168.0.10 scripts/dev-all.sh   (실기기: 폰이 접근할 PC 의 LAN IP)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-8080}"

# 폰이 접근할 주소 안내. WSL2 의 eth0 IP 는 Windows 밖(폰)에서 직접 닿지 않는다.
LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo "== 서버 주소 =="
echo "  에뮬레이터 : http://10.0.2.2:${PORT}"
echo "  실기기     : http://<PC의 LAN IP>:${PORT}  (API_HOST 로 지정하면 아래 EXPO_PUBLIC_API_URL 에 반영)"
if grep -qi microsoft /proc/version 2>/dev/null; then
  echo "  [WSL] 이 WSL 의 IP 는 ${LAN_IP} 이지만 폰에서는 안 닿는다. Windows(관리자 PowerShell)에서:"
  echo "    netsh interface portproxy add v4tov4 listenport=${PORT} listenaddress=0.0.0.0 connectport=${PORT} connectaddress=${LAN_IP}"
  echo "    New-NetFirewallRule -DisplayName fitdoing-api -Direction Inbound -Protocol TCP -LocalPort ${PORT} -Action Allow"
  echo "    그리고 API_HOST 에는 Windows 의 와이파이 IPv4 (ipconfig) 를 넣는다."
fi
if [ -n "${API_HOST:-}" ]; then
  export EXPO_PUBLIC_API_URL="http://${API_HOST}:${PORT}"
else
  export EXPO_PUBLIC_API_URL="${EXPO_PUBLIC_API_URL:-http://10.0.2.2:${PORT}}"
fi
echo "  EXPO_PUBLIC_API_URL=${EXPO_PUBLIC_API_URL}"

cd "$ROOT/server"
DB_URL="sqlite:${ROOT}/server/dev.db" AI_PROVIDER=mock PORT="$PORT" go run ./cmd/server &
SERVER_PID=$!
cleanup() { kill "$SERVER_PID" 2>/dev/null || true; wait "$SERVER_PID" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

cd "$ROOT/app"
npx expo start "$@"
