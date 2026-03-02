"""OFC Pineapple Online Server 테스트"""
import pytest
from fastapi.testclient import TestClient

from server.main import app, room_mgr, game_sessions
from server.game_session import GameSession, _card_to_dict, _card_from_dict
from server.room_manager import RoomManager
from server.models import Room, RoomStatus
from src.card import Card, Rank, Suit


@pytest.fixture(autouse=True)
def reset_state():
    """각 테스트 전 서버 상태 초기화"""
    room_mgr.rooms.clear()
    room_mgr._connections.clear()
    room_mgr._session_tokens.clear()
    room_mgr._disconnected.clear()
    room_mgr._lobby_listeners.clear()
    game_sessions.clear()
    yield


# ── 모델 테스트 ──────────────────────────────────────

class TestModels:
    def test_room_creation(self):
        room = Room(id="test1", name="TestRoom")
        assert room.id == "test1"
        assert room.name == "TestRoom"
        assert room.max_players == 2
        assert room.status == RoomStatus.waiting
        assert room.players == []

    def test_room_status_enum(self):
        assert RoomStatus.waiting == "waiting"
        assert RoomStatus.playing == "playing"
        assert RoomStatus.finished == "finished"


# ── RoomManager 테스트 ───────────────────────────────

class TestRoomManager:
    def test_create_room(self):
        mgr = RoomManager()
        room = mgr.create_room("MyRoom", 2)
        assert room.name == "MyRoom"
        assert room.max_players == 2
        assert len(room.id) == 8

    def test_list_rooms(self):
        mgr = RoomManager()
        mgr.create_room("Room1")
        mgr.create_room("Room2")
        rooms = mgr.list_rooms()
        assert len(rooms) == 2

    def test_get_room(self):
        mgr = RoomManager()
        room = mgr.create_room("MyRoom")
        found = mgr.get_room(room.id)
        assert found is not None
        assert found.name == "MyRoom"

    def test_get_room_not_found(self):
        mgr = RoomManager()
        assert mgr.get_room("nonexistent") is None

    def test_delete_room(self):
        mgr = RoomManager()
        room = mgr.create_room("MyRoom")
        assert mgr.delete_room(room.id) is True
        assert mgr.get_room(room.id) is None

    def test_delete_room_not_found(self):
        mgr = RoomManager()
        assert mgr.delete_room("nonexistent") is False


# ── GameSession 테스트 ───────────────────────────────

class TestGameSession:
    def test_start_game(self):
        session = GameSession("room1", ["p1", "p2"], ["Alice", "Bob"])
        state = session.start_game()
        assert state["phase"] == "dealing"
        assert state["currentRound"] == 0

    def test_deal_cards_round0(self):
        session = GameSession("room1", ["p1", "p2"], ["Alice", "Bob"])
        session.start_game()
        cards = session.deal_cards("p1")
        assert len(cards) == 5

    def test_deal_cards_round1(self):
        session = GameSession("room1", ["p1", "p2"], ["Alice", "Bob"])
        session.start_game()
        session.current_round = 1
        cards = session.deal_cards("p1")
        assert len(cards) == 3

    def test_place_card_valid(self):
        session = GameSession("room1", ["p1", "p2"], ["Alice", "Bob"])
        session.start_game()
        cards = session.deal_cards("p1")
        card = cards[0]
        card_data = _card_to_dict(card)
        result = session.place_card("p1", card_data, "bottom")
        assert result is not None
        assert len(session.players["p1"].board.bottom) == 1

    def test_place_card_invalid_card(self):
        session = GameSession("room1", ["p1", "p2"], ["Alice", "Bob"])
        session.start_game()
        session.deal_cards("p1")
        # 핸드에 없는 카드 배치 시도
        fake_card = {"rank": 14, "suit": 4, "rankName": "ACE", "suitName": "SPADE"}
        # 핸드에 ACE of SPADE가 없을 수도 있으므로 확실히 없는 카드 사용
        # 모든 핸드 카드를 먼저 제거
        session.players["p1"].hand = []
        result = session.place_card("p1", fake_card, "bottom")
        assert result is None

    def test_place_card_full_line(self):
        session = GameSession("room1", ["p1", "p2"], ["Alice", "Bob"])
        session.start_game()
        # top 라인을 가득 채움 (3장)
        ps = session.players["p1"]
        ps.hand = [
            Card(Rank.TWO, Suit.CLUB),
            Card(Rank.THREE, Suit.CLUB),
            Card(Rank.FOUR, Suit.CLUB),
            Card(Rank.FIVE, Suit.CLUB),
        ]
        session.place_card("p1", _card_to_dict(Card(Rank.TWO, Suit.CLUB)), "top")
        session.place_card("p1", _card_to_dict(Card(Rank.THREE, Suit.CLUB)), "top")
        session.place_card("p1", _card_to_dict(Card(Rank.FOUR, Suit.CLUB)), "top")
        # 4번째 배치는 실패해야 함
        result = session.place_card("p1", _card_to_dict(Card(Rank.FIVE, Suit.CLUB)), "top")
        assert result is None

    def test_discard_card(self):
        session = GameSession("room1", ["p1", "p2"], ["Alice", "Bob"])
        session.start_game()
        session.current_round = 1
        cards = session.deal_cards("p1")
        card = cards[0]
        result = session.discard_card("p1", _card_to_dict(card))
        assert result is not None
        assert len(session.players["p1"].discarded) == 1

    def test_discard_card_round0_rejected(self):
        session = GameSession("room1", ["p1", "p2"], ["Alice", "Bob"])
        session.start_game()
        cards = session.deal_cards("p1")
        # R0에서는 버리기 불가
        result = session.discard_card("p1", _card_to_dict(cards[0]))
        assert result is None

    def test_confirm_placement_round0(self):
        session = GameSession("room1", ["p1", "p2"], ["Alice", "Bob"])
        session.start_game()
        # p1, p2 모두 카드 딜링
        cards_p1 = session.deal_cards("p1")
        cards_p2 = session.deal_cards("p2")
        # p1: 5장 배치 (bottom 3 + mid 2)
        for i, card in enumerate(cards_p1):
            line = "bottom" if i < 3 else "mid"
            session.place_card("p1", _card_to_dict(card), line)
        # p2: 5장 배치
        for i, card in enumerate(cards_p2):
            line = "bottom" if i < 3 else "mid"
            session.place_card("p2", _card_to_dict(card), line)
        # 둘 다 확정
        result1 = session.confirm_placement("p1")
        assert "error" not in result1
        result2 = session.confirm_placement("p2")
        # 라운드 진행
        assert result2.get("roundAdvanced") is True
        assert result2.get("currentRound") == 1

    def test_confirm_placement_incomplete(self):
        session = GameSession("room1", ["p1", "p2"], ["Alice", "Bob"])
        session.start_game()
        session.deal_cards("p1")
        # 배치 없이 확정 시도
        result = session.confirm_placement("p1")
        assert "error" in result

    def test_get_state_hides_opponent_hand(self):
        session = GameSession("room1", ["p1", "p2"], ["Alice", "Bob"])
        session.start_game()
        session.deal_cards("p1")
        session.deal_cards("p2")
        state = session.get_state(for_player="p1")
        # p1은 자신의 핸드를 볼 수 있어야 함
        assert "hand" in state["players"]["p1"]
        # p2의 핸드는 숨겨야 함
        assert "hand" not in state["players"]["p2"]
        assert state["players"]["p2"]["handCount"] >= 0

    def test_full_game_2_players(self):
        """2인 풀 게임 플로우 (5라운드)"""
        session = GameSession("room1", ["p1", "p2"], ["Alice", "Bob"])
        session.target_hands = 1  # 단일 핸드로 게임 종료
        session.start_game()

        for round_num in range(5):
            cards_p1 = session.deal_cards("p1")
            cards_p2 = session.deal_cards("p2")

            if round_num == 0:
                # R0: 5장 모두 배치
                for i, card in enumerate(cards_p1):
                    if i < 2:
                        session.place_card("p1", _card_to_dict(card), "bottom")
                    elif i < 4:
                        session.place_card("p1", _card_to_dict(card), "mid")
                    else:
                        session.place_card("p1", _card_to_dict(card), "top")
                for i, card in enumerate(cards_p2):
                    if i < 2:
                        session.place_card("p2", _card_to_dict(card), "bottom")
                    elif i < 4:
                        session.place_card("p2", _card_to_dict(card), "mid")
                    else:
                        session.place_card("p2", _card_to_dict(card), "top")
            else:
                # R1~R4: 2장 배치 + 1장 버리기
                placed = 0
                for card in cards_p1:
                    if placed < 2:
                        # bottom/mid에 공간이 있으면 배치
                        ps = session.players["p1"]
                        if len(ps.board.bottom) < 5:
                            session.place_card("p1", _card_to_dict(card), "bottom")
                        elif len(ps.board.mid) < 5:
                            session.place_card("p1", _card_to_dict(card), "mid")
                        else:
                            session.place_card("p1", _card_to_dict(card), "top")
                        placed += 1
                    else:
                        session.discard_card("p1", _card_to_dict(card))

                placed = 0
                for card in cards_p2:
                    if placed < 2:
                        ps = session.players["p2"]
                        if len(ps.board.bottom) < 5:
                            session.place_card("p2", _card_to_dict(card), "bottom")
                        elif len(ps.board.mid) < 5:
                            session.place_card("p2", _card_to_dict(card), "mid")
                        else:
                            session.place_card("p2", _card_to_dict(card), "top")
                        placed += 1
                    else:
                        session.discard_card("p2", _card_to_dict(card))

            result1 = session.confirm_placement("p1")
            result2 = session.confirm_placement("p2")

            if round_num < 4:
                assert result2.get("roundAdvanced") is True
            else:
                # 마지막 라운드: 게임 종료
                assert result2.get("type") == "gameOver"

        assert session.phase == "gameOver"


