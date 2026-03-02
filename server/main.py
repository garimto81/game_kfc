import asyncio
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from server.config import ALLOWED_ORIGINS, HOST, PORT, RECONNECT_TIMEOUT, WS_HEARTBEAT_INTERVAL, WS_PING_TIMEOUT
from server.game_session import GameSession, _card_to_dict
from server.models import CreateRoomRequest, RoomStatus
from server.room_manager import RoomManager

_cleanup_task: asyncio.Task | None = None

STALE_EMPTY_TIMEOUT = 300  # 빈 방 5분
STALE_FINISHED_TIMEOUT = 600  # 완료 방 10분
CLEANUP_INTERVAL = 30  # 30초 간격

# Change 7: Module-level lock for room operations
_room_lock = asyncio.Lock()


async def auto_cleanup():
    """백그라운드: 30초 간격으로 stale room을 삭제한다."""
    while True:
        await asyncio.sleep(CLEANUP_INTERVAL)
        now = time.time()
        to_delete: list[str] = []
        for room_id, room in list(room_mgr.rooms.items()):
            age = now - room.created_at
            if not room.players and age >= STALE_EMPTY_TIMEOUT:
                to_delete.append(room_id)
            elif room.status == RoomStatus.finished and age >= STALE_FINISHED_TIMEOUT:
                to_delete.append(room_id)
        for room_id in to_delete:
            room_mgr.delete_room(room_id)
            game_sessions.pop(room_id, None)
            await room_mgr.broadcast_lobby({
                "type": "roomDeleted",
                "payload": {"roomId": room_id},
            })


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _cleanup_task
    _cleanup_task = asyncio.create_task(auto_cleanup())
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

# Flutter Web 정적 파일 경로
WEB_DIR = Path(__file__).resolve().parent.parent / "web_build"

room_mgr = RoomManager()
# room_id → GameSession
game_sessions: dict[str, GameSession] = {}


# ── REST API ──────────────────────────────────────────

@app.get("/api/status")
def status():
    rooms = room_mgr.list_rooms()
    return {
        "name": "OFC Pineapple Online Server",
        "status": "running",
        "rooms": len(rooms),
    }


@app.get("/api/rooms")
def list_rooms():
    rooms = room_mgr.list_rooms()
    return [r.model_dump() for r in rooms]


@app.post("/api/rooms")
async def create_room(req: CreateRoomRequest):
    room = room_mgr.create_room(req.name, req.max_players)
    await room_mgr.broadcast_lobby({
        "type": "roomCreated",
        "payload": {"room": room_mgr.get_room_dict(room)},
    })
    return room.model_dump()


@app.delete("/api/rooms/{room_id}")
async def delete_room(room_id: str):
    if room_mgr.delete_room(room_id):
        game_sessions.pop(room_id, None)
        await room_mgr.broadcast_lobby({
            "type": "roomDeleted",
            "payload": {"roomId": room_id},
        })
        return {"deleted": True}
    return {"deleted": False, "error": "Room not found"}


# ── WebSocket ─────────────────────────────────────────

async def broadcast_to_room(room_id: str, message: dict, exclude_pid: str | None = None):
    """방의 모든 연결에 메시지를 브로드캐스트한다."""
    conns = room_mgr.get_all_connections(room_id)
    for pid, info in conns.items():
        if pid == exclude_pid:
            continue
        try:
            await info["ws"].send_json(message)
        except Exception:
            pass  # WebSocket disconnect handler manages cleanup


async def send_to_player(room_id: str, player_id: str, message: dict):
    """특정 플레이어에게 메시지를 전송한다."""
    ws = room_mgr.get_player_ws(room_id, player_id)
    if ws:
        try:
            await ws.send_json(message)
        except Exception:
            pass


@app.websocket("/ws/lobby")
async def websocket_lobby(websocket: WebSocket):
    await websocket.accept()
    room_mgr.add_lobby_listener(websocket)
    try:
        # 초기 방 목록 전송
        rooms = room_mgr.list_rooms()
        await websocket.send_json({
            "type": "roomList",
            "payload": {"rooms": [room_mgr.get_room_dict(r) for r in rooms]},
        })
        # heartbeat loop + 메시지 수신 대기
        while True:
            try:
                data = await asyncio.wait_for(
                    websocket.receive_json(),
                    timeout=WS_HEARTBEAT_INTERVAL,
                )
                # 클라이언트 메시지 처리 (heartbeat 등)
                if data.get("type") == "heartbeat":
                    await websocket.send_json({"type": "heartbeat", "payload": {}})
            except asyncio.TimeoutError:
                # heartbeat 전송
                await websocket.send_json({"type": "heartbeat", "payload": {}})
    except (WebSocketDisconnect, Exception):
        pass
    finally:
        room_mgr.remove_lobby_listener(websocket)


