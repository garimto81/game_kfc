# Online Deployment PRD

## 개요
- **목적**: game_kfc_pro를 인터넷에서 외부 접속 가능하게 배포
- **배경**: Docker 기반 빌드/실행 환경은 구현 완료. 외부 노출 인프라만 추가 필요
- **범위**: Cloudflare Tunnel (즉시 테스트) + Oracle Cloud Free Tier (상시 운영)

## 요구사항

### 기능 요구사항
1. 외부 인터넷에서 HTTPS URL로 게임 접속 가능
2. WebSocket (WSS) 기반 실시간 멀티플레이어 동작
3. 로컬 PC 기반 즉시 배포 (Cloudflare Tunnel)
4. 클라우드 기반 상시 운영 (Oracle Cloud Free Tier)
5. SSL/TLS 자동 발급 및 갱신 (Let's Encrypt)

### 비기능 요구사항
1. 무료 운영 (월 $0)
2. 배포 스크립트 1회 실행으로 완료
3. 기존 docker-compose.yml 호환성 유지

## 구현 상태

| 항목 | 상태 | 비고 |
|------|------|------|
| Docker 빌드 (Flutter Web + Node.js) | 완료 | Dockerfile, server/Dockerfile |
| Nginx 리버스 프록시 | 완료 | nginx.conf |
| docker-compose 개발용 | 완료 | docker-compose.yml |
| Cloudflare Tunnel 스크립트 | 예정 | deploy-tunnel.sh |
| 프로덕션 docker-compose | 예정 | docker-compose.prod.yml |
| SSL nginx 설정 | 예정 | nginx.conf 수정 |
| 배포 스크립트 | 예정 | setup.sh, deploy.sh |

## Changelog

| 날짜 | 버전 | 변경 내용 | 변경 유형 | 결정 근거 |
|------|------|-----------|----------|----------|
| 2026-03-25 | v1.0 | 최초 작성 | - | - |