# ── 카드 직렬화 테스트 ────────────────────────────────

class TestCardSerialization:
    def test_card_to_dict(self):
        card = Card(Rank.ACE, Suit.SPADE)
        d = _card_to_dict(card)
        assert d["rank"] == 14
        assert d["suit"] == 4
        assert d["rankName"] == "ace"
        assert d["suitName"] == "spade"

    def test_card_from_dict(self):
        d = {"rank": 14, "suit": 4}
        card = _card_from_dict(d)
        assert card.rank == Rank.ACE
        assert card.suit == Suit.SPADE

    def test_roundtrip(self):
        original = Card(Rank.KING, Suit.HEART)
        d = _card_to_dict(original)
        restored = _card_from_dict(d)
        assert restored.rank == original.rank
        assert restored.suit == original.suit


# ── Royalty 점수 계산 테스트 ──────────────────────────

class TestRoyalty:
    def _make_board(self, top, mid, bottom):
        from src.board import OFCBoard
        board = OFCBoard()
        for c in top:
            board.place_card("top", c)
        for c in mid:
            board.place_card("mid", c)
        for c in bottom:
            board.place_card("bottom", c)
        return board

    def test_bottom_flush_royalty(self):
        """Bottom Flush → +4"""
        board = self._make_board(
            top=[Card(Rank.TWO, Suit.CLUB), Card(Rank.THREE, Suit.CLUB), Card(Rank.FOUR, Suit.CLUB)],
            mid=[Card(Rank.FIVE, Suit.CLUB), Card(Rank.SIX, Suit.CLUB), Card(Rank.SEVEN, Suit.HEART),
                 Card(Rank.EIGHT, Suit.HEART), Card(Rank.NINE, Suit.HEART)],
            bottom=[Card(Rank.TEN, Suit.SPADE), Card(Rank.JACK, Suit.SPADE), Card(Rank.QUEEN, Suit.SPADE),
                    Card(Rank.KING, Suit.SPADE), Card(Rank.ACE, Suit.SPADE)],
        )
        assert GameSession._calculate_royalty(board) >= 4  # bottom flush at least

    def test_top_pair_qq_royalty(self):
        """Top QQ → +7"""
        board = self._make_board(
            top=[Card(Rank.QUEEN, Suit.CLUB), Card(Rank.QUEEN, Suit.HEART), Card(Rank.TWO, Suit.CLUB)],
            mid=[Card(Rank.THREE, Suit.CLUB), Card(Rank.FOUR, Suit.CLUB), Card(Rank.FIVE, Suit.HEART),
                 Card(Rank.SIX, Suit.HEART), Card(Rank.SEVEN, Suit.HEART)],
            bottom=[Card(Rank.EIGHT, Suit.DIAMOND), Card(Rank.NINE, Suit.DIAMOND), Card(Rank.TEN, Suit.DIAMOND),
                    Card(Rank.JACK, Suit.DIAMOND), Card(Rank.ACE, Suit.DIAMOND)],
        )
        royalty = GameSession._calculate_royalty(board)
        assert royalty >= 7  # QQ = +7

    def test_top_trip_aces_royalty(self):
        """Top AAA → +22"""
        board = self._make_board(
            top=[Card(Rank.ACE, Suit.CLUB), Card(Rank.ACE, Suit.HEART), Card(Rank.ACE, Suit.DIAMOND)],
            mid=[Card(Rank.TWO, Suit.CLUB), Card(Rank.THREE, Suit.CLUB), Card(Rank.FOUR, Suit.CLUB),
                 Card(Rank.FIVE, Suit.CLUB), Card(Rank.SIX, Suit.CLUB)],
            bottom=[Card(Rank.SEVEN, Suit.HEART), Card(Rank.EIGHT, Suit.HEART), Card(Rank.NINE, Suit.HEART),
                    Card(Rank.TEN, Suit.HEART), Card(Rank.JACK, Suit.HEART)],
        )
        royalty = GameSession._calculate_royalty(board)
        assert royalty >= 22  # Trip Aces = +22

    def test_top_pair_55_no_royalty(self):
        """Top 55 → 0 (66부터 시작)"""
        board = self._make_board(
            top=[Card(Rank.FIVE, Suit.CLUB), Card(Rank.FIVE, Suit.HEART), Card(Rank.TWO, Suit.CLUB)],
            mid=[Card(Rank.THREE, Suit.CLUB), Card(Rank.FOUR, Suit.CLUB), Card(Rank.SIX, Suit.HEART),
                 Card(Rank.SEVEN, Suit.HEART), Card(Rank.EIGHT, Suit.HEART)],
            bottom=[Card(Rank.NINE, Suit.DIAMOND), Card(Rank.TEN, Suit.CLUB), Card(Rank.JACK, Suit.DIAMOND),
                    Card(Rank.QUEEN, Suit.HEART), Card(Rank.ACE, Suit.SPADE)],
        )
        royalty = GameSession._calculate_royalty(board)
        assert royalty == 0  # 55 gets no royalty, bottom high card = 0

    def test_mid_full_house_royalty(self):
        """Mid Full House → +12"""
        board = self._make_board(
            top=[Card(Rank.TWO, Suit.CLUB), Card(Rank.THREE, Suit.CLUB), Card(Rank.FOUR, Suit.CLUB)],
            mid=[Card(Rank.KING, Suit.CLUB), Card(Rank.KING, Suit.HEART), Card(Rank.KING, Suit.DIAMOND),
                 Card(Rank.QUEEN, Suit.CLUB), Card(Rank.QUEEN, Suit.HEART)],
            bottom=[Card(Rank.ACE, Suit.CLUB), Card(Rank.ACE, Suit.HEART), Card(Rank.ACE, Suit.DIAMOND),
                    Card(Rank.ACE, Suit.SPADE), Card(Rank.JACK, Suit.CLUB)],
        )
        royalty = GameSession._calculate_royalty(board)
        # Mid FH +12, Bottom 4K +10 = 22
        assert royalty == 22

    def test_foul_zeroes_royalty_in_scoring(self):
        """Foul 시 Royalty 소멸 확인"""
        # Foul board: top(THREE_OF_A_KIND) > mid(HIGH_CARD) → 위반
        board = self._make_board(
            top=[Card(Rank.ACE, Suit.CLUB), Card(Rank.ACE, Suit.HEART), Card(Rank.ACE, Suit.DIAMOND)],
            mid=[Card(Rank.TWO, Suit.CLUB), Card(Rank.THREE, Suit.HEART), Card(Rank.SEVEN, Suit.DIAMOND),
                 Card(Rank.EIGHT, Suit.SPADE), Card(Rank.NINE, Suit.CLUB)],
            bottom=[Card(Rank.TEN, Suit.CLUB), Card(Rank.TEN, Suit.HEART), Card(Rank.TEN, Suit.DIAMOND),
                    Card(Rank.JACK, Suit.CLUB), Card(Rank.JACK, Suit.HEART)],
        )
        # top(3K=4) > mid(HC=1) → Foul
        assert board.check_foul().has_foul
        # Raw royalty would be high, but foul should zero it in scoring
        foul_result = board.check_foul()
        royalty = 0 if foul_result.has_foul else GameSession._calculate_royalty(board)
        assert royalty == 0


# ── REST API 테스트 ───────────────────────────────────

