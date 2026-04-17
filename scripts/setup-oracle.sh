#!/usr/bin/env bash
# Oracle Cloud ARM 프리티어 VM 초기 셋업
# Ubuntu 22.04 ARM (Always Free VM.Standard.A1.Flex)
#
# 전제:
#   - Oracle Cloud 계정 + ARM 프리티어 인스턴스 프로비저닝 완료
#   - SSH로 ubuntu@<public-ip> 접속 완료
#   - 도메인 A 레코드가 VM public IP로 설정됨 (또는 Cloudflare Tunnel 사용)
#
# Usage:
#   curl -sL https://raw.githubusercontent.com/garimto81/game_kfc/master/scripts/setup-oracle.sh | bash -s -- ofc.example.com
#   # 또는 로컬 clone 후
#   ./scripts/setup-oracle.sh ofc.example.com
#
# 근거 PRD: docs/00-prd/prd-deployment.prd.md (F4 Oracle Cloud 상시 운영)

set -euo pipefail

DOMAIN="${1:-}"
[[ -z "$DOMAIN" ]] && { echo "Usage: $0 <domain>"; exit 1; }

REPO_URL="https://github.com/garimto81/game_kfc.git"
APP_DIR="/opt/game_kfc"

echo "[1/7] 시스템 업데이트 + 필수 도구 설치"
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg git ufw openssl

echo "[2/7] Docker + docker-compose-plugin 설치"
if ! command -v docker >/dev/null; then
  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  sudo chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
  sudo apt-get update
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  sudo usermod -aG docker "$USER"
fi

echo "[3/7] 방화벽 (UFW) 설정 — 22/80/443"
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
yes | sudo ufw enable

echo "[3b/7] Oracle Cloud Security List 경고"
cat <<EOF
  !! Oracle Cloud 콘솔에서 VCN Security List에도 80/443 TCP ingress 규칙 추가 필요.
     (Networking > Virtual Cloud Networks > [your VCN] > Security Lists > Ingress Rules)
EOF

echo "[4/7] 저장소 클론 → $APP_DIR"
sudo mkdir -p "$APP_DIR"
sudo chown "$USER":"$USER" "$APP_DIR"
if [[ ! -d "$APP_DIR/.git" ]]; then
  git clone "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"
git fetch origin
git checkout master || git checkout feat/app-deployment
git pull

echo "[5/7] .env 파일 생성 (JWT_SECRET 자동 생성)"
if [[ ! -f "$APP_DIR/.env" ]]; then
  JWT_SECRET=$(openssl rand -hex 32)
  cat > "$APP_DIR/.env" <<EOF
NODE_ENV=production
PORT=3000
JWT_SECRET=$JWT_SECRET
DB_PATH=/app/data/ofc.db
CORS_ORIGIN=https://$DOMAIN
DOMAIN=$DOMAIN
EOF
  chmod 600 "$APP_DIR/.env"
fi

echo "[6/7] Let's Encrypt 초기 인증서 발급 (standalone)"
if [[ ! -d "/etc/letsencrypt/live/$DOMAIN" ]]; then
  sudo docker run --rm \
    -p 80:80 \
    -v /etc/letsencrypt:/etc/letsencrypt \
    certbot/certbot certonly --standalone --non-interactive --agree-tos \
      --email "admin@$DOMAIN" -d "$DOMAIN" || {
        echo "[WARN] 인증서 발급 실패. DNS A 레코드가 이 VM IP를 가리키는지 확인하세요."
        echo "       Cloudflare Tunnel 사용 시 이 단계 스킵 가능."
      }
fi

echo "[7/7] docker-compose.prod.yml 기동"
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

echo ""
echo "=== 셋업 완료 ==="
echo "  URL: https://$DOMAIN"
echo "  로그: docker compose logs -f game-server"
echo "  .env: $APP_DIR/.env (JWT_SECRET 백업 권장)"
echo ""
echo "systemd 자동 시작 등록 (선택):"
cat <<EOF
  sudo tee /etc/systemd/system/game-kfc.service <<SVC
[Unit]
Description=Game KFC Pro
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
ExecStop=/usr/bin/docker compose -f docker-compose.yml -f docker-compose.prod.yml down

[Install]
WantedBy=multi-user.target
SVC
  sudo systemctl enable game-kfc
EOF
