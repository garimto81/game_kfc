# Node.js Alpine 기반 OFC Pineapple 게임 서버
FROM node:20-alpine

# better-sqlite3 네이티브 빌드 의존성
RUN apk add --no-cache python3 make g++

WORKDIR /app

# 의존성 설치
COPY package.json package-lock.json* ./
RUN npm ci --production

# 소스 복사
COPY . .

# HIGH-5: non-root 사용자로 실행
RUN addgroup -S app && adduser -S app -G app \
    && mkdir -p /app/data \
    && chown -R app:app /app/data

# 포트 노출
EXPOSE 3000

# 헬스체크
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/rooms || exit 1

USER app

# 서버 실행
CMD ["node", "index.js"]