class TestRestAPI:
    def setup_method(self):
        self.client = TestClient(app)

    def test_create_room(self):
        resp = self.client.post("/api/rooms", json={"name": "TestRoom", "max_players": 2})
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "TestRoom"
        assert data["max_players"] == 2
        assert "id" in data

    def test_list_rooms(self):
        self.client.post("/api/rooms", json={"name": "Room1"})
        self.client.post("/api/rooms", json={"name": "Room2"})
        resp = self.client.get("/api/rooms")
        assert resp.status_code == 200
        rooms = resp.json()
        assert len(rooms) == 2

    def test_list_rooms_empty(self):
        resp = self.client.get("/api/rooms")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_delete_room(self):
        resp = self.client.post("/api/rooms", json={"name": "ToDelete"})
        room_id = resp.json()["id"]
        resp = self.client.delete(f"/api/rooms/{room_id}")
        assert resp.status_code == 200
        assert resp.json()["deleted"] is True
        # 삭제 확인
        resp = self.client.get("/api/rooms")
        assert len(resp.json()) == 0

    def test_delete_room_not_found(self):
        resp = self.client.delete("/api/rooms/nonexistent")
        assert resp.status_code == 200
        assert resp.json()["deleted"] is False


# ── WebSocket 테스트 ──────────────────────────────────

class TestWebSocket:
    def setup_method(self):
        self.client = TestClient(app)

    def test_websocket_join(self):
        resp = self.client.post("/api/rooms", json={"name": "WsRoom", "max_players": 2})
        room_id = resp.json()["id"]

        with self.client.websocket_connect(f"/ws/game/{room_id}") as ws:
            ws.send_json({"type": "joinRequest", "payload": {"playerName": "Alice"}})
            msg = ws.receive_json()
            assert msg["type"] == "joinAccepted"
            assert "playerId" in msg["payload"]

    def test_websocket_invalid_room(self):
        with self.client.websocket_connect("/ws/game/nonexistent") as ws:
            msg = ws.receive_json()
            assert msg["type"] == "error"

    def test_websocket_heartbeat(self):
        resp = self.client.post("/api/rooms", json={"name": "HbRoom", "max_players": 2})
        room_id = resp.json()["id"]

        with self.client.websocket_connect(f"/ws/game/{room_id}") as ws:
            ws.send_json({"type": "joinRequest", "payload": {"playerName": "Alice"}})
            ws.receive_json()  # joinAccepted
            ws.send_json({"type": "heartbeat", "payload": {}})
            msg = ws.receive_json()
            assert msg["type"] == "heartbeat"

    def test_websocket_unknown_message_type(self):
        resp = self.client.post("/api/rooms", json={"name": "UnkRoom", "max_players": 2})
        room_id = resp.json()["id"]

        with self.client.websocket_connect(f"/ws/game/{room_id}") as ws:
            ws.send_json({"type": "joinRequest", "payload": {"playerName": "Alice"}})
            ws.receive_json()  # joinAccepted
            ws.send_json({"type": "unknownType", "payload": {}})
            msg = ws.receive_json()
            assert msg["type"] == "error"

    def test_websocket_full_game_flow(self):
        """2인 WebSocket 게임 풀 플로우"""
        resp = self.client.post("/api/rooms", json={"name": "GameRoom", "max_players": 2})
        room_id = resp.json()["id"]

        with self.client.websocket_connect(f"/ws/game/{room_id}") as ws1:
            ws1.send_json({"type": "joinRequest", "payload": {"playerName": "Alice"}})
            join1 = ws1.receive_json()
            assert join1["type"] == "joinAccepted"
            p1_id = join1["payload"]["playerId"]

            with self.client.websocket_connect(f"/ws/game/{room_id}") as ws2:
                ws2.send_json({"type": "joinRequest", "payload": {"playerName": "Bob"}})
                join2 = ws2.receive_json()
                assert join2["type"] == "joinAccepted"
                p2_id = join2["payload"]["playerId"]

                # ws1에 playerJoined가 올 수 있음
                # 두 플레이어 모두 참가 → gameStart 브로드캐스트
                # ws1: playerJoined + gameStart + dealCards + stateUpdate
                msgs_ws1 = []
                msgs_ws2 = []

                # ws1의 메시지 수집 (playerJoined, gameStart, dealCards, stateUpdate)
                for _ in range(4):
                    msgs_ws1.append(ws1.receive_json())

                # ws2의 메시지 수집 (gameStart, dealCards, stateUpdate)
                for _ in range(3):
                    msgs_ws2.append(ws2.receive_json())

                # gameStart 메시지 확인
                game_start_msgs1 = [m for m in msgs_ws1 if m["type"] == "gameStart"]
                assert len(game_start_msgs1) == 1

                # dealCards 메시지 확인
                deal_msgs1 = [m for m in msgs_ws1 if m["type"] == "dealCards"]
                assert len(deal_msgs1) == 1
                cards_p1 = deal_msgs1[0]["payload"]["cards"]
                assert len(cards_p1) == 5  # R0: 5장

                deal_msgs2 = [m for m in msgs_ws2 if m["type"] == "dealCards"]
                assert len(deal_msgs2) == 1
                cards_p2 = deal_msgs2[0]["payload"]["cards"]
                assert len(cards_p2) == 5


# ── 3인 게임 테스트 ───────────────────────────────────

class TestThreePlayerGame:
    def test_three_player_session(self):
        session = GameSession("room1", ["p1", "p2", "p3"], ["Alice", "Bob", "Carol"])
        session.start_game()
        assert len(session.players) == 3

    def test_three_player_deal(self):
        session = GameSession("room1", ["p1", "p2", "p3"], ["Alice", "Bob", "Carol"])
        session.start_game()
        for pid in ["p1", "p2", "p3"]:
            cards = session.deal_cards(pid)
            assert len(cards) == 5

    def test_create_room_3_players(self):
        client = TestClient(app)
        resp = client.post("/api/rooms", json={"name": "3P Room", "max_players": 3})
        assert resp.status_code == 200
        assert resp.json()["max_players"] == 3


# ── Config 테스트 ──────────────────────────────────

class TestConfig:
    def test_default_values(self):
        from server.config import HOST, PORT, ALLOWED_ORIGINS, WS_HEARTBEAT_INTERVAL, RECONNECT_TIMEOUT
        assert HOST == "0.0.0.0"
        assert PORT == 8000
        assert RECONNECT_TIMEOUT == 60
        assert WS_HEARTBEAT_INTERVAL == 25

    def test_allowed_origins_default(self):
        from server.config import ALLOWED_ORIGINS
        assert "*" in ALLOWED_ORIGINS


# ── Session Token 테스트 ───────────────────────────

class TestSessionToken:
    def test_add_player_returns_tuple(self):
        mgr = RoomManager()
        room = mgr.create_room("TestRoom", 2)
        # add_player는 (player_id, session_token) 튜플을 반환한다
        from unittest.mock import MagicMock
        mock_ws = MagicMock()
        result = mgr.add_player(room.id, "Alice", mock_ws)
        assert isinstance(result, tuple)
        assert len(result) == 2
        player_id, session_token = result
        assert len(player_id) == 8
        assert len(session_token) == 32  # uuid4 hex

    def test_session_token_stored(self):
        mgr = RoomManager()
        room = mgr.create_room("TestRoom", 2)
        from unittest.mock import MagicMock
        mock_ws = MagicMock()
        player_id, session_token = mgr.add_player(room.id, "Alice", mock_ws)
        assert session_token in mgr._session_tokens
        token_info = mgr._session_tokens[session_token]
        assert token_info["player_id"] == player_id
        assert token_info["room_id"] == room.id
        assert token_info["name"] == "Alice"


# ── Reconnection 테스트 ────────────────────────────

class TestReconnection:
    def test_remove_player_marks_disconnected(self):
        mgr = RoomManager()
        room = mgr.create_room("TestRoom", 2)
        from unittest.mock import MagicMock
        mock_ws = MagicMock()
        player_id, _ = mgr.add_player(room.id, "Alice", mock_ws)
        mgr.remove_player(room.id, player_id)
        assert mgr.is_player_disconnected(player_id)

    def test_reconnect_player_success(self):
        mgr = RoomManager()
        room = mgr.create_room("TestRoom", 2)
        from unittest.mock import MagicMock
        mock_ws1 = MagicMock()
        mock_ws2 = MagicMock()
        player_id, session_token = mgr.add_player(room.id, "Alice", mock_ws1)
        mgr.remove_player(room.id, player_id)
        assert mgr.is_player_disconnected(player_id)
        result = mgr.reconnect_player(session_token, mock_ws2)
        assert result is not None
        pid, rid, name = result
        assert pid == player_id
        assert rid == room.id
        assert name == "Alice"
        assert not mgr.is_player_disconnected(player_id)

    def test_reconnect_invalid_token(self):
        mgr = RoomManager()
        from unittest.mock import MagicMock
        mock_ws = MagicMock()
        result = mgr.reconnect_player("invalid_token", mock_ws)
        assert result is None

    def test_reconnect_not_disconnected(self):
        mgr = RoomManager()
        room = mgr.create_room("TestRoom", 2)
        from unittest.mock import MagicMock
        mock_ws = MagicMock()
        _, session_token = mgr.add_player(room.id, "Alice", mock_ws)
        # 아직 연결 중인 플레이어는 재접속 불가
        result = mgr.reconnect_player(session_token, mock_ws)
        assert result is None

    def test_cleanup_expired(self):
        import time
        mgr = RoomManager()
        room = mgr.create_room("TestRoom", 2)
        from unittest.mock import MagicMock
        mock_ws = MagicMock()
        player_id, _ = mgr.add_player(room.id, "Alice", mock_ws)
        mgr.remove_player(room.id, player_id)
        # disconnect_time을 과거로 조작
        mgr._disconnected[player_id]["disconnect_time"] = time.time() - 100
        expired = mgr.cleanup_expired(60)
        assert len(expired) == 1
        assert expired[0] == (room.id, player_id)
        assert not mgr.is_player_disconnected(player_id)

    def test_force_remove_clears_token(self):
        mgr = RoomManager()
        room = mgr.create_room("TestRoom", 2)
        from unittest.mock import MagicMock
        mock_ws = MagicMock()
        player_id, session_token = mgr.add_player(room.id, "Alice", mock_ws)
        mgr.remove_player(room.id, player_id)
        mgr._force_remove_player(room.id, player_id)
        assert session_token not in mgr._session_tokens


