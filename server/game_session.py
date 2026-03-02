import random
import sys
from dataclasses import dataclass, field
from pathlib import Path

# 프로젝트 루트를 sys.path에 추가하여 src/ import 가능하게 함
_project_root = str(Path(__file__).parent.parent)
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)

from src.board import OFCBoard
from src.card import Card, Rank, Suit
from src.hand import HandType, compare_hands, compare_hands_ofc, evaluate_hand


def _build_deck() -> list[Card]:
    """표준 52장 덱 생성"""
    deck = []
    for suit in Suit:
        for rank in Rank:
            deck.append(Card(rank=rank, suit=suit))
    return deck


def _card_to_dict(card: Card) -> dict:
    return {
        "rank": card.rank.value,
        "suit": card.suit.value,
        "rankName": card.rank.name.lower(),
        "suitName": card.suit.name.lower(),
    }


def _card_from_dict(data: dict) -> Card:
    return Card(rank=Rank(data["rank"]), suit=Suit(data["suit"]))


def _board_to_dict(board: OFCBoard, hide_cards: bool = False) -> dict:
    """보드 상태를 dict로 직렬화. hide_cards=True면 카드 내용 숨김."""
    if hide_cards:
        return {
            "top": [None] * len(board.top),
            "mid": [None] * len(board.mid),
            "bottom": [None] * len(board.bottom),
            "topCount": len(board.top),
            "midCount": len(board.mid),
            "bottomCount": len(board.bottom),
        }
    return {
        "top": [_card_to_dict(c) for c in board.top],
        "mid": [_card_to_dict(c) for c in board.mid],
        "bottom": [_card_to_dict(c) for c in board.bottom],
        "topCount": len(board.top),
        "midCount": len(board.mid),
        "bottomCount": len(board.bottom),
    }


@dataclass
class PlayerState:
    player_id: str
    name: str
    board: OFCBoard = field(default_factory=OFCBoard)
    hand: list = field(default_factory=list)  # 현재 들고 있는 카드
    discarded: list = field(default_factory=list)  # 이번 라운드 버린 카드
    placed_this_round: list = field(default_factory=list)  # 이번 라운드 배치한 카드
    confirmed: bool = False  # 이번 라운드 배치 확정 여부
    in_fantasyland: bool = False  # Fantasy Land 진입 여부
    fantasyland_card_count: int = 0  # FL 딜링 카드수 (14~17)


