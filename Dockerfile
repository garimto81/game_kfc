FROM python:3.12-slim

WORKDIR /app

# 의존성 설치
COPY pyproject.toml ./
RUN pip install --no-cache-dir fastapi uvicorn[standard] websockets

# 소스 코드 복사
COPY src/ ./src/
COPY server/ ./server/
COPY web_build/ ./web_build/

# 환경 변수 기본값
ENV HOST=0.0.0.0
ENV PORT=8000
ENV ALLOWED_ORIGINS=*
ENV RECONNECT_TIMEOUT=60
ENV WS_HEARTBEAT_INTERVAL=25

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "server.main:app", "--host", "0.0.0.0", "--port", "8000"]