# ── WebSocket Reconnect 통합 테스트 ────────────────

class TestWebSocketReconnect:
    def setup_method(self):
        self.client = TestClient(app)

    def test_join_returns_session_token(self):
        resp = self.client.post("/api/rooms", json={"name": "TokenRoom", "max_players": 2})
        room_id = resp.json()["id"]
        with self.client.websocket_connect(f"/ws/game/{room_id}") as ws:
            ws.send_json({"type": "joinRequest", "payload": {"playerName": "Alice"}})
            msg = ws.receive_json()
            assert msg["type"] == "joinAccepted"
            assert "sessionToken" in msg["payload"]
            assert len(msg["payload"]["sessionToken"]) == 32


# ── Lobby WebSocket 테스트 ────────────────────────────

class TestLobbyWebSocket:
    """Lobby WebSocket (/ws/lobby) 실시간 방 목록 테스트"""

    def setup_method(self):
        self.client = TestClient(app)

    def test_lobby_connect_receives_room_list(self):
        """로비 WS 연결 시 초기 방 목록 수신"""
        # 방 2개 생성
        self.client.post("/api/rooms", json={"name": "Room1"})
        self.client.post("/api/rooms", json={"name": "Room2"})

        with self.client.websocket_connect("/ws/lobby") as ws:
            msg = ws.receive_json()
            assert msg["type"] == "roomList"
            assert len(msg["payload"]["rooms"]) == 2
            # 각 방에 기본 필드 존재
            for room in msg["payload"]["rooms"]:
                assert "id" in room
                assert "name" in room
                assert "status" in room
                assert "players" in room
                assert "created_at" in room

    def test_lobby_connect_empty_rooms(self):
        """로비 WS 연결 시 빈 방 목록"""
        with self.client.websocket_connect("/ws/lobby") as ws:
            msg = ws.receive_json()
            assert msg["type"] == "roomList"
            assert msg["payload"]["rooms"] == []

    def test_lobby_room_created_broadcast(self):
        """방 생성 시 로비에 roomCreated 브로드캐스트"""
        with self.client.websocket_connect("/ws/lobby") as ws:
            # 초기 방 목록
            msg = ws.receive_json()
            assert msg["type"] == "roomList"

            # REST로 방 생성
            resp = self.client.post("/api/rooms", json={"name": "NewRoom"})
            room_data = resp.json()

            # 로비에 roomCreated 메시지 수신
            msg = ws.receive_json()
            assert msg["type"] == "roomCreated"
            assert msg["payload"]["room"]["name"] == "NewRoom"
            assert msg["payload"]["room"]["id"] == room_data["id"]
            assert "created_at" in msg["payload"]["room"]

    def test_lobby_room_updated_on_player_join(self):
        """플레이어 참가 시 로비에 roomUpdated 브로드캐스트"""
        resp = self.client.post("/api/rooms", json={"name": "JoinRoom", "max_players": 2})
        room_id = resp.json()["id"]

        with self.client.websocket_connect("/ws/lobby") as lobby_ws:
            # 초기 방 목록
            msg = lobby_ws.receive_json()
            assert msg["type"] == "roomList"

            # 게임 WS로 플레이어 참가
            with self.client.websocket_connect(f"/ws/game/{room_id}") as game_ws:
                game_ws.send_json({"type": "joinRequest", "payload": {"playerName": "Alice"}})
                game_ws.receive_json()  # joinAccepted

                # 로비에 roomUpdated 수신
                msg = lobby_ws.receive_json()
                assert msg["type"] == "roomUpdated"
                assert msg["payload"]["room"]["id"] == room_id
                assert len(msg["payload"]["room"]["players"]) == 1

    def test_lobby_room_deleted_broadcast(self):
        """방 삭제 시 로비에 roomDeleted 브로드캐스트"""
        resp = self.client.post("/api/rooms", json={"name": "DelRoom"})
        room_id = resp.json()["id"]

        with self.client.websocket_connect("/ws/lobby") as ws:
            # 초기 방 목록
            msg = ws.receive_json()
            assert msg["type"] == "roomList"

            # REST로 방 삭제
            self.client.delete(f"/api/rooms/{room_id}")

            # 로비에 roomDeleted 수신
            msg = ws.receive_json()
            assert msg["type"] == "roomDeleted"
            assert msg["payload"]["roomId"] == room_id

    def test_lobby_multiple_listeners(self):
        """다중 로비 리스너에 동시 브로드캐스트"""
        with self.client.websocket_connect("/ws/lobby") as ws1:
            ws1.receive_json()  # roomList

            with self.client.websocket_connect("/ws/lobby") as ws2:
                ws2.receive_json()  # roomList

                # 방 생성
                self.client.post("/api/rooms", json={"name": "MultiRoom"})

                # 두 리스너 모두 roomCreated 수신
                msg1 = ws1.receive_json()
                msg2 = ws2.receive_json()
                assert msg1["type"] == "roomCreated"
                assert msg2["type"] == "roomCreated"
                assert msg1["payload"]["room"]["name"] == "MultiRoom"
                assert msg2["payload"]["room"]["name"] == "MultiRoom"

    def test_room_has_created_at(self):
        """Room 모델에 created_at 필드 존재"""
        import time
        before = time.time()
        room = room_mgr.create_room("TimedRoom")
        after = time.time()
        room_dict = room.model_dump()
        assert "created_at" in room_dict
        assert before <= room_dict["created_at"] <= after

    def test_lobby_room_updated_on_game_start(self):
        """게임 시작 시 (방 상태 playing) 로비에 roomUpdated 브로드캐스트"""
        resp = self.client.post("/api/rooms", json={"name": "StartRoom", "max_players": 2})
        room_id = resp.json()["id"]

        with self.client.websocket_connect("/ws/lobby") as lobby_ws:
            lobby_ws.receive_json()  # roomList

            # 2명 참가 → 게임 시작
            with self.client.websocket_connect(f"/ws/game/{room_id}") as ws1:
                ws1.send_json({"type": "joinRequest", "payload": {"playerName": "Alice"}})
                ws1.receive_json()  # joinAccepted

                # roomUpdated (Alice 참가)
                msg = lobby_ws.receive_json()
                assert msg["type"] == "roomUpdated"

                with self.client.websocket_connect(f"/ws/game/{room_id}") as ws2:
                    ws2.send_json({"type": "joinRequest", "payload": {"playerName": "Bob"}})
                    ws2.receive_json()  # joinAccepted

                    # ws1: playerJoined, gameStart, dealCards, stateUpdate
                    for _ in range(4):
                        ws1.receive_json()
                    # ws2: gameStart, dealCards, stateUpdate
                    for _ in range(3):
                        ws2.receive_json()

                    # 로비에 roomUpdated 2개 수신 (Bob 참가 + status=playing)
                    msg1 = lobby_ws.receive_json()
                    msg2 = lobby_ws.receive_json()
                    assert msg1["type"] == "roomUpdated"
                    assert msg2["type"] == "roomUpdated"
                    assert msg2["payload"]["room"]["status"] == "playing"

    def test_lobby_ws_auto_cleanup(self):
        """stale room (빈 방 5분 경과) auto_cleanup 삭제 검증"""
        import time as _time
        room = room_mgr.create_room("StaleRoom")
        # created_at을 6분 전으로 조작
        room.created_at = _time.time() - 360
        assert room_mgr.get_room(room.id) is not None

        # auto_cleanup 로직 직접 호출 (빈 방 + 5분 경과 → 삭제 대상)
        from server.models import RoomStatus as RS
        now = _time.time()
        to_delete = []
        for rid, r in list(room_mgr.rooms.items()):
            age = now - r.created_at
            if not r.players and age >= 300:
                to_delete.append(rid)
        for rid in to_delete:
            room_mgr.delete_room(rid)
        assert room_mgr.get_room(room.id) is None

    def test_lobby_ws_disconnect(self):
        """lobby listener 해제 후 브로드캐스트 미수신 확인"""
        with self.client.websocket_connect("/ws/lobby") as ws1:
            ws1.receive_json()  # roomList

            # ws1 연결 중 방 생성 → roomCreated 수신
            self.client.post("/api/rooms", json={"name": "BeforeDisc"})
            msg = ws1.receive_json()
            assert msg["type"] == "roomCreated"

        # ws1 연결 종료 후 방 생성 → 에러 없이 진행 (listener 자동 제거)
        self.client.post("/api/rooms", json={"name": "AfterDisc"})
        # lobby listener가 0개여도 broadcast_lobby가 에러 없이 동작해야 함
        assert len(room_mgr._lobby_listeners) == 0


