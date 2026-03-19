"""자동 정리 + 재접속 타임아웃 핸들러"""
import asyncio
import time

from server.config import RECONNECT_TIMEOUT
from server.models import RoomStatus  # noqa: I001

STALE_EMPTY_TIMEOUT = 300
STALE_FINISHED_TIMEOUT = 600
CLEANUP_INTERVAL = 30


async def auto_cleanup(room_mgr, game_sessions: dict):
    """백그라운드: 30초 간격으로 stale room 삭제"""
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


async def cleanup_after_timeout(room_id: str, player_id: str, room_mgr, game_sessions: dict,
                                 broadcast_to_room_fn, send_to_player_fn):
    """재접속 타임아웃 대기 후 forfeit 처리"""
    await asyncio.sleep(RECONNECT_TIMEOUT)
    if room_mgr.is_player_disconnected(player_id):
        session = game_sessions.get(room_id)
        if session:
            from server.serializers import _card_to_dict
            game_result = session.remove_player(player_id)
            if game_result and game_result.get("type") == "gameOver":
                game_sessions.pop(room_id, None)
                room = room_mgr.get_room(room_id)
                if room:
                    room.status = RoomStatus.finished
                    await room_mgr.broadcast_lobby({
                        "type": "roomUpdated",
                        "payload": {"room": room_mgr.get_room_dict(room)},
                    })
                await broadcast_to_room_fn(room_id, {
                    "type": "gameOver",
                    "payload": game_result,
                })
            elif game_result and game_result.get("roundAdvanced"):
                conns = room_mgr.get_all_connections(room_id)
                for pid in conns:
                    ps = session.players.get(pid)
                    if ps and ps.in_fantasyland and ps.board.is_full():
                        await send_to_player_fn(room_id, pid, {
                            "type": "stateUpdate",
                            "payload": session.get_state(for_player=pid),
                        })
                    else:
                        cards = session.deal_cards(pid)
                        await send_to_player_fn(room_id, pid, {
                            "type": "dealCards",
                            "payload": {
                                "cards": [_card_to_dict(c) for c in cards],
                                "round": session.current_round,
                            },
                        })
                        await send_to_player_fn(room_id, pid, {
                            "type": "stateUpdate",
                            "payload": session.get_state(for_player=pid),
                        })
        room_mgr._force_remove_player(room_id, player_id)
        await broadcast_to_room_fn(room_id, {
            "type": "playerLeft",
            "payload": {"playerId": player_id, "reason": "timeout"},
        })
