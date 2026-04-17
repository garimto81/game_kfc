#!/usr/bin/env bash
# Cloudflare Tunnel 배포 스크립트 — 3가지 모드 지원
#
# 모드:
#   1. quick        - 계정 불필요, *.trycloudflare.com (임시 테스트)
#   2. named        - 계정 필요, 고정 도메인 (프로덕션 권장)
#   3. named-create - 신규 named tunnel 생성 + DNS 라우팅
#
# 전제:
#   - docker-compose 기동 후 포트 9090 활성
#   - cloudflared CLI 설치 (https://github.com/cloudflare/cloudflared/releases)
#
# Usage:
#   ./scripts/deploy-tunnel.sh quick
#   ./scripts/deploy-tunnel.sh named <tunnel-name>
#   ./scripts/deploy-tunnel.sh named-create <tunnel-name> <hostname>
#
# 근거 PRD: docs/00-prd/prd-deployment.prd.md (F3/F4/F5)

set -euo pipefail

MODE="${1:-quick}"
TUNNEL_NAME="${2:-}"
HOSTNAME="${3:-}"

LOCAL_URL="http://localhost:9090"
LOG_FILE="${LOG_FILE:-/tmp/cloudflared-game-kfc.log}"

check_prerequisites() {
  command -v cloudflared >/dev/null || {
    echo "[FATAL] cloudflared 설치 필요: https://github.com/cloudflare/cloudflared/releases"
    exit 1
  }
  curl -sf "$LOCAL_URL/api/rooms" >/dev/null 2>&1 || {
    echo "[FATAL] localhost:9090 서버 미기동. docker-compose up -d 먼저 실행"
    exit 1
  }
}

run_quick() {
  echo "[INFO] Quick Tunnel 시작 (임시 URL, uptime 보장 없음)"
  echo "[INFO] 로그: $LOG_FILE"
  cloudflared tunnel --url "$LOCAL_URL" --no-autoupdate 2>&1 | tee "$LOG_FILE" | grep --line-buffered "trycloudflare.com\|ERR"
}

run_named() {
  [[ -z "$TUNNEL_NAME" ]] && { echo "[FATAL] tunnel 이름 필요: $0 named <tunnel-name>"; exit 1; }
  echo "[INFO] Named Tunnel 시작: $TUNNEL_NAME"
  cloudflared tunnel --no-autoupdate run "$TUNNEL_NAME" 2>&1 | tee "$LOG_FILE"
}

create_named() {
  [[ -z "$TUNNEL_NAME" || -z "$HOSTNAME" ]] && {
    echo "[FATAL] 인자 필요: $0 named-create <tunnel-name> <hostname>"
    echo "  예: $0 named-create game-kfc-prod ofc.example.com"
    exit 1
  }

  echo "[STEP 1/4] Cloudflare 로그인 (브라우저 OAuth)"
  cloudflared tunnel login

  echo "[STEP 2/4] Tunnel 생성: $TUNNEL_NAME"
  cloudflared tunnel create "$TUNNEL_NAME"

  echo "[STEP 3/4] DNS 라우팅 설정: $HOSTNAME → $TUNNEL_NAME"
  cloudflared tunnel route dns "$TUNNEL_NAME" "$HOSTNAME"

  CONFIG_DIR="$HOME/.cloudflared"
  CONFIG_FILE="$CONFIG_DIR/config.yml"
  TUNNEL_ID=$(cloudflared tunnel list --output json | \
    node -e 'const t=JSON.parse(require("fs").readFileSync(0,"utf8")).find(x=>x.name===process.argv[1]);console.log(t?t.id:"")' "$TUNNEL_NAME")
  [[ -z "$TUNNEL_ID" ]] && { echo "[FATAL] tunnel ID 조회 실패"; exit 1; }

  echo "[STEP 4/4] 설정 파일 생성: $CONFIG_FILE"
  cat > "$CONFIG_FILE" <<EOF
tunnel: $TUNNEL_ID
credentials-file: $CONFIG_DIR/$TUNNEL_ID.json

ingress:
  - hostname: $HOSTNAME
    service: $LOCAL_URL
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s
  - service: http_status:404
EOF

  echo ""
  echo "[DONE] Named tunnel 설정 완료."
  echo "  Tunnel: $TUNNEL_NAME ($TUNNEL_ID)"
  echo "  Hostname: https://$HOSTNAME"
  echo ""
  echo "기동 명령:"
  echo "  $0 named $TUNNEL_NAME"
  echo ""
  echo "systemd 서비스 등록 (Linux):"
  echo "  sudo cloudflared service install"
}

case "$MODE" in
  quick)         check_prerequisites; run_quick ;;
  named)         check_prerequisites; run_named ;;
  named-create)  create_named ;;
  *)
    echo "Unknown mode: $MODE"
    echo "Usage: $0 {quick|named|named-create} [tunnel-name] [hostname]"
    exit 1
    ;;
esac