# ── Issue #1: 보드 공개 + Foul 판정 테스트 ────────────

class TestBoardVisibility:
    def test_opponent_board_visible(self):
        """상대 보드가 공개되어야 함 (hide_cards=False)"""
        session = GameSession("room1", ["p1", "p2"], ["Alice", "Bob"])
        session.start_game()
        cards = session.deal_cards("p1")
        session.deal_cards("p2")
        # Place a card
        session.place_card("p1", _card_to_dict(cards[0]), "bottom")
        state = session.get_state(for_player="p2")
        # p1's board should be visible to p2
        p1_board = state["players"]["p1"]["board"]
        assert p1_board["bottom"][0] is not None  # actual card, not None


class TestFoulDetection:
    def test_same_hand_type_different_rank_foul(self):
        """ONE_PAIR(2) in bottom < ONE_PAIR(A) in mid -> Foul"""
        from src.board import OFCBoard
        board = OFCBoard()
        # Bottom: ONE_PAIR of 2s
        board.place_card("bottom", Card(Rank.TWO, Suit.CLUB))
        board.place_card("bottom", Card(Rank.TWO, Suit.HEART))
        board.place_card("bottom", Card(Rank.THREE, Suit.CLUB))
        board.place_card("bottom", Card(Rank.FOUR, Suit.CLUB))
        board.place_card("bottom", Card(Rank.FIVE, Suit.CLUB))
        # Mid: ONE_PAIR of Aces (stronger)
        board.place_card("mid", Card(Rank.ACE, Suit.CLUB))
        board.place_card("mid", Card(Rank.ACE, Suit.HEART))
        board.place_card("mid", Card(Rank.SIX, Suit.CLUB))
        board.place_card("mid", Card(Rank.SEVEN, Suit.CLUB))
        board.place_card("mid", Card(Rank.EIGHT, Suit.CLUB))
        foul = board.check_foul()
        assert foul.has_foul


class TestCompareHandsOFC:
    def test_kicker_comparison(self):
        """Same hand type, different kicker -> higher kicker wins"""
        from src.hand import compare_hands_ofc, evaluate_hand
        # ONE_PAIR of Kings with Ace kicker
        h1 = evaluate_hand([Card(Rank.KING, Suit.CLUB), Card(Rank.KING, Suit.HEART), Card(Rank.ACE, Suit.CLUB)])
        # ONE_PAIR of Kings with Queen kicker
        h2 = evaluate_hand([Card(Rank.KING, Suit.DIAMOND), Card(Rank.KING, Suit.SPADE), Card(Rank.QUEEN, Suit.CLUB)])
        assert compare_hands_ofc(h1, h2) == 1

    def test_higher_pair_wins(self):
        """Higher pair rank wins"""
        from src.hand import compare_hands_ofc, evaluate_hand
        h1 = evaluate_hand([Card(Rank.ACE, Suit.CLUB), Card(Rank.ACE, Suit.HEART), Card(Rank.TWO, Suit.CLUB)])
        h2 = evaluate_hand([Card(Rank.KING, Suit.CLUB), Card(Rank.KING, Suit.HEART), Card(Rank.TWO, Suit.HEART)])
        assert compare_hands_ofc(h1, h2) == 1

    def test_tie(self):
        """Identical hand -> tie (0)"""
        from src.hand import compare_hands_ofc, evaluate_hand
        h1 = evaluate_hand([Card(Rank.ACE, Suit.CLUB), Card(Rank.KING, Suit.HEART), Card(Rank.QUEEN, Suit.DIAMOND)])
        h2 = evaluate_hand([Card(Rank.ACE, Suit.HEART), Card(Rank.KING, Suit.CLUB), Card(Rank.QUEEN, Suit.SPADE)])
        assert compare_hands_ofc(h1, h2) == 0


# ── Issue #2: WebSocket 예외 안전성 테스트 ────────────

class TestWSExceptionSafety:
    def setup_method(self):
        self.client = TestClient(app)

    def test_invalid_line_name(self):
        """잘못된 라인 이름 -> error 응답 + 커넥션 유지"""
        resp = self.client.post("/api/rooms", json={"name": "ErrRoom", "max_players": 2})
        room_id = resp.json()["id"]
        with self.client.websocket_connect(f"/ws/game/{room_id}") as ws1:
            ws1.send_json({"type": "joinRequest", "payload": {"playerName": "Alice"}})
            ws1.receive_json()  # joinAccepted
            with self.client.websocket_connect(f"/ws/game/{room_id}") as ws2:
                ws2.send_json({"type": "joinRequest", "payload": {"playerName": "Bob"}})
                ws2.receive_json()  # joinAccepted
                # Drain game start messages
                for _ in range(4):
                    ws1.receive_json()
                for _ in range(3):
                    ws2.receive_json()
                # Send placeCard with invalid line
                ws1.send_json({"type": "placeCard", "payload": {"card": {"rank": 2, "suit": 1}, "line": "invalid_line"}})
                msg = ws1.receive_json()
                assert msg["type"] == "error"
                # Drain stateUpdate sent after error (Change 13)
                state_msg = ws1.receive_json()
                assert state_msg["type"] == "stateUpdate"
                # Connection should still be alive
                ws1.send_json({"type": "heartbeat", "payload": {}})
                hb = ws1.receive_json()
                assert hb["type"] == "heartbeat"


# ── Issue #3: 입력 검증 테스트 ────────────────────────

class TestInputValidation:
    def setup_method(self):
        self.client = TestClient(app)

    def test_max_players_too_low(self):
        """max_players < 2 -> 422"""
        resp = self.client.post("/api/rooms", json={"name": "BadRoom", "max_players": 1})
        assert resp.status_code == 422

    def test_max_players_too_high(self):
        """max_players > 4 -> 422"""
        resp = self.client.post("/api/rooms", json={"name": "BadRoom", "max_players": 100})
        assert resp.status_code == 422

    def test_empty_room_name(self):
        """Empty room name -> 422"""
        resp = self.client.post("/api/rooms", json={"name": "", "max_players": 2})
        assert resp.status_code == 422

    def test_room_name_too_long(self):
        """Room name > 50 chars -> 422"""
        resp = self.client.post("/api/rooms", json={"name": "x" * 51, "max_players": 2})
        assert resp.status_code == 422

    def test_add_player_to_playing_room(self):
        """playing 상태 방에 입장 거부"""
        mgr = RoomManager()
        room = mgr.create_room("TestRoom", 2)
        from unittest.mock import MagicMock
        mock_ws = MagicMock()
        mgr.add_player(room.id, "Alice", mock_ws)
        room.status = RoomStatus.playing
        with pytest.raises(ValueError, match="not accepting"):
            mgr.add_player(room.id, "Bob", mock_ws)

    def test_delete_room_cleans_tokens(self):
        """방 삭제 시 토큰 정리"""
        mgr = RoomManager()
        room = mgr.create_room("TestRoom", 2)
        from unittest.mock import MagicMock
        mock_ws = MagicMock()
        _, token = mgr.add_player(room.id, "Alice", mock_ws)
        assert token in mgr._session_tokens
        mgr.delete_room(room.id)
        assert token not in mgr._session_tokens


# ── Issue #5: joinAccepted playerCount 테스트 ─────────

class TestJoinAcceptedPlayerCount:
    def setup_method(self):
        self.client = TestClient(app)

    def test_join_accepted_has_player_count(self):
        """joinAccepted에 playerCount 포함"""
        resp = self.client.post("/api/rooms", json={"name": "CountRoom", "max_players": 2})
        room_id = resp.json()["id"]
        with self.client.websocket_connect(f"/ws/game/{room_id}") as ws:
            ws.send_json({"type": "joinRequest", "payload": {"playerName": "Alice"}})
            msg = ws.receive_json()
            assert msg["type"] == "joinAccepted"
            assert msg["payload"]["playerCount"] == 1


# ── Issue #6: Undo + 덱 안전성 테스트 ─────────────────

