#!/bin/bash
# Cloudflare Tunnel — 로컬 docker-compose를 외부에 즉시 노출
# 사용법: docker compose up -d && bash deploy-tunnel.sh

set -e

PORT=${1:-9090}

echo "=== Cloudflare Quick Tunnel ==="
echo "로컬 localhost:$PORT → 외부 HTTPS URL"
echo ""

# cloudflared 존재 확인
if ! command -v cloudflared &> /dev/null; then
    echo "cloudflared가 설치되어 있지 않습니다."
    echo ""
    echo "설치 방법:"
    echo "  Windows: winget install cloudflare.cloudflared"
    echo "  macOS:   brew install cloudflared"
    echo "  Linux:   curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared && chmod +x /usr/local/bin/cloudflared"
    exit 1
fi

# docker-compose 실행 확인
if ! curl -sf http://localhost:$PORT > /dev/null 2>&1; then
    echo "localhost:$PORT 에 응답이 없습니다."
    echo "먼저 docker compose up -d 를 실행하세요."
    exit 1
fi

echo "터널을 시작합니다... (Ctrl+C로 종료)"
echo "출력되는 URL을 공유하면 외부에서 접속 가능합니다."
echo ""

cloudflared tunnel --url http://localhost:$PORT
