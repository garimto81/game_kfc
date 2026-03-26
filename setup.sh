#!/bin/bash
# Oracle Cloud Free Tier 초기 설정 스크립트
# 사용법: ssh user@server 'bash -s' < setup.sh

set -e

echo "=== Game KFC Pro — Server Setup ==="

# 1. Docker 설치
if ! command -v docker &> /dev/null; then
    echo "[1/5] Docker 설치..."
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker $USER
    echo "Docker 설치 완료. 재로그인 후 다시 실행하세요."
    exit 0
else
    echo "[1/5] Docker 이미 설치됨"
fi

# 2. 방화벽 설정
echo "[2/5] 방화벽 설정..."
sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT 2>/dev/null || true
sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null || true
# Oracle Cloud의 경우 Security List에서도 80, 443 포트 열어야 함
echo "  포트 80, 443 허용"

# 3. 프로젝트 클론
if [ ! -d "game_kfc_pro" ]; then
    echo "[3/5] 프로젝트 클론..."
    git clone https://github.com/garimto81/claude.git game_kfc_pro || {
        echo "git clone 실패. 수동으로 코드를 업로드하세요."
    }
else
    echo "[3/5] 프로젝트 이미 존재"
fi

# 4. .env 설정
echo "[4/5] 환경변수 설정..."
if [ ! -f "game_kfc_pro/.env" ]; then
    read -p "도메인 입력 (예: ofc.example.com): " DOMAIN
    cat > game_kfc_pro/.env << EOF
DOMAIN=$DOMAIN
NODE_ENV=production
PORT=3000
CORS_ORIGIN=https://$DOMAIN
EOF
    echo "  .env 생성 완료"
else
    echo "  .env 이미 존재"
    source game_kfc_pro/.env
fi

cd game_kfc_pro

# 5. 초기 SSL 발급
echo "[5/5] SSL 인증서 발급..."

# nginx-init.conf로 HTTP 서버 먼저 기동
docker compose -f docker-compose.prod.yml build
# nginx.conf를 임시로 nginx-init.conf로 교체
docker compose -f docker-compose.prod.yml up -d web game-server

echo "  HTTP 서버 시작 대기 (10초)..."
sleep 10

# certbot으로 인증서 발급
DOMAIN=${DOMAIN:-$(grep DOMAIN .env | cut -d= -f2)}
docker run --rm \
    -v certbot-conf:/etc/letsencrypt \
    -v certbot-www:/var/www/certbot \
    certbot/certbot certonly \
    --webroot --webroot-path=/var/www/certbot \
    --agree-tos --no-eff-email \
    -d "$DOMAIN" \
    --email "admin@$DOMAIN" || {
    echo "SSL 발급 실패. 도메인 DNS가 이 서버 IP를 가리키는지 확인하세요."
    echo "수동 발급: deploy.sh 참조"
    exit 1
}

# 심볼릭 링크: /etc/letsencrypt/live/{domain} → default
docker run --rm -v certbot-conf:/etc/letsencrypt alpine \
    sh -c "ln -sfn /etc/letsencrypt/live/$DOMAIN /etc/letsencrypt/live/default"

# nginx SSL 설정으로 재시작
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d

echo ""
echo "=== 설정 완료 ==="
echo "접속: https://$DOMAIN"
echo ""
