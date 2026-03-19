"""게임 WebSocket 핸들러"""
import asyncio
import time

from fastapi import WebSocket, WebSocketDisconnect

from server.config import WS_PING_TIMEOUT
from server.game_session import GameSession
from server.handlers.cleanup import cleanup_after_timeout
from server.models import RoomStatus
from server.serializers import _card_to_dict

# room_id → asyncio.Task 매핑 (턴 타이머)
_turn_timers: dict[str, asyncio.Task] = {}


async def _handle_confirm_result(result: dict, room_id: str, session: GameSession,
                                  room_mgr, game_sessions: dict,
                                  broadcast_to_room_fn, send_to_player_fn):
    """confirm_placement / auto_place_remaining 결과를 처리한다."""
    if result.get("type") == "gameOver":
        _cancel_turn_timer(room_id)
        room = room_mgr.get_room(room_id)
        if room:
            room.status = RoomStatus.finished
            await room_mgr.broadcast_lobby({
                "type": "roomUpdated",
                "payload": {"room": room_mgr.get_room_dict(room)},
            })
        await broadcast_to_room_fn(room_id, {
            "type": "gameOver",
            "payload": result,
        })
    elif result.get("type") == "nextHand":
        _cancel_turn_timer(room_id)
        await broadcast_to_room_fn(room_id, {
            "type": "handScored",
            "payload": result,
        })
        session._start_next_hand()

        for pid in session.active_pids:
            cards = session.deal_cards(pid)
            ps = session.players.get(pid)
            nh_payload = {
                "cards": [_card_to_dict(c) for c in cards],
                "round": session.current_round,
                "inFantasyland": ps.in_fantasyland if ps else False,
                "handNumber": session.hand_number,
            }
            if session.turn_deadline is not None:
                nh_payload["turnDeadline"] = session.turn_deadline
                nh_payload["turnTimeLimit"] = session.turn_time_limit
                nh_payload["serverTime"] = time.time()
            await send_to_player_fn(room_id, pid, {
                "type": "dealCards",
                "payload": nh_payload,
            })
            await send_to_player_fn(room_id, pid, {
                "type": "stateUpdate",
                "payload": session.get_state(for_player=pid),
            })

        for pid in session.folded_pids:
            await send_to_player_fn(room_id, pid, {
                "type": "foldedThisHand",
                "payload": {
                    "gameState": session.get_state(for_player=None),
                    "activePlayers": session.active_pids,
                    "foldedPlayers": session.folded_pids,
                },
            })
        _start_turn_timer(room_id, session, room_mgr, game_sessions,
                          broadcast_to_room_fn, send_to_player_fn)
    elif result.get("roundAdvanced"):
        _cancel_turn_timer(room_id)
        for pid in session.active_pids:
            ps = session.players.get(pid)
            if ps and ps.in_fantasyland and ps.board.is_full():
                await send_to_player_fn(room_id, pid, {
                    "type": "stateUpdate",
                    "payload": session.get_state(for_player=pid),
                })
            else:
                cards = session.deal_cards(pid)
                ra_payload = {
                    "cards": [_card_to_dict(c) for c in cards],
                    "round": session.current_round,
                }
                if session.turn_deadline is not None:
                    ra_payload["turnDeadline"] = session.turn_deadline
                    ra_payload["turnTimeLimit"] = session.turn_time_limit
                    ra_payload["serverTime"] = time.time()
                await send_to_player_fn(room_id, pid, {
                    "type": "dealCards",
                    "payload": ra_payload,
                })
                await send_to_player_fn(room_id, pid, {
                    "type": "stateUpdate",
                    "payload": session.get_state(for_player=pid),
                })

        for pid in session.folded_pids:
            await send_to_player_fn(room_id, pid, {
                "type": "foldedThisHand",
                "payload": {
                    "gameState": session.get_state(for_player=None),
                    "activePlayers": session.active_pids,
                    "foldedPlayers": session.folded_pids,
                },
            })
        _start_turn_timer(room_id, session, room_mgr, game_sessions,
                          broadcast_to_room_fn, send_to_player_fn)


def _start_turn_timer(room_id: str, session: GameSession,
                       room_mgr, game_sessions: dict,
                       broadcast_to_room_fn, send_to_player_fn):
    """턴 타이머를 시작한다. 기존 타이머가 있으면 취소."""
    _cancel_turn_timer(room_id)
    if session.turn_time_limit <= 0:
        return
    task = asyncio.create_task(
        _turn_timer_task(room_id, session, room_mgr, game_sessions,
                         broadcast_to_room_fn, send_to_player_fn)
    )
    _turn_timers[room_id] = task


def _cancel_turn_timer(room_id: str):
    """턴 타이머를 취소한다."""
    task = _turn_timers.pop(room_id, None)
    if task and not task.done():
        task.cancel()


