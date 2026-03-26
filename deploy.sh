#!/bin/bash
# 반복 배포 스크립트 (코드 업데이트 시 실행)
# 사용법: bash deploy.sh

set -e

echo "=== Game KFC Pro — Deploy ==="

# .env 로드
if [ -f .env ]; then
    source .env
else
    echo ".env 파일이 없습니다. setup.sh를 먼저 실행하세요."
    exit 1
fi

# 1. 코드 업데이트
echo "[1/4] 코드 업데이트..."
git pull origin main 2>/dev/null || git pull origin master 2>/dev/null || echo "  git pull 스킵 (수동 업로드)"

# 2. 빌드
echo "[2/4] Docker 빌드..."
docker compose -f docker-compose.prod.yml build

# 3. 재시작
echo "[3/4] 서비스 재시작..."
docker compose -f docker-compose.prod.yml up -d

# 4. Health check
echo "[4/4] Health check..."
sleep 5
if curl -sf http://localhost:3000/api/rooms > /dev/null 2>&1; then
    echo "  game-server: OK"
else
    echo "  game-server: FAIL"
    docker compose -f docker-compose.prod.yml logs game-server --tail=20
    exit 1
fi

if [ -n "$DOMAIN" ]; then
    if curl -sf "https://$DOMAIN" > /dev/null 2>&1; then
        echo "  web (HTTPS): OK"
    else
        echo "  web (HTTPS): FAIL (DNS/SSL 확인 필요)"
    fi
fi

echo ""
echo "=== 배포 완료 ==="
echo "접속: https://${DOMAIN:-localhost}"