@app.websocket("/ws/game/{room_id}")
async def websocket_game(websocket: WebSocket, room_id: str):
    await websocket.accept()

    room = room_mgr.get_room(room_id)
    if room is None:
        await websocket.send_json({"type": "error", "payload": {"message": "Room not found"}})
        await websocket.close()
        return

    player_id: str | None = None

    try:
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_json(), timeout=WS_PING_TIMEOUT)
            except asyncio.TimeoutError:
                break  # ghost connection — exit message loop
            msg_type = data.get("type")
            payload = data.get("payload", {})

            # A3: room lock for state-changing handlers
            needs_lock = msg_type in (
                "joinRequest", "placeCard", "discardCard",
                "confirmPlacement", "unplaceCard", "unDiscardCard", "leaveGame", "reconnect",
            )
            if needs_lock:
                await _room_lock.acquire()

            # Change 5: Broad try/except for message processing
            try:
                if msg_type == "joinRequest":
                    player_name = payload.get("playerName", "Unknown")
                    # A6: playerName 검증
                    player_name = player_name.strip()
                    if not player_name:
                        await websocket.send_json({
                            "type": "error",
                            "payload": {"message": "Player name cannot be empty"},
                        })
                        continue
                    if len(player_name) > 20:
                        await websocket.send_json({
                            "type": "error",
                            "payload": {"message": "Player name too long (max 20 chars)"},
                        })
                        continue
                    room = room_mgr.get_room(room_id)
                    if room is None:
                        await websocket.send_json({
                            "type": "error",
                            "payload": {"message": "Room not found"},
                        })
                        continue

                    if len(room.players) >= room.max_players:
                        await websocket.send_json({
                            "type": "error",
                            "payload": {"message": "Room is full"},
                        })
                        continue

                    try:
                        player_id, session_token = room_mgr.add_player(room_id, player_name, websocket)
                    except ValueError as e:
                        await websocket.send_json({
                            "type": "error",
                            "payload": {"message": str(e)},
                        })
                        continue

                    # Change 14: Add playerCount to joinAccepted
                    await websocket.send_json({
                        "type": "joinAccepted",
                        "payload": {
                            "playerId": player_id,
                            "playerName": player_name,
                            "sessionToken": session_token,
                            "playerCount": len(room.players),
                        },
                    })

                    # 다른 플레이어에게 알림
                    await broadcast_to_room(room_id, {
                        "type": "playerJoined",
                        "payload": {"playerName": player_name, "playerCount": len(room.players)},
                    }, exclude_pid=player_id)

                    # 로비에 roomUpdated 브로드캐스트
                    await room_mgr.broadcast_lobby({
                        "type": "roomUpdated",
                        "payload": {"room": room_mgr.get_room_dict(room)},
                    })

                    # 모든 플레이어 참가 시 자동 게임 시작
                    room = room_mgr.get_room(room_id)
                    if room and len(room.players) >= room.max_players:
                        room.status = RoomStatus.playing
                        conns = room_mgr.get_all_connections(room_id)
                        pids = list(conns.keys())
                        pnames = [conns[p]["name"] for p in pids]

                        session = GameSession(room_id, pids, pnames)
                        game_sessions[room_id] = session
                        state = session.start_game()

                        await broadcast_to_room(room_id, {
                            "type": "gameStart",
                            "payload": state,
                        })

                        # 각 플레이어에게 초기 카드 딜링
                        for pid in pids:
                            cards = session.deal_cards(pid)
                            ps = session.players.get(pid)
                            await send_to_player(room_id, pid, {
                                "type": "dealCards",
                                "payload": {
                                    "cards": [_card_to_dict(c) for c in cards],
                                    "round": session.current_round,
                                    "inFantasyland": ps.in_fantasyland if ps else False,
                                    "handNumber": session.hand_number,
                                },
                            })

                        # 상태 업데이트 브로드캐스트 (각 플레이어 뷰)
                        for pid in pids:
                            await send_to_player(room_id, pid, {
                                "type": "stateUpdate",
                                "payload": session.get_state(for_player=pid),
                            })

                        # 로비에 roomUpdated (status=playing) 브로드캐스트
                        await room_mgr.broadcast_lobby({
                            "type": "roomUpdated",
                            "payload": {"room": room_mgr.get_room_dict(room)},
                        })

                elif msg_type == "placeCard":
                    session = game_sessions.get(room_id)
                    if not session or not player_id:
                        await websocket.send_json({
                            "type": "error",
                            "payload": {"message": "No active game"},
                        })
                        continue

                    card_data = payload.get("card", {})
                    line = payload.get("line", "")
                    result = session.place_card(player_id, card_data, line)
                    if result is None:
                        await websocket.send_json({
                            "type": "error",
                            "payload": {"message": "Invalid card placement"},
                        })
                        # Change 13: Send stateUpdate after placeCard error
                        await websocket.send_json({
                            "type": "stateUpdate",
                            "payload": session.get_state(for_player=player_id),
                        })
                    else:
                        # 자신에게 상태 업데이트
                        await websocket.send_json({
                            "type": "stateUpdate",
                            "payload": session.get_state(for_player=player_id),
                        })
                        # 상대에게도 상태 업데이트 (상대 핸드 숨김)
                        conns = room_mgr.get_all_connections(room_id)
                        for pid in conns:
                            if pid != player_id:
                                await send_to_player(room_id, pid, {
                                    "type": "stateUpdate",
                                    "payload": session.get_state(for_player=pid),
                                })

                elif msg_type == "discardCard":
                    session = game_sessions.get(room_id)
                    if not session or not player_id:
                        await websocket.send_json({
                            "type": "error",
                            "payload": {"message": "No active game"},
                        })
                        continue

                    card_data = payload.get("card", {})
                    result = session.discard_card(player_id, card_data)
                    if result is None:
                        await websocket.send_json({
                            "type": "error",
                            "payload": {"message": "Invalid discard"},
                        })
                        # A4: Send stateUpdate after discardCard error for sync
                        await websocket.send_json({
                            "type": "stateUpdate",
                            "payload": session.get_state(for_player=player_id),
                        })
                    else:
                        await websocket.send_json({
                            "type": "stateUpdate",
                            "payload": session.get_state(for_player=player_id),
                        })

                elif msg_type == "confirmPlacement":
                    session = game_sessions.get(room_id)
                    if not session or not player_id:
                        await websocket.send_json({
                            "type": "error",
                            "payload": {"message": "No active game"},
                        })
                        continue

                    result = session.confirm_placement(player_id)
                    if "error" in result:
                        await websocket.send_json({
                            "type": "error",
                            "payload": {"message": result["error"]},
                        })
                    elif result.get("type") == "gameOver":
                        # 게임 종료
                        room = room_mgr.get_room(room_id)
                        if room:
                            room.status = RoomStatus.finished
                            await room_mgr.broadcast_lobby({
                                "type": "roomUpdated",
                                "payload": {"room": room_mgr.get_room_dict(room)},
                            })
                        await broadcast_to_room(room_id, {
                            "type": "gameOver",
                            "payload": result,
                        })
                    elif result.get("type") == "nextHand":
                        # 핸드 점수 broadcast → 새 핸드 시작
                        await broadcast_to_room(room_id, {
                            "type": "handScored",
                            "payload": result,
                        })
                        session._start_next_hand()
                        # 각 플레이어에게 딜링
                        conns = room_mgr.get_all_connections(room_id)
                        for pid in conns:
                            cards = session.deal_cards(pid)
                            ps = session.players.get(pid)
                            await send_to_player(room_id, pid, {
                                "type": "dealCards",
                                "payload": {
                                    "cards": [_card_to_dict(c) for c in cards],
                                    "round": session.current_round,
                                    "inFantasyland": ps.in_fantasyland if ps else False,
                                    "handNumber": session.hand_number,
                                },
                            })
                            await send_to_player(room_id, pid, {
                                "type": "stateUpdate",
                                "payload": session.get_state(for_player=pid),
                            })
                    elif result.get("roundAdvanced"):
                        # 다음 라운드 → 각 플레이어에게 카드 딜링
                        conns = room_mgr.get_all_connections(room_id)
                        for pid in conns:
                            ps = session.players.get(pid)
                            if ps and ps.in_fantasyland and ps.hand:
                                # FL 플레이어는 이미 카드를 보유 — 딜링 스킵
                                await send_to_player(room_id, pid, {
                                    "type": "stateUpdate",
                                    "payload": session.get_state(for_player=pid),
                                })
                            else:
                                cards = session.deal_cards(pid)
                                await send_to_player(room_id, pid, {
                                    "type": "dealCards",
                                    "payload": {
                                        "cards": [_card_to_dict(c) for c in cards],
                                        "round": session.current_round,
                                    },
                                })
                                await send_to_player(room_id, pid, {
                                    "type": "stateUpdate",
                                    "payload": session.get_state(for_player=pid),
                                })
                    else:
                        # 아직 확정 대기 중인 플레이어 있음
                        await websocket.send_json({
                            "type": "stateUpdate",
                            "payload": session.get_state(for_player=player_id),
                        })

                elif msg_type == "reconnect":
                    token = payload.get("sessionToken", "")
                    result = room_mgr.reconnect_player(token, websocket)
                    if result is None:
                        await websocket.send_json({
                            "type": "error",
                            "payload": {"message": "Invalid session token or session expired"},
                        })
                    else:
                        player_id, reconn_room_id, player_name = result
                        room_id = reconn_room_id
                        # 다른 플레이어에게 재접속 알림
                        await broadcast_to_room(reconn_room_id, {
                            "type": "playerReconnected",
                            "payload": {"playerName": player_name, "playerId": player_id},
                        }, exclude_pid=player_id)
                        # 현재 게임 상태 전송
                        session = game_sessions.get(reconn_room_id)
                        if session:
                            ps = session.players.get(player_id)
                            await websocket.send_json({
                                "type": "reconnected",
                                "payload": {
                                    "playerId": player_id,
                                    "playerName": player_name,
                                    "gameState": session.get_state(for_player=player_id),
                                },
                            })
                            # Change 12: Re-send hand cards if player has them
                            if ps and ps.hand:
                                await websocket.send_json({
                                    "type": "dealCards",
                                    "payload": {
                                        "cards": [_card_to_dict(c) for c in ps.hand],
                                        "round": session.current_round,
                                    },
                                })
                        else:
                            await websocket.send_json({
                                "type": "reconnected",
                                "payload": {"playerId": player_id, "playerName": player_name},
                            })

                # Change 18: unplaceCard WS handler
                elif msg_type == "unplaceCard":
                    session = game_sessions.get(room_id)
                    if not session or not player_id:
                        await websocket.send_json({
                            "type": "error",
                            "payload": {"message": "No active game"},
                        })
                        continue

                    card_data = payload.get("card", {})
                    line = payload.get("line", "")
                    result = session.unplace_card(player_id, card_data, line)
                    if result is None:
                        await websocket.send_json({
                            "type": "error",
                            "payload": {"message": "Cannot undo this card"},
                        })
                    else:
                        await websocket.send_json({
                            "type": "stateUpdate",
                            "payload": session.get_state(for_player=player_id),
                        })
                        # Notify others
                        conns = room_mgr.get_all_connections(room_id)
                        for pid in conns:
                            if pid != player_id:
                                await send_to_player(room_id, pid, {
                                    "type": "stateUpdate",
                                    "payload": session.get_state(for_player=pid),
                                })

                elif msg_type == "unDiscardCard":
                    session = game_sessions.get(room_id)
                    if not session or not player_id:
                        await websocket.send_json({
                            "type": "error",
                            "payload": {"message": "No active game"},
                        })
                        continue

                    card_data = payload.get("card", {})
                    result = session.undiscard_card(player_id, card_data)
                    if result is None:
                        await websocket.send_json({
                            "type": "error",
                            "payload": {"message": "Cannot undo this discard"},
                        })
                    else:
                        await websocket.send_json({
                            "type": "stateUpdate",
                            "payload": session.get_state(for_player=player_id),
                        })

                # Change 19: leaveGame handler
                elif msg_type == "leaveGame":
                    if player_id:
                        room = room_mgr.get_room(room_id)
                        if room:
                            # A1: GameSession에서 플레이어 제거 → 자동 승리 판정
                            session = game_sessions.get(room_id)
                            if session:
                                game_result = session.remove_player(player_id)
                                if game_result and game_result.get("type") == "gameOver":
                                    room.status = RoomStatus.finished
                                    await broadcast_to_room(room_id, {
                                        "type": "gameOver",
                                        "payload": game_result,
                                    })
                                    await room_mgr.broadcast_lobby({
                                        "type": "roomUpdated",
                                        "payload": {"room": room_mgr.get_room_dict(room)},
                                    })
                            room_mgr._force_remove_player(room_id, player_id)
                            await broadcast_to_room(room_id, {
                                "type": "playerLeft",
                                "payload": {"playerId": player_id, "reason": "left"},
                            })
                            updated_room = room_mgr.get_room(room_id)
                            if updated_room:
                                await room_mgr.broadcast_lobby({
                                    "type": "roomUpdated",
                                    "payload": {"room": room_mgr.get_room_dict(updated_room)},
                                })
                            else:
                                await room_mgr.broadcast_lobby({
                                    "type": "roomDeleted",
                                    "payload": {"roomId": room_id},
                                })
                    await websocket.close()
                    return

                elif msg_type == "heartbeat":
                    await websocket.send_json({"type": "heartbeat", "payload": {}})

                else:
                    await websocket.send_json({
                        "type": "error",
                        "payload": {"message": f"Unknown message type: {msg_type}"},
                    })

            except Exception as e:
                # Change 5: Catch all exceptions to keep connection alive
                try:
                    await websocket.send_json({
                        "type": "error",
                        "payload": {"message": f"Server error: {str(e)}"},
                    })
                except Exception:
                    break  # WebSocket dead → exit message loop
            finally:
                # A3: Release room lock if acquired
                if needs_lock and _room_lock.locked():
                    _room_lock.release()

    except WebSocketDisconnect:
        pass  # handled in finally
    finally:
        # Common cleanup for both break and WebSocketDisconnect
        if player_id and room_mgr.get_room(room_id):
            room_mgr.remove_player(room_id, player_id)
            await broadcast_to_room(room_id, {
                "type": "playerDisconnected",
                "payload": {"playerId": player_id},
            })
            asyncio.create_task(_cleanup_after_timeout(room_id, player_id))