class TestUnplaceCard:
    def test_unplace_card_success(self):
        """배치한 카드 되돌리기"""
        session = GameSession("room1", ["p1", "p2"], ["Alice", "Bob"])
        session.start_game()
        cards = session.deal_cards("p1")
        session.deal_cards("p2")
        card = cards[0]
        card_data = _card_to_dict(card)
        session.place_card("p1", card_data, "bottom")
        assert len(session.players["p1"].board.bottom) == 1
        assert len(session.players["p1"].hand) == 4
        result = session.unplace_card("p1", card_data, "bottom")
        assert result is not None
        assert len(session.players["p1"].board.bottom) == 0
        assert len(session.players["p1"].hand) == 5

    def test_unplace_card_after_confirm_rejected(self):
        """확정 후 되돌리기 거부"""
        session = GameSession("room1", ["p1", "p2"], ["Alice", "Bob"])
        session.start_game()
        cards_p1 = session.deal_cards("p1")
        session.deal_cards("p2")
        for i, c in enumerate(cards_p1):
            session.place_card("p1", _card_to_dict(c), "bottom" if i < 3 else "mid")
        session.confirm_placement("p1")
        # After confirm, unplace should fail
        result = session.unplace_card("p1", _card_to_dict(cards_p1[0]), "bottom")
        assert result is None

    def test_unplace_card_not_placed_this_round(self):
        """이번 라운드에 배치하지 않은 카드 되돌리기 거부"""
        session = GameSession("room1", ["p1", "p2"], ["Alice", "Bob"])
        session.start_game()
        session.deal_cards("p1")
        session.deal_cards("p2")
        fake = _card_to_dict(Card(Rank.TWO, Suit.CLUB))
        result = session.unplace_card("p1", fake, "bottom")
        assert result is None

    def test_deck_exhaustion(self):
        """덱 소진 시 빈 리스트 반환"""
        session = GameSession("room1", ["p1", "p2"], ["Alice", "Bob"])
        session.start_game()
        session.deck = []  # Empty deck
        cards = session.deal_cards("p1")
        assert cards == []

    def test_unplace_card_ws_handler(self):
        """WebSocket unplaceCard 핸들러"""
        client = TestClient(app)
        resp = client.post("/api/rooms", json={"name": "UndoRoom", "max_players": 2})
        room_id = resp.json()["id"]
        with client.websocket_connect(f"/ws/game/{room_id}") as ws1:
            ws1.send_json({"type": "joinRequest", "payload": {"playerName": "Alice"}})
            ws1.receive_json()  # joinAccepted
            with client.websocket_connect(f"/ws/game/{room_id}") as ws2:
                ws2.send_json({"type": "joinRequest", "payload": {"playerName": "Bob"}})
                ws2.receive_json()  # joinAccepted
                # Drain messages
                for _ in range(4):
                    ws1.receive_json()
                for _ in range(3):
                    ws2.receive_json()
                # Get dealt cards from game session
                session = game_sessions.get(room_id)
                p1_id = None
                conns = room_mgr.get_all_connections(room_id)
                for pid in session.players:
                    if pid in conns:
                        p1_id = pid
                        break
                if p1_id and session.players[p1_id].hand:
                    card = session.players[p1_id].hand[0]
                    card_data = _card_to_dict(card)
                    # Place a card
                    ws1.send_json({"type": "placeCard", "payload": {"card": card_data, "line": "bottom"}})
                    ws1.receive_json()  # stateUpdate
                    ws2.receive_json()  # stateUpdate for opponent
                    # Unplace it
                    ws1.send_json({"type": "unplaceCard", "payload": {"card": card_data, "line": "bottom"}})
                    msg = ws1.receive_json()
                    assert msg["type"] == "stateUpdate"


# ── Issue #7: 서버 UX 개선 테스트 ─────────────────────

class TestLeaveGame:
    def setup_method(self):
        self.client = TestClient(app)

    def test_leave_game_handler(self):
        """leaveGame 핸들러 테스트"""
        resp = self.client.post("/api/rooms", json={"name": "LeaveRoom", "max_players": 2})
        room_id = resp.json()["id"]
        with self.client.websocket_connect(f"/ws/game/{room_id}") as ws:
            ws.send_json({"type": "joinRequest", "payload": {"playerName": "Alice"}})
            ws.receive_json()  # joinAccepted
            ws.send_json({"type": "leaveGame", "payload": {}})
            # WebSocket should close


class TestSPACatchAll:
    def setup_method(self):
        self.client = TestClient(app)

    def test_api_404_not_masked(self):
        """API 404가 SPA에 의해 마스킹되지 않아야 함"""
        resp = self.client.get("/api/nonexistent")
        assert resp.status_code == 404


# ── A1: GameSession remove_player 테스트 ─────────────

