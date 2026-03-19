"""REST API 핸들러"""
from fastapi import FastAPI

from server.models import CreateRoomRequest, RoomStatus
from server.room_manager import RoomManager


def register_rest_routes(app: FastAPI, room_mgr: RoomManager, game_sessions: dict):
    """REST API 라우트를 app에 등록한다."""

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
        return [room_mgr.get_room_dict(r) for r in rooms]

    @app.post("/api/rooms")
    async def create_room(req: CreateRoomRequest):
        room = room_mgr.create_room(req.name, req.max_players, req.turn_time_limit)
        await room_mgr.broadcast_lobby({
            "type": "roomCreated",
            "payload": {"room": room_mgr.get_room_dict(room)},
        })
        return room.model_dump()

    @app.post("/api/quickmatch")
    async def quickmatch():
        """대기 방 배정. 없으면 자동 생성."""
        rooms = room_mgr.list_rooms()
        for room in rooms:
            if room.status == RoomStatus.waiting and len(room.players) < room.max_players:
                return {"roomId": room.id}
        # 대기 방 없으면 새로 생성
        new_room = room_mgr.create_room("Quick Match")
        await room_mgr.broadcast_lobby({
            "type": "roomCreated",
            "payload": {"room": room_mgr.get_room_dict(new_room)},
        })
        return {"roomId": new_room.id}

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