async def _turn_timer_task(room_id: str, session: GameSession,
                            room_mgr, game_sessions: dict,
                            broadcast_to_room_fn, send_to_player_fn):
    """턴 타이머 — 만료 시 미확정 플레이어를 자동 배치."""
    try:
        await asyncio.sleep(session.turn_time_limit)
    except asyncio.CancelledError:
        return

    # 타이머 만료 — room_lock은 ws_game 바깥에서 관리하므로 여기서는 직접 처리
    # 미확정 플레이어 자동 배치
    from server.main import _room_lock
    async with _room_lock:
        if game_sessions.get(room_id) is not session:
            return  # 세션 교체됨

        last_result = None
        for pid in list(session.players.keys()):
            ps = session.players.get(pid)
            if ps and not ps.confirmed:
                result = session.auto_place_remaining(pid)
                if result:
                    last_result = result

        if last_result:
            await _handle_confirm_result(
                last_result, room_id, session, room_mgr, game_sessions,
                broadcast_to_room_fn, send_to_player_fn,
            )
        else:
            # 모든 플레이어 상태 업데이트 전송
            conns = room_mgr.get_all_connections(room_id)
            for pid in conns:
                await send_to_player_fn(room_id, pid, {
                    "type": "stateUpdate",
                    "payload": session.get_state(for_player=pid),
                })

    _turn_timers.pop(room_id, None)