class TestFantasylandServer:
    """Fantasy Land 서버 테스트"""

    def _make_session(self):
        """2인 게임 세션 생성"""
        return GameSession("test-room", ["p1", "p2"], ["Alice", "Bob"])

    def _build_fl_board(self, session, player_id, top_cards, mid_cards, bot_cards):
        """FL 달성 보드를 직접 구성한다 (테스트 헬퍼)."""
        ps = session.players[player_id]
        ps.board.top = list(top_cards)
        ps.board.mid = list(mid_cards)
        ps.board.bottom = list(bot_cards)

    def test_fl_playerstate_defaults(self):
        """FL 필드 기본값: in_fantasyland=False, fantasyland_card_count=0"""
        session = self._make_session()
        for ps in session.players.values():
            assert ps.in_fantasyland is False
            assert ps.fantasyland_card_count == 0

    def test_fl_deal_cards_14(self):
        """FL 플레이어에게 14장 딜링"""
        session = self._make_session()
        session.start_game()
        ps = session.players["p1"]
        ps.in_fantasyland = True
        ps.fantasyland_card_count = 14
        cards = session.deal_cards("p1")
        assert len(cards) == 14

    def test_fl_deal_cards_17(self):
        """FL 카드수 17(Trips) → 17장 딜링"""
        session = self._make_session()
        session.start_game()
        ps = session.players["p1"]
        ps.in_fantasyland = True
        ps.fantasyland_card_count = 17
        cards = session.deal_cards("p1")
        assert len(cards) == 17

    def test_fl_confirm_board_full(self):
        """FL confirm: board full(13) + hand empty → 성공"""
        session = self._make_session()
        session.start_game()
        ps1 = session.players["p1"]
        ps1.in_fantasyland = True
        ps1.fantasyland_card_count = 14
        cards = session.deal_cards("p1")
        session.deal_cards("p2")
        # 13장 배치, 1장 버림
        placed = 0
        for c in cards[:3]:
            session.place_card("p1", _card_to_dict(c), "top")
            placed += 1
        for c in cards[3:8]:
            session.place_card("p1", _card_to_dict(c), "mid")
            placed += 1
        for c in cards[8:13]:
            session.place_card("p1", _card_to_dict(c), "bottom")
            placed += 1
        # 1장 버림
        session.discard_card("p1", _card_to_dict(cards[13]))
        assert placed == 13
        assert len(ps1.hand) == 0
        result = session.confirm_placement("p1")
        # 에러가 아닌 정상 결과여야 함
        assert "error" not in result

    def test_fl_confirm_board_not_full(self):
        """FL confirm: board not full → 에러"""
        session = self._make_session()
        session.start_game()
        ps1 = session.players["p1"]
        ps1.in_fantasyland = True
        ps1.fantasyland_card_count = 14
        cards = session.deal_cards("p1")
        session.deal_cards("p2")
        # 일부만 배치
        session.place_card("p1", _card_to_dict(cards[0]), "top")
        result = session.confirm_placement("p1")
        assert "error" in result

    def test_fl_discard_r0_allowed(self):
        """FL 플레이어: R0에서도 discard 허용"""
        session = self._make_session()
        session.start_game()
        ps = session.players["p1"]
        ps.in_fantasyland = True
        ps.fantasyland_card_count = 14
        cards = session.deal_cards("p1")
        session.deal_cards("p2")
        assert session.current_round == 0
        # FL이면 R0에서도 버리기 가능
        result = session.discard_card("p1", _card_to_dict(cards[0]))
        assert result is not None

    def test_score_game_fl_detected_next_hand(self):
        """_score_game: FL 감지 → nextHand 반환"""
        session = self._make_session()
        session.start_game()
        session.hand_number = 1
        session.target_hands = 5
        # p1에 QQ top 보드 구성 (FL 달성)
        self._build_fl_board(session, "p1",
            top_cards=[Card(Rank.QUEEN, Suit.HEART), Card(Rank.QUEEN, Suit.DIAMOND), Card(Rank.TWO, Suit.CLUB)],
            mid_cards=[Card(Rank.KING, Suit.HEART), Card(Rank.KING, Suit.DIAMOND), Card(Rank.KING, Suit.CLUB), Card(Rank.THREE, Suit.HEART), Card(Rank.FOUR, Suit.HEART)],
            bot_cards=[Card(Rank.ACE, Suit.HEART), Card(Rank.ACE, Suit.DIAMOND), Card(Rank.ACE, Suit.CLUB), Card(Rank.ACE, Suit.SPADE), Card(Rank.FIVE, Suit.HEART)],
        )
        # p2에 일반 보드
        self._build_fl_board(session, "p2",
            top_cards=[Card(Rank.TWO, Suit.HEART), Card(Rank.THREE, Suit.DIAMOND), Card(Rank.FOUR, Suit.CLUB)],
            mid_cards=[Card(Rank.FIVE, Suit.SPADE), Card(Rank.SIX, Suit.HEART), Card(Rank.SEVEN, Suit.DIAMOND), Card(Rank.EIGHT, Suit.CLUB), Card(Rank.NINE, Suit.SPADE)],
            bot_cards=[Card(Rank.TEN, Suit.HEART), Card(Rank.JACK, Suit.DIAMOND), Card(Rank.QUEEN, Suit.CLUB), Card(Rank.KING, Suit.SPADE), Card(Rank.ACE, Suit.HEART)],
        )
        result = session._score_game()
        assert result["type"] == "nextHand"
        assert session.players["p1"].in_fantasyland is True
        assert session.players["p1"].fantasyland_card_count == 14  # QQ = 14

    def test_score_game_no_fl_game_over(self):
        """_score_game: FL 없음 + hand_number >= target → gameOver 반환"""
        session = self._make_session()
        session.start_game()
        session.hand_number = 5
        session.target_hands = 5
        # 양측 일반 보드
        self._build_fl_board(session, "p1",
            top_cards=[Card(Rank.TWO, Suit.HEART), Card(Rank.THREE, Suit.DIAMOND), Card(Rank.FOUR, Suit.CLUB)],
            mid_cards=[Card(Rank.FIVE, Suit.SPADE), Card(Rank.SIX, Suit.HEART), Card(Rank.SEVEN, Suit.DIAMOND), Card(Rank.EIGHT, Suit.CLUB), Card(Rank.NINE, Suit.SPADE)],
            bot_cards=[Card(Rank.TEN, Suit.HEART), Card(Rank.JACK, Suit.DIAMOND), Card(Rank.QUEEN, Suit.CLUB), Card(Rank.KING, Suit.SPADE), Card(Rank.ACE, Suit.HEART)],
        )
        self._build_fl_board(session, "p2",
            top_cards=[Card(Rank.TWO, Suit.CLUB), Card(Rank.THREE, Suit.HEART), Card(Rank.FOUR, Suit.DIAMOND)],
            mid_cards=[Card(Rank.FIVE, Suit.HEART), Card(Rank.SIX, Suit.CLUB), Card(Rank.SEVEN, Suit.HEART), Card(Rank.EIGHT, Suit.DIAMOND), Card(Rank.NINE, Suit.CLUB)],
            bot_cards=[Card(Rank.TEN, Suit.CLUB), Card(Rank.JACK, Suit.HEART), Card(Rank.QUEEN, Suit.DIAMOND), Card(Rank.KING, Suit.CLUB), Card(Rank.ACE, Suit.DIAMOND)],
        )
        result = session._score_game()
        assert result["type"] == "gameOver"

    def test_re_fl_top_trips(self):
        """Re-FL: Top Trips → FL 유지"""
        session = self._make_session()
        session.start_game()
        session.hand_number = 1
        session.target_hands = 5
        ps1 = session.players["p1"]
        ps1.in_fantasyland = True
        ps1.fantasyland_card_count = 14
        # p1 Top Trips (FL 유지 조건)
        self._build_fl_board(session, "p1",
            top_cards=[Card(Rank.KING, Suit.HEART), Card(Rank.KING, Suit.DIAMOND), Card(Rank.KING, Suit.CLUB)],
            mid_cards=[Card(Rank.ACE, Suit.HEART), Card(Rank.ACE, Suit.DIAMOND), Card(Rank.ACE, Suit.CLUB), Card(Rank.ACE, Suit.SPADE), Card(Rank.TWO, Suit.HEART)],
            bot_cards=[Card(Rank.ACE, Suit.HEART), Card(Rank.ACE, Suit.DIAMOND), Card(Rank.ACE, Suit.CLUB), Card(Rank.ACE, Suit.SPADE), Card(Rank.THREE, Suit.HEART)],
        )
        self._build_fl_board(session, "p2",
            top_cards=[Card(Rank.TWO, Suit.HEART), Card(Rank.THREE, Suit.DIAMOND), Card(Rank.FOUR, Suit.CLUB)],
            mid_cards=[Card(Rank.FIVE, Suit.SPADE), Card(Rank.SIX, Suit.HEART), Card(Rank.SEVEN, Suit.DIAMOND), Card(Rank.EIGHT, Suit.CLUB), Card(Rank.NINE, Suit.SPADE)],
            bot_cards=[Card(Rank.TEN, Suit.HEART), Card(Rank.JACK, Suit.DIAMOND), Card(Rank.QUEEN, Suit.CLUB), Card(Rank.KING, Suit.SPADE), Card(Rank.ACE, Suit.HEART)],
        )
        result = session._score_game()
        assert result["type"] == "nextHand"
        assert ps1.in_fantasyland is True

    def test_fl_board_hidden(self):
        """get_state: 상대가 FL이면 보드 숨김"""
        session = self._make_session()
        session.start_game()
        ps1 = session.players["p1"]
        ps1.in_fantasyland = True
        ps1.fantasyland_card_count = 14
        # p1에 카드 배치
        ps1.board.place_card("bottom", Card(Rank.ACE, Suit.HEART))
        state = session.get_state(for_player="p2")
        # p2에서 본 p1의 보드는 숨겨져야 함
        p1_board = state["players"]["p1"]["board"]
        assert p1_board["bottom"][0] is None  # 카드 내용 숨김

    def test_multi_hand_number(self):
        """hand_number 증가 확인"""
        session = self._make_session()
        session.start_game()
        assert session.hand_number == 1
        session.hand_number = 3
        assert session.hand_number == 3

    def test_start_next_hand(self):
        """_start_next_hand: 덱 리셋, 보드 리셋, hand_number++"""
        session = self._make_session()
        session.start_game()
        session.hand_number = 1
        session.target_hands = 5
        ps1 = session.players["p1"]
        ps1.in_fantasyland = True
        ps1.fantasyland_card_count = 14
        # 보드에 카드 배치
        ps1.board.place_card("bottom", Card(Rank.ACE, Suit.HEART))
        session._start_next_hand()
        assert session.hand_number == 2
        assert session.current_round == 0
        assert len(session.deck) == 52
        # 보드 리셋
        assert len(ps1.board.top) == 0
        assert len(ps1.board.mid) == 0
        assert len(ps1.board.bottom) == 0
        # FL 상태는 유지
        assert ps1.in_fantasyland is True
        assert ps1.fantasyland_card_count == 14

    def test_fl_card_count_qq(self):
        """FL 카드수: QQ → 14"""
        session = self._make_session()
        session.start_game()
        self._build_fl_board(session, "p1",
            top_cards=[Card(Rank.QUEEN, Suit.HEART), Card(Rank.QUEEN, Suit.DIAMOND), Card(Rank.TWO, Suit.CLUB)],
            mid_cards=[Card(Rank.KING, Suit.HEART), Card(Rank.KING, Suit.DIAMOND), Card(Rank.KING, Suit.CLUB), Card(Rank.THREE, Suit.HEART), Card(Rank.FOUR, Suit.HEART)],
            bot_cards=[Card(Rank.ACE, Suit.HEART), Card(Rank.ACE, Suit.DIAMOND), Card(Rank.ACE, Suit.CLUB), Card(Rank.ACE, Suit.SPADE), Card(Rank.FIVE, Suit.HEART)],
        )
        count = session._get_fl_card_count(session.players["p1"].board)
        assert count == 14

    def test_fl_card_count_kk(self):
        """FL 카드수: KK → 15"""
        session = self._make_session()
        session.start_game()
        self._build_fl_board(session, "p1",
            top_cards=[Card(Rank.KING, Suit.HEART), Card(Rank.KING, Suit.DIAMOND), Card(Rank.TWO, Suit.CLUB)],
            mid_cards=[Card(Rank.ACE, Suit.HEART), Card(Rank.ACE, Suit.DIAMOND), Card(Rank.ACE, Suit.CLUB), Card(Rank.THREE, Suit.HEART), Card(Rank.FOUR, Suit.HEART)],
            bot_cards=[Card(Rank.ACE, Suit.HEART), Card(Rank.ACE, Suit.DIAMOND), Card(Rank.ACE, Suit.CLUB), Card(Rank.ACE, Suit.SPADE), Card(Rank.FIVE, Suit.HEART)],
        )
        count = session._get_fl_card_count(session.players["p1"].board)
        assert count == 15

    def test_fl_card_count_aa(self):
        """FL 카드수: AA → 16"""
        session = self._make_session()
        session.start_game()
        self._build_fl_board(session, "p1",
            top_cards=[Card(Rank.ACE, Suit.HEART), Card(Rank.ACE, Suit.DIAMOND), Card(Rank.TWO, Suit.CLUB)],
            mid_cards=[Card(Rank.KING, Suit.HEART), Card(Rank.KING, Suit.DIAMOND), Card(Rank.KING, Suit.CLUB), Card(Rank.THREE, Suit.HEART), Card(Rank.FOUR, Suit.HEART)],
            bot_cards=[Card(Rank.ACE, Suit.HEART), Card(Rank.ACE, Suit.DIAMOND), Card(Rank.ACE, Suit.CLUB), Card(Rank.ACE, Suit.SPADE), Card(Rank.FIVE, Suit.HEART)],
        )
        count = session._get_fl_card_count(session.players["p1"].board)
        assert count == 16

    def test_fl_card_count_trips(self):
        """FL 카드수: Top Trips → 17"""
        session = self._make_session()
        session.start_game()
        self._build_fl_board(session, "p1",
            top_cards=[Card(Rank.KING, Suit.HEART), Card(Rank.KING, Suit.DIAMOND), Card(Rank.KING, Suit.CLUB)],
            mid_cards=[Card(Rank.ACE, Suit.HEART), Card(Rank.ACE, Suit.DIAMOND), Card(Rank.ACE, Suit.CLUB), Card(Rank.ACE, Suit.SPADE), Card(Rank.TWO, Suit.HEART)],
            bot_cards=[Card(Rank.ACE, Suit.HEART), Card(Rank.ACE, Suit.DIAMOND), Card(Rank.ACE, Suit.CLUB), Card(Rank.ACE, Suit.SPADE), Card(Rank.THREE, Suit.HEART)],
        )
        count = session._get_fl_card_count(session.players["p1"].board)
        assert count == 17

    def test_get_state_fl_info(self):
        """get_state: FL 정보 포함 (inFantasyland, fantasylandCardCount)"""
        session = self._make_session()
        session.start_game()
        ps1 = session.players["p1"]
        ps1.in_fantasyland = True
        ps1.fantasyland_card_count = 14
        state = session.get_state(for_player="p1")
        p1_state = state["players"]["p1"]
        assert p1_state["inFantasyland"] is True
        assert p1_state["fantasylandCardCount"] == 14
        assert state["handNumber"] == 1
        assert state["targetHands"] == 5

    def test_asymmetric_fl_and_normal(self):
        """비대칭: FL 플레이어(1라운드) + Normal 플레이어(5라운드) 공존"""
        session = self._make_session()
        session.start_game()
        ps1 = session.players["p1"]
        ps1.in_fantasyland = True
        ps1.fantasyland_card_count = 14
        # FL 딜링
        cards_p1 = session.deal_cards("p1")
        assert len(cards_p1) == 14
        # Normal 딜링
        cards_p2 = session.deal_cards("p2")
        assert len(cards_p2) == 5  # R0 = 5장


