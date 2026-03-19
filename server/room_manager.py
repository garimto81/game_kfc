import time
import uuid

from fastapi import WebSocket

from server.models import Room, RoomStatus


class RoomManager:
    """인메모리 방 관리"""

    def __init__(self):
        self.rooms: dict[str, Room] = {}
        # room_id → {player_id: {"name": str, "ws": WebSocket}}
        self._connections: dict[str, dict[str, dict]] = {}
        # token → {"room_id": str, "player_id": str, "name": str}
        self._session_tokens: dict[str, dict] = {}
        # player_id → {"room_id": str, "name": str, "disconnect_time": float}
        self._disconnected: dict[str, dict] = {}
        # 로비 WebSocket 리스너 목록
        self._lobby_listeners: list[WebSocket] = []

    def create_room(self, name: str, max_players: int = 6, turn_time_limit: int = 0) -> Room:
        room_id = uuid.uuid4().hex[:8]
        room = Room(id=room_id, name=name, max_players=max_players, turn_time_limit=turn_time_limit)
        self.rooms[room_id] = room
        self._connections[room_id] = {}
        return room

    def list_rooms(self) -> list[Room]:
        return list(self.rooms.values())

    def get_room(self, room_id: str) -> Room | None:
        return self.rooms.get(room_id)

    def delete_room(self, room_id: str) -> bool:
        if room_id in self.rooms:
            # Clean up session tokens for this room
            tokens_to_remove = [
                t for t, v in self._session_tokens.items()
                if v["room_id"] == room_id
            ]
            for t in tokens_to_remove:
                del self._session_tokens[t]
            # Clean up disconnected players for this room
            pids_to_remove = [
                pid for pid, info in self._disconnected.items()
                if info["room_id"] == room_id
            ]
            for pid in pids_to_remove:
                del self._disconnected[pid]
            del self.rooms[room_id]
            self._connections.pop(room_id, None)
            return True
        return False

    def add_player(self, room_id: str, player_name: str, websocket: WebSocket) -> tuple[str, str]:
        """방에 플레이어를 추가하고 (player_id, session_token) 튜플을 반환한다."""
        room = self.rooms.get(room_id)
        if room is None:
            raise ValueError(f"Room {room_id} not found")
        if room.status != RoomStatus.waiting:
            raise ValueError(f"Room {room_id} is not accepting players (status: {room.status})")
        if len(room.players) >= room.max_players:
            raise ValueError(f"Room {room_id} is full")
        player_id = uuid.uuid4().hex[:8]
        session_token = uuid.uuid4().hex
        room.players.append(player_name)
        if room.host_id is None:
            room.host_id = player_id
        self._connections[room_id][player_id] = {
            "name": player_name,
            "ws": websocket,
        }
        self._session_tokens[session_token] = {
            "room_id": room_id,
            "player_id": player_id,
            "name": player_name,
        }
        return player_id, session_token

    def remove_player(self, room_id: str, player_id: str) -> None:
        """플레이어를 즉시 제거하지 않고 disconnected 상태로 전환한다."""
        room = self.rooms.get(room_id)
        if room is None:
            return
        conn = self._connections.get(room_id, {})
        info = conn.get(player_id)
        if info:
            self._disconnected[player_id] = {
                "room_id": room_id,
                "name": info["name"],
                "disconnect_time": time.time(),
            }

    def _force_remove_player(self, room_id: str, player_id: str) -> None:
        """플레이어를 완전히 제거한다 (타임아웃 만료 시 호출)."""
        room = self.rooms.get(room_id)
        if room is None:
            return
        conn = self._connections.get(room_id, {})
        info = conn.pop(player_id, None)
        if info and info["name"] in room.players:
            room.players.remove(info["name"])
        self._disconnected.pop(player_id, None)
        # Host transfer if needed
        if room and room.host_id == player_id:
            conn = self._connections.get(room_id, {})
            if conn:
                room.host_id = next(iter(conn))
            else:
                room.host_id = None
        # 세션 토큰 정리
        tokens_to_remove = [
            t for t, v in self._session_tokens.items()
            if v["player_id"] == player_id
        ]
        for t in tokens_to_remove:
            del self._session_tokens[t]
        # 방이 비면 삭제
        if room and not room.players:
            self.delete_room(room_id)

    def get_player_ws(self, room_id: str, player_id: str) -> WebSocket | None:
        conn = self._connections.get(room_id, {})
        info = conn.get(player_id)
        return info["ws"] if info else None

    def get_all_connections(self, room_id: str) -> dict[str, dict]:
        """room_id에 연결된 모든 {player_id: {"name", "ws"}} 반환"""
        return self._connections.get(room_id, {})

    def get_player_id_by_ws(self, room_id: str, websocket: WebSocket) -> str | None:
        """WebSocket으로 player_id 역조회"""
        for pid, info in self._connections.get(room_id, {}).items():
            if info["ws"] is websocket:
                return pid
        return None

    def reconnect_player(self, token: str, websocket: WebSocket) -> tuple[str, str, str] | None:
        """세션 토큰으로 재접속을 시도한다. 성공 시 (player_id, room_id, player_name) 반환."""
        token_info = self._session_tokens.get(token)
        if token_info is None:
            return None
        player_id = token_info["player_id"]
        room_id = token_info["room_id"]
        player_name = token_info["name"]
        if player_id not in self._disconnected:
            return None
        # WebSocket 참조 업데이트
        conn = self._connections.get(room_id, {})
        if player_id in conn:
            conn[player_id]["ws"] = websocket
        # disconnected 상태 해제
        self._disconnected.pop(player_id, None)
        return player_id, room_id, player_name

    def is_player_disconnected(self, player_id: str) -> bool:
        """플레이어가 disconnected 상태인지 확인한다."""
        return player_id in self._disconnected

    def cleanup_expired(self, timeout: int) -> list[tuple[str, str]]:
        """타임아웃이 만료된 disconnected 플레이어를 완전 제거한다."""
        now = time.time()
        expired: list[tuple[str, str]] = []
        for pid, info in list(self._disconnected.items()):
            if now - info["disconnect_time"] >= timeout:
                expired.append((info["room_id"], pid))
        for room_id, pid in expired:
            self._force_remove_player(room_id, pid)
        return expired

    # ── Lobby Broadcast ───────────────────────────────

    def add_lobby_listener(self, ws: WebSocket) -> None:
        """로비 WebSocket 리스너를 등록한다."""
        self._lobby_listeners.append(ws)

    def remove_lobby_listener(self, ws: WebSocket) -> None:
        """로비 WebSocket 리스너를 제거한다."""
        try:
            self._lobby_listeners.remove(ws)
        except ValueError:
            pass

    async def broadcast_lobby(self, message: dict) -> None:
        """모든 로비 리스너에 메시지를 전송한다. 실패한 연결은 자동 제거."""
        broken: list[WebSocket] = []
        for ws in self._lobby_listeners:
            try:
                await ws.send_json(message)
            except Exception:
                broken.append(ws)
        for ws in broken:
            self.remove_lobby_listener(ws)

    def get_room_dict(self, room: Room) -> dict:
        """Room을 dict로 변환한다 (created_at 포함)."""
        d = room.model_dump()
        d["playerCount"] = len(room.players)
        d["maxPlayers"] = room.max_players
        d["turnTimeLimit"] = room.turn_time_limit
        return d