class GameSession:
    """방별 OFC Pineapple 게임 세션"""

    # OFC Pineapple 규칙:
    # R0: 5장 딜, 모두 배치 (버리기 없음)
    # R1~R4: 3장 딜, 2장 배치 + 1장 버리기

    def __init__(self, room_id: str, player_ids: list[str], player_names: list[str]):
        self.room_id = room_id
        self.deck: list[Card] = _build_deck()
        random.shuffle(self.deck)
        self.players: dict[str, PlayerState] = {}
        for pid, name in zip(player_ids, player_names):
            self.players[pid] = PlayerState(player_id=pid, name=name)
        self.current_round: int = 0  # 0~4
        self.phase: str = "waiting"  # waiting, dealing, placing, scoring, gameOver
        self.scores: dict[str, int] = {pid: 0 for pid in player_ids}
        self.hand_number: int = 1  # 현재 핸드 번호
        self.target_hands: int = 5  # 목표 핸드 수

    def start_game(self) -> dict:
        """게임 시작 → 초기 상태 반환"""
        self.phase = "dealing"
        self.current_round = 0
        return self.get_state()

    def deal_cards(self, player_id: str) -> list[Card]:
        """현재 라운드에 맞게 카드를 딜링한다.
        FL: fantasyland_card_count장, R0: 5장, R1~R4: 3장
        """
        ps = self.players.get(player_id)
        if ps is None:
            return []
        if ps.in_fantasyland:
            count = ps.fantasyland_card_count
        elif self.current_round == 0:
            count = 5
        else:
            count = 3
        if len(self.deck) < count:
            return []  # Not enough cards
        dealt = self.deck[:count]
        self.deck = self.deck[count:]
        ps.hand = list(dealt)
        ps.discarded = []
        ps.placed_this_round = []
        ps.confirmed = False
        self.phase = "placing"
        return dealt

    def place_card(self, player_id: str, card_data: dict, line: str) -> dict | None:
        """서버 검증 후 카드를 보드에 배치. 성공 시 상태 dict, 실패 시 None."""
        ps = self.players.get(player_id)
        if ps is None:
            return None
        if ps.confirmed:
            return None

        card = _card_from_dict(card_data)
        # 핸드에 해당 카드가 있는지 확인
        matching = [c for c in ps.hand if c.rank == card.rank and c.suit == card.suit]
        if not matching:
            return None

        # 라인 유효성 + 슬롯 확인
        try:
            if not ps.board.place_card(line, matching[0]):
                return None
        except ValueError:
            return None

        ps.hand.remove(matching[0])
        ps.placed_this_round.append(matching[0])
        return self.get_state(for_player=player_id)

    def discard_card(self, player_id: str, card_data: dict) -> dict | None:
        """카드를 버린다. R1~R4에서만 가능 (1장 버리기). FL은 R0도 허용."""
        ps = self.players.get(player_id)
        if ps is None:
            return None
        if ps.confirmed:
            return None
        if self.current_round == 0 and not ps.in_fantasyland:
            return None  # 비-FL은 R0 discard 금지

        card = _card_from_dict(card_data)
        matching = [c for c in ps.hand if c.rank == card.rank and c.suit == card.suit]
        if not matching:
            return None

        ps.hand.remove(matching[0])
        ps.discarded.append(matching[0])
        return self.get_state(for_player=player_id)

    def unplace_card(self, player_id: str, card_data: dict, line: str) -> dict | None:
        """배치된 카드를 되돌린다. 이번 라운드에 배치한 카드만 가능."""
        ps = self.players.get(player_id)
        if ps is None:
            return None
        if ps.confirmed:
            return None

        card = _card_from_dict(card_data)
        # 이번 라운드에 배치한 카드인지 확인
        matching = [c for c in ps.placed_this_round if c.rank == card.rank and c.suit == card.suit]
        if not matching:
            return None

        try:
            if not ps.board.remove_card(line, matching[0]):
                return None
        except ValueError:
            return None

        ps.placed_this_round.remove(matching[0])
        ps.hand.append(matching[0])
        return self.get_state(for_player=player_id)

    def undiscard_card(self, player_id: str, card_data: dict) -> dict | None:
        """버린 카드를 되돌린다. 이번 라운드에 버린 카드만 가능."""
        ps = self.players.get(player_id)
        if ps is None:
            return None
        if ps.confirmed:
            return None

        card = _card_from_dict(card_data)
        # 이번 라운드에 버린 카드인지 확인
        matching = [c for c in ps.discarded if c.rank == card.rank and c.suit == card.suit]
        if not matching:
            return None

        ps.discarded.remove(matching[0])
        ps.hand.append(matching[0])
        return self.get_state(for_player=player_id)

    def confirm_placement(self, player_id: str) -> dict:
        """배치 확정. FL: 13장 배치 + hand 비움, R0: 5장, R1~R4: 2+1."""
        ps = self.players.get(player_id)
        if ps is None:
            return {"error": "Player not found"}
        if ps.confirmed:
            return {"error": "Already confirmed"}

        if ps.in_fantasyland:
            # FL: 보드 13장 완전 배치 + 핸드 비움
            total_cards = len(ps.board.top) + len(ps.board.mid) + len(ps.board.bottom)
            if total_cards != 13 or len(ps.hand) != 0:
                return {"error": "FL: Must place exactly 13 cards"}
        elif self.current_round == 0:
            # R0: 5장 모두 배치해야 함
            if len(ps.placed_this_round) != 5 or len(ps.hand) != 0:
                return {"error": "R0: Must place all 5 cards"}
        else:
            # R1~R4: 2장 배치 + 1장 버리기
            if len(ps.placed_this_round) != 2 or len(ps.discarded) != 1:
                return {"error": "Must place 2 cards and discard 1"}
            if len(ps.hand) != 0:
                return {"error": "Must use all dealt cards"}

        ps.confirmed = True

        # 동시성 방어: 플레이어가 leaveGame으로 제거되어 1명만 남은 경우
        if len(self.players) <= 1:
            return self._score_game()
        # 모든 플레이어가 확정했는지 확인
        all_confirmed = all(p.confirmed for p in self.players.values())
        if all_confirmed:
            return self._advance_round()

        return self.get_state(for_player=player_id)

    def remove_player(self, player_id: str) -> dict | None:
        """플레이어를 게임에서 제거한다.

        - 없는 플레이어 → None
        - 남은 1명이면 자동 승리 결과(gameOver) 반환
        - 2명 이상이면 all_confirmed 재확인 후 진행 여부 반환
        """
        if player_id not in self.players:
            return None

        del self.players[player_id]
        self.scores.pop(player_id, None)

        remaining = list(self.players.keys())
        if len(remaining) == 1:
            winner_id = remaining[0]
            winner = self.players[winner_id]
            self.phase = "gameOver"
            return {
                "type": "gameOver",
                "winner": winner_id,
                "winnerName": winner.name,
                "reason": "opponent_left",
                "scores": {winner_id: 6},  # forfeit 6점
            }

        # 2명 이상 남은 경우: all_confirmed 재확인
        if all(p.confirmed for p in self.players.values()):
            return self._advance_round()

        return None

    def _advance_round(self) -> dict:
        """모든 플레이어 확정 후 다음 라운드로 진행"""
        if self.current_round >= 4:
            # 모든 라운드 완료 → 점수 계산
            return self._score_game()

        self.current_round += 1
        self.phase = "dealing"
        # 각 플레이어 라운드 상태 리셋
        for ps in self.players.values():
            ps.confirmed = False
            ps.placed_this_round = []
            ps.discarded = []
            ps.hand = []
        return {"roundAdvanced": True, "currentRound": self.current_round}

    def _score_game(self) -> dict:
        """게임 종료 시 라인별 비교 점수 계산. FL 감지 시 nextHand 반환."""
        self.phase = "scoring"
        player_list = list(self.players.values())

        # 2인 또는 3인 간 라인별 비교
        results = {}
        for i, p1 in enumerate(player_list):
            has_foul = p1.board.check_foul().has_foul
            royalty = 0 if has_foul else self._calculate_royalty(p1.board)
            results[p1.player_id] = {
                "name": p1.name,
                "totalScore": 0,
                "lineResults": {},
                "foul": has_foul,
                "royalty": royalty,
                "board": _board_to_dict(p1.board),
            }

        # 모든 쌍 비교
        for i in range(len(player_list)):
            for j in range(i + 1, len(player_list)):
                p1 = player_list[i]
                p2 = player_list[j]
                pair_score = self._compare_boards(p1.board, p2.board)
                results[p1.player_id]["totalScore"] += pair_score
                results[p2.player_id]["totalScore"] -= pair_score

        for pid, res in results.items():
            self.scores[pid] = res["totalScore"]

        # FL 진입/유지 확인
        any_fl = False
        for ps in player_list:
            if ps.in_fantasyland:
                # 기존 FL: 유지 여부 판정
                if self._check_fl_maintain(ps.board):
                    ps.fantasyland_card_count = self._get_fl_card_count(ps.board)
                    any_fl = True
                else:
                    ps.in_fantasyland = False
                    ps.fantasyland_card_count = 0
            else:
                # 신규 FL 진입
                if self._check_fantasyland(ps.board):
                    ps.in_fantasyland = True
                    ps.fantasyland_card_count = self._get_fl_card_count(ps.board)
                    any_fl = True

        if any_fl or self.hand_number < self.target_hands:
            return {
                "type": "nextHand",
                "results": results,
                "scores": self.scores,
                "handNumber": self.hand_number,
            }

        self.phase = "gameOver"
        return {
            "type": "gameOver",
            "results": results,
            "scores": self.scores,
        }

    def _check_fantasyland(self, board: OFCBoard) -> bool:
        """FL 진입 조건: Top QQ+ + no foul"""
        from src.board import check_fantasyland
        return check_fantasyland(board)

    def _get_fl_card_count(self, board: OFCBoard) -> int:
        """FL 카드수: QQ=14, KK=15, AA=16, Trips=17"""
        from collections import Counter
        top_hand = evaluate_hand(board.top)
        if top_hand.hand_type == HandType.THREE_OF_A_KIND:
            return 17
        rank_counts = Counter(c.rank for c in board.top)
        pair_ranks = [r for r, cnt in rank_counts.items() if cnt >= 2]
        if pair_ranks:
            max_pair = max(pair_ranks)
            if max_pair == Rank.ACE:
                return 16
            if max_pair == Rank.KING:
                return 15
        return 14

    def _check_fl_maintain(self, board: OFCBoard) -> bool:
        """FL 유지 조건: Top Trips OR Mid/Bottom 4K+"""
        if not board.is_full():
            return False
        if board.check_foul().has_foul:
            return False
        top = evaluate_hand(board.top)
        mid = evaluate_hand(board.mid)
        bot = evaluate_hand(board.bottom)
        if top.hand_type == HandType.THREE_OF_A_KIND:
            return True
        if mid.hand_type >= HandType.FOUR_OF_A_KIND:
            return True
        if bot.hand_type >= HandType.FOUR_OF_A_KIND:
            return True
        return False

    def _start_next_hand(self):
        """다음 핸드 시작: 덱 리셋, 보드 리셋, hand_number++"""
        self.deck = _build_deck()
        random.shuffle(self.deck)
        self.hand_number += 1
        self.current_round = 0
        self.phase = "dealing"
        for ps in self.players.values():
            ps.board = OFCBoard()
            ps.hand = []
            ps.discarded = []
            ps.placed_this_round = []
            ps.confirmed = False
            # in_fantasyland과 fantasyland_card_count는 유지!

    @staticmethod
    def _calculate_royalty(board: OFCBoard) -> int:
        """보드의 Royalty 점수 계산 (PRD §2.7)"""
        from collections import Counter

        total = 0

        # Bottom (5장): Straight +2, Flush +4, FH +6, 4K +10, SF +15, RF +25
        if board.bottom:
            h = evaluate_hand(board.bottom)
            bottom_royalty = {
                HandType.STRAIGHT: 2, HandType.FLUSH: 4,
                HandType.FULL_HOUSE: 6, HandType.FOUR_OF_A_KIND: 10,
                HandType.STRAIGHT_FLUSH: 15, HandType.ROYAL_FLUSH: 25,
            }
            total += bottom_royalty.get(h.hand_type, 0)

        # Mid (5장): 3K +2, Straight +4, Flush +8, FH +12, 4K +20, SF +30, RF +50
        if board.mid:
            h = evaluate_hand(board.mid)
            mid_royalty = {
                HandType.THREE_OF_A_KIND: 2, HandType.STRAIGHT: 4,
                HandType.FLUSH: 8, HandType.FULL_HOUSE: 12,
                HandType.FOUR_OF_A_KIND: 20, HandType.STRAIGHT_FLUSH: 30,
                HandType.ROYAL_FLUSH: 50,
            }
            total += mid_royalty.get(h.hand_type, 0)

        # Top (3장): 66 +1 ~ AA +9, Trip 2s +10 ~ Trip Aces +22
        if board.top:
            h = evaluate_hand(board.top)
            rank_counts = Counter(c.rank for c in board.top)
            if h.hand_type == HandType.THREE_OF_A_KIND:
                trip_rank = next(r for r, cnt in rank_counts.items() if cnt == 3)
                total += trip_rank.value + 8  # 2→10, 3→11, ..., A(14)→22
            elif h.hand_type == HandType.ONE_PAIR:
                pair_rank = next(r for r, cnt in rank_counts.items() if cnt == 2)
                if pair_rank.value >= 6:  # 66+ only
                    total += pair_rank.value - 5  # 6→1, 7→2, ..., A(14)→9

        return total

    def _compare_boards(self, board_a: OFCBoard, board_b: OFCBoard) -> int:
        """두 보드 간 OFC 스코어링. +: a 이기는 라인 수 기준"""
        foul_a = board_a.check_foul()
        foul_b = board_b.check_foul()
        has_foul_a = foul_a.has_foul
        has_foul_b = foul_b.has_foul

        # Foul 처리 (PRD §2.4)
        if has_foul_a and has_foul_b:
            return 0  # 양측 Foul → 상쇄
        if has_foul_a:
            royalty_b = self._calculate_royalty(board_b)
            return -6 - royalty_b  # Foul 패널티 6점 + 상대 Royalty
        if has_foul_b:
            royalty_a = self._calculate_royalty(board_a)
            return 6 + royalty_a  # Foul 패널티 6점 + 본인 Royalty

        # 정상 라인별 비교
        score = 0
        for line in ["bottom", "mid", "top"]:
            cards_a = getattr(board_a, line)
            cards_b = getattr(board_b, line)
            if cards_a and cards_b:
                h_a = evaluate_hand(cards_a)
                h_b = evaluate_hand(cards_b)
                cmp = compare_hands_ofc(h_a, h_b)
                score += cmp

        # 스쿠프 보너스: 3:0 → +3 추가 (총 6)
        if score == 3:
            score += 3
        elif score == -3:
            score -= 3

        # Royalty 차이 (PRD §2.6: 최종 = 라인 점수 + Scoop + Royalty 차이)
        royalty_a = self._calculate_royalty(board_a)
        royalty_b = self._calculate_royalty(board_b)
        score += royalty_a - royalty_b

        return score

    def get_state(self, for_player: str | None = None) -> dict:
        """게임 상태 직렬화. 상대 핸드는 숨김. FL 보드도 숨김."""
        players_state = {}
        for pid, ps in self.players.items():
            is_self = (for_player == pid)
            # FL 상대 보드 숨김
            hide = (not is_self and ps.in_fantasyland)
            player_dict = {
                "name": ps.name,
                "board": _board_to_dict(ps.board, hide_cards=hide),
                "handCount": len(ps.hand),
                "confirmed": ps.confirmed,
                "inFantasyland": ps.in_fantasyland,
                "fantasylandCardCount": ps.fantasyland_card_count,
            }
            # FL 상대의 confirmed 상태 숨김 (정보 노출 방지)
            if not is_self and hide:
                player_dict.pop("confirmed", None)
            if is_self:
                player_dict["hand"] = [_card_to_dict(c) for c in ps.hand]
            players_state[pid] = player_dict

        return {
            "roomId": self.room_id,
            "phase": self.phase,
            "currentRound": self.current_round,
            "players": players_state,
            "scores": self.scores,
            "handNumber": self.hand_number,
            "targetHands": self.target_hands,
        }
