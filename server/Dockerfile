# Node.js Alpine 기반 OFC Pineapple 게임 서버
FROM node:20-alpine

WORKDIR /app

# 의존성 설치
COPY package.json package-lock.json* ./
RUN npm ci --production

# 소스 복사
COPY . .

# 포트 노출
EXPOSE 3000

# 헬스체크
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/rooms || exit 1

# 서버 실행
CMD ["node", "index.js"]