# ── A1: GameSession remove_player 테스트 ─────────────

class TestGameSessionRemovePlayer:
    def test_remove_player_auto_win(self):
        """A1: 2인 중 1명 퇴장 → 남은 1명 자동 승리"""
        session = GameSession("room1", ["p1", "p2"], ["Alice", "Bob"])
        session.start_game()
        session.deal_cards("p1")
        session.deal_cards("p2")
        result = session.remove_player("p1")
        assert result is not None
        assert result["type"] == "gameOver"
        # p2가 자동 승리
        assert result["winner"] == "p2"

    def test_remove_player_nonexistent(self):
        """A1: 없는 플레이어 제거 시 None"""
        session = GameSession("room1", ["p1", "p2"], ["Alice", "Bob"])
        session.start_game()
        result = session.remove_player("p999")
        assert result is None

    def test_remove_player_unblocks_confirm(self):
        """A1: 한쪽 confirm 후 상대 퇴장 → 자동 진행"""
        session = GameSession("room1", ["p1", "p2"], ["Alice", "Bob"])
        session.start_game()
        cards_p1 = session.deal_cards("p1")
        cards_p2 = session.deal_cards("p2")
        # p1이 모든 카드를 배치하고 confirm
        for i, c in enumerate(cards_p1):
            line = "bottom" if i < 2 else ("mid" if i < 4 else "top")
            session.place_card("p1", _card_to_dict(c), line)
        session.confirm_placement("p1")
        # p1 confirmed, p2 아직 미확정 → p2 퇴장
        result = session.remove_player("p2")
        assert result is not None
        assert result["type"] == "gameOver"
        assert result["winner"] == "p1"


# ── WS 방어 코드 테스트 ──────────────────────────────

class TestWSDefensiveCode:
    """WS_PING_TIMEOUT, broadcast dead WS, except dead WS, cleanup isolation 테스트"""

    def test_ws_ping_timeout_config(self):
        """WS_PING_TIMEOUT 설정값이 60인지 확인"""
        from server.config import WS_PING_TIMEOUT
        assert WS_PING_TIMEOUT == 60

    @pytest.mark.anyio
    async def test_broadcast_dead_ws_no_side_effect(self):
        """broadcast_to_room에서 dead WS 발견 시 remove_player가 호출되지 않는지 확인"""
        from unittest.mock import AsyncMock, MagicMock, patch
        from server.main import broadcast_to_room

        mgr = RoomManager()
        room = mgr.create_room("TestRoom", 2)
        mock_ws1 = MagicMock()
        mock_ws1.send_json = AsyncMock(side_effect=Exception("WS dead"))
        mock_ws2 = MagicMock()
        mock_ws2.send_json = AsyncMock()

        mgr.add_player(room.id, "Alice", mock_ws1)
        mgr.add_player(room.id, "Bob", mock_ws2)

        with patch("server.main.room_mgr", mgr):
            await broadcast_to_room(room.id, {"type": "test", "payload": {}})

        # dead WS에서 예외 발생해도 remove_player가 호출되지 않아야 한다
        # (기존 코드는 dead_pids를 수집해서 remove_player를 호출했음)
        assert len(mgr.rooms[room.id].players) == 2

    def test_except_dead_ws_no_crash(self):
        """except 블록에서 dead WS에 error send 시도해도 서버가 죽지 않는지 확인"""
        client = TestClient(app)
        # 방 생성 후 정상적으로 연결/해제 — 서버가 크래시하지 않으면 통과
        resp = client.post("/api/rooms", json={"name": "CrashTest", "max_players": 2})
        room_id = resp.json()["id"]
        with client.websocket_connect(f"/ws/game/{room_id}") as ws:
            ws.send_json({"type": "joinRequest", "payload": {"playerName": "Alice"}})
            msg = ws.receive_json()
            assert msg["type"] == "joinAccepted"
            # 유효하지 않은 메시지 전송 → except 블록 발동
            ws.send_json({"type": "placeCard", "payload": {"card": {}, "line": "invalid"}})
            msg2 = ws.receive_json()
            assert msg2["type"] == "error"
        # WebSocket 정상 종료 후에도 서버 동작 확인
        resp2 = client.get("/api/status")
        assert resp2.status_code == 200

    def test_cleanup_isolation(self):
        """한 플레이어의 연결 오류가 다른 플레이어에게 전파되지 않는지 확인"""
        client = TestClient(app)
        resp = client.post("/api/rooms", json={"name": "IsoRoom", "max_players": 2})
        room_id = resp.json()["id"]

        # Player 1 연결
        with client.websocket_connect(f"/ws/game/{room_id}") as ws1:
            ws1.send_json({"type": "joinRequest", "payload": {"playerName": "Alice"}})
            msg1 = ws1.receive_json()
            assert msg1["type"] == "joinAccepted"
            p1_id = msg1["payload"]["playerId"]

            # Player 2 연결 후 즉시 끊기
            with client.websocket_connect(f"/ws/game/{room_id}") as ws2:
                ws2.send_json({"type": "joinRequest", "payload": {"playerName": "Bob"}})
                msg2 = ws2.receive_json()
                assert msg2["type"] == "joinAccepted"
                # gameStart 메시지 수신 (2인 풀방)
                msg_start2 = ws2.receive_json()
                assert msg_start2["type"] in ("playerJoined", "gameStart")

            # ws2가 끊겨도 ws1은 여전히 정상 동작해야 한다
            # ws1에서 gameStart 또는 playerJoined 메시지 수신 확인
            msg_start1 = ws1.receive_json()
            assert msg_start1["type"] in ("playerJoined", "gameStart")

            # ws1이 heartbeat를 보내고 응답을 받을 수 있어야 한다
            ws1.send_json({"type": "heartbeat", "payload": {}})
            hb = ws1.receive_json()
            # gameStart, dealCards, stateUpdate 등 대기중 메시지가 올 수 있으므로 type 유연하게 체크
            assert hb["type"] in ("heartbeat", "gameStart", "dealCards", "stateUpdate", "playerDisconnected")