# Change 11: Targeted cleanup (only remove specific player)
async def _cleanup_after_timeout(room_id: str, player_id: str):
    """재접속 타임아웃 대기 후, 여전히 disconnected이면 forfeit 처리한다."""
    await asyncio.sleep(RECONNECT_TIMEOUT)
    if room_mgr.is_player_disconnected(player_id):
        # A1: GameSession에서 플레이어 제거 → 자동 승리 판정
        session = game_sessions.get(room_id)
        if session:
            game_result = session.remove_player(player_id)
            if game_result and game_result.get("type") == "gameOver":
                game_sessions.pop(room_id, None)  # 메모리 정리
                room = room_mgr.get_room(room_id)
                if room:
                    room.status = RoomStatus.finished
                    await room_mgr.broadcast_lobby({
                        "type": "roomUpdated",
                        "payload": {"room": room_mgr.get_room_dict(room)},
                    })
                await broadcast_to_room(room_id, {
                    "type": "gameOver",
                    "payload": game_result,
                })
        room_mgr._force_remove_player(room_id, player_id)
        await broadcast_to_room(room_id, {
            "type": "playerLeft",
            "payload": {"playerId": player_id, "reason": "timeout"},
        })


# ── Flutter Web 정적 파일 서빙 ─────────────────────────

if WEB_DIR.exists():
    app.mount("/assets", StaticFiles(directory=WEB_DIR / "assets"), name="assets")
    app.mount("/canvaskit", StaticFiles(directory=WEB_DIR / "canvaskit"), name="canvaskit")
    app.mount("/icons", StaticFiles(directory=WEB_DIR / "icons"), name="icons")

    # Change 21: SPA catch-all fix - don't serve SPA for /api/ paths
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # Don't serve SPA for API routes
        if full_path.startswith("api/"):
            from fastapi.responses import JSONResponse
            return JSONResponse(status_code=404, content={"detail": "Not found"})
        file_path = WEB_DIR / full_path
        if full_path and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(WEB_DIR / "index.html")