async def websocket_game(websocket: WebSocket, room_id: str,
                          room_mgr, game_sessions: dict,
                          broadcast_to_room_fn, send_to_player_fn,
                          room_lock: asyncio.Lock):
    """게임 WebSocket 핸들러 (main.py에서 추출)"""
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
                break

            msg_type = data.get("type")
            payload = data.get("payload", {})

            needs_lock = msg_type in (
                "joinRequest", "placeCard", "discardCard",
                "confirmPlacement", "unplaceCard", "unDiscardCard", "leaveGame", "reconnect",
                "startGame",
            )
            if needs_lock:
                await room_lock.acquire()

            try:
                if msg_type == "joinRequest":
                    player_name = payload.get("playerName", "Unknown")
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
                        player_id, session_token = room_mgr.add_player(
                            room_id, player_name, websocket,
                        )
                    except ValueError as e:
                        await websocket.send_json({
                            "type": "error",
                            "payload": {"message": str(e)},
                        })
                        continue

                    await websocket.send_json({
                        "type": "joinAccepted",
                        "payload": {
                            "playerId": player_id,
                            "playerName": player_name,
                            "sessionToken": session_token,
                            "playerCount": len(room.players),
                            "hostId": room.host_id,
                            "players": room.players,
                        },
                    })

                    await broadcast_to_room_fn(room_id, {
                        "type": "playerJoined",
                        "payload": {
                            "playerName": player_name,
                            "playerCount": len(room.players),
                            "players": room.players,
                        },
                    }, exclude_pid=player_id)

                    await room_mgr.broadcast_lobby({
                        "type": "roomUpdated",
                        "payload": {"room": room_mgr.get_room_dict(room)},
                    })


                elif msg_type == "startGame":
                    room = room_mgr.get_room(room_id)
                    if not room or not player_id:
                        continue
                    if player_id != room.host_id:
                        await websocket.send_json({
                            "type": "error",
                            "payload": {"message": "Only host can start the game"},
                        })
                        continue
                    if len(room.players) < 2:
                        await websocket.send_json({
                            "type": "error",
                            "payload": {"message": "Need at least 2 players"},
                        })
                        continue
                    if room.status != RoomStatus.waiting:
                        await websocket.send_json({
                            "type": "error",
                            "payload": {"message": "Game already started"},
                        })
                        continue

                    room.status = RoomStatus.playing
                    conns = room_mgr.get_all_connections(room_id)
                    pids = list(conns.keys())
                    pnames = [conns[p]["name"] for p in pids]

                    session = GameSession(room_id, pids, pnames,
                                          turn_time_limit=room.turn_time_limit)
                    game_sessions[room_id] = session
                    state = session.start_game()

                    # gameStart to ALL connected players (active + folded get different data)
                    await broadcast_to_room_fn(room_id, {
                        "type": "gameStart",
                        "payload": state,
                    })

                    # Deal cards only to ACTIVE players
                    for pid in session.active_pids:
                        cards = session.deal_cards(pid)
                        ps = session.players.get(pid)
                        deal_payload = {
                            "cards": [_card_to_dict(c) for c in cards],
                            "round": session.current_round,
                            "inFantasyland": ps.in_fantasyland if ps else False,
                            "handNumber": session.hand_number,
                        }
                        if session.turn_deadline is not None:
                            deal_payload["turnDeadline"] = session.turn_deadline
                            deal_payload["turnTimeLimit"] = session.turn_time_limit
                            deal_payload["serverTime"] = time.time()
                        await send_to_player_fn(room_id, pid, {
                            "type": "dealCards",
                            "payload": deal_payload,
                        })

                    # Send state update to active players
                    for pid in session.active_pids:
                        await send_to_player_fn(room_id, pid, {
                            "type": "stateUpdate",
                            "payload": session.get_state(for_player=pid),
                        })

                    # Send foldedThisHand to folded players
                    for pid in session.folded_pids:
                        await send_to_player_fn(room_id, pid, {
                            "type": "foldedThisHand",
                            "payload": {
                                "gameState": session.get_state(for_player=None),
                                "activePlayers": session.active_pids,
                                "foldedPlayers": session.folded_pids,
                            },
                        })

                    # 턴 타이머 시작
                    _start_turn_timer(room_id, session, room_mgr, game_sessions,
                                      broadcast_to_room_fn, send_to_player_fn)

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
                        await websocket.send_json({
                            "type": "stateUpdate",
                            "payload": session.get_state(for_player=player_id),
                        })
                    else:
                        await websocket.send_json({
                            "type": "stateUpdate",
                            "payload": session.get_state(for_player=player_id),
                        })
                        conns = room_mgr.get_all_connections(room_id)
                        for pid in conns:
                            if pid != player_id:
                                await send_to_player_fn(room_id, pid, {
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
                    elif result.get("type") or result.get("roundAdvanced"):
                        # all_confirmed → 타이머 취소 + 결과 처리
                        await _handle_confirm_result(
                            result, room_id, session, room_mgr, game_sessions,
                            broadcast_to_room_fn, send_to_player_fn,
                        )
                    else:
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
                        await broadcast_to_room_fn(reconn_room_id, {
                            "type": "playerReconnected",
                            "payload": {"playerName": player_name, "playerId": player_id},
                        }, exclude_pid=player_id)
                        session = game_sessions.get(reconn_room_id)
                        if session:
                            is_folded = player_id in session.folded_pids
                            ps = session.players.get(player_id)
                            await websocket.send_json({
                                "type": "reconnected",
                                "payload": {
                                    "playerId": player_id,
                                    "playerName": player_name,
                                    "gameState": session.get_state(for_player=player_id),
                                },
                            })
                            if is_folded:
                                # 폴드 플레이어: 관전 모드 복원
                                await websocket.send_json({
                                    "type": "foldedThisHand",
                                    "payload": {
                                        "gameState": session.get_state(for_player=None),
                                        "activePlayers": session.active_pids,
                                        "foldedPlayers": session.folded_pids,
                                    },
                                })
                            elif ps and ps.hand:
                                rc_payload = {
                                    "cards": [_card_to_dict(c) for c in ps.hand],
                                    "round": session.current_round,
                                }
                                if session.turn_deadline is not None:
                                    rc_payload["turnDeadline"] = session.turn_deadline
                                    rc_payload["turnTimeLimit"] = session.turn_time_limit
                                    rc_payload["serverTime"] = time.time()
                                await websocket.send_json({
                                    "type": "dealCards",
                                    "payload": rc_payload,
                                })
                        else:
                            await websocket.send_json({
                                "type": "reconnected",
                                "payload": {"playerId": player_id, "playerName": player_name},
                            })

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
                        conns = room_mgr.get_all_connections(room_id)
                        for pid in conns:
                            if pid != player_id:
                                await send_to_player_fn(room_id, pid, {
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

                elif msg_type == "leaveGame":
                    if player_id:
                        room = room_mgr.get_room(room_id)
                        if room:
                            session = game_sessions.get(room_id)
                            if session:
                                game_result = session.remove_player(player_id)
                                has_result = game_result and (
                                    game_result.get("type") or game_result.get("roundAdvanced"))
                                if has_result:
                                    await _handle_confirm_result(
                                        game_result, room_id, session, room_mgr, game_sessions,
                                        broadcast_to_room_fn, send_to_player_fn,
                                    )
                            room_mgr._force_remove_player(room_id, player_id)
                            updated_room_after_leave = room_mgr.get_room(room_id)
                            if updated_room_after_leave and updated_room_after_leave.host_id:
                                await broadcast_to_room_fn(room_id, {
                                    "type": "hostChanged",
                                    "payload": {"hostId": updated_room_after_leave.host_id},
                                })
                            await broadcast_to_room_fn(room_id, {
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
                try:
                    await websocket.send_json({
                        "type": "error",
                        "payload": {"message": f"Server error: {str(e)}"},
                    })
                except Exception:
                    break
            finally:
                if needs_lock and room_lock.locked():
                    room_lock.release()

    except WebSocketDisconnect:
        pass
    finally:
        if player_id and room_mgr.get_room(room_id):
            room_mgr.remove_player(room_id, player_id)
            await broadcast_to_room_fn(room_id, {
                "type": "playerDisconnected",
                "payload": {"playerId": player_id},
            })
            asyncio.create_task(cleanup_after_timeout(
                room_id, player_id, room_mgr, game_sessions,
                broadcast_to_room_fn, send_to_player_fn,
            ))
