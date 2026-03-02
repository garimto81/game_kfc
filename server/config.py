import os

# 환경변수로부터 서버 설정을 로드한다
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",")
WS_HEARTBEAT_INTERVAL = int(os.getenv("WS_HEARTBEAT_INTERVAL", "25"))
WS_PING_TIMEOUT = int(os.getenv("WS_PING_TIMEOUT", "60"))
RECONNECT_TIMEOUT = int(os.getenv("RECONNECT_TIMEOUT", "60"))
