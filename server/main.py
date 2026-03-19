import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from server.config import ALLOWED_ORIGINS
from server.game_session import GameSession
from server.handlers.cleanup import auto_cleanup
from server.handlers.rest import register_rest_routes
from server.handlers.ws_game import websocket_game as _websocket_game
from server.handlers.ws_lobby import websocket_lobby as _websocket_lobby
from server.room_manager import RoomManager

_cleanup_task: asyncio.Task | None = None
_room_lock = asyncio.Lock()

room_mgr = RoomManager()
game_sessions: dict[str, GameSession] = {}


async def broadcast_to_room(room_id: str, message: dict, exclude_pid: str | None = None):
    """방의 모든 연결에 메시지를 브로드캐스트한다."""
    conns = room_mgr.get_all_connections(room_id)
    for pid, info in conns.items():
        if pid == exclude_pid:
            continue
        try:
            await info["ws"].send_json(message)
        except Exception:
            pass


async def send_to_player(room_id: str, player_id: str, message: dict):
    """특정 플레이어에게 메시지를 전송한다."""
    ws = room_mgr.get_player_ws(room_id, player_id)
    if ws:
        try:
            await ws.send_json(message)
        except Exception:
            pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _cleanup_task
    _cleanup_task = asyncio.create_task(auto_cleanup(room_mgr, game_sessions))
    yield
    _cleanup_task.cancel()
    try:
        await _cleanup_task
    except asyncio.CancelledError:
        pass


app = FastAPI(title="OFC Pineapple Online Server", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

WEB_DIR = Path(__file__).resolve().parent.parent / "web_build"

register_rest_routes(app, room_mgr, game_sessions)


@app.websocket("/ws/lobby")
async def ws_lobby(ws: WebSocket):
    await _websocket_lobby(ws, room_mgr)


@app.websocket("/ws/game/{room_id}")
async def ws_game(ws: WebSocket, room_id: str):
    await _websocket_game(ws, room_id, room_mgr, game_sessions,
                           broadcast_to_room, send_to_player, _room_lock)


# Flutter Web 정적 파일 서빙
if WEB_DIR.exists():
    app.mount("/assets", StaticFiles(directory=WEB_DIR / "assets"), name="assets")
    app.mount("/canvaskit", StaticFiles(directory=WEB_DIR / "canvaskit"), name="canvaskit")
    app.mount("/icons", StaticFiles(directory=WEB_DIR / "icons"), name="icons")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path.startswith("api/"):
            from fastapi.responses import JSONResponse
            return JSONResponse(status_code=404, content={"detail": "Not found"})
        file_path = WEB_DIR / full_path
        if full_path and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(WEB_DIR / "index.html")
