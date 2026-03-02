"""수트 시너지 4종 3단계 효과 테스트 (M1)"""
import pytest
from src.card import Card, Rank, Suit
from src.board import OFCBoard

# 헬퍼: n장의 특정 수트 카드를 가진 보드 생성
def board_with_suit(suit: Suit, count: int) -> OFCBoard:
    board = OFCBoard()
    ranks = list(Rank)
    for i in range(min(count, 13)):
        if len(board.bottom) < 5:
            board.bottom.append(Card(suit=suit, rank=ranks[i]))
        elif len(board.mid) < 5:
            board.mid.append(Card(suit=suit, rank=ranks[i]))
        else:
            board.top.append(Card(suit=suit, rank=ranks[i]))
    return board

class TestGetSuitSynergyLevel:
    def test_spade_0_cards_level_0(self):
        board = OFCBoard()
        from src.combat import get_suit_synergy_level
        assert get_suit_synergy_level(board, Suit.SPADE) == 0

    def test_spade_1_card_level_0(self):
        board = board_with_suit(Suit.SPADE, 1)
        from src.combat import get_suit_synergy_level
        assert get_suit_synergy_level(board, Suit.SPADE) == 0

    def test_spade_2_cards_level_1(self):
        board = board_with_suit(Suit.SPADE, 2)
        from src.combat import get_suit_synergy_level
        assert get_suit_synergy_level(board, Suit.SPADE) == 1

    def test_spade_3_cards_level_1(self):
        board = board_with_suit(Suit.SPADE, 3)
        from src.combat import get_suit_synergy_level
        assert get_suit_synergy_level(board, Suit.SPADE) == 1

    def test_spade_4_cards_level_2(self):
        board = board_with_suit(Suit.SPADE, 4)
        from src.combat import get_suit_synergy_level
        assert get_suit_synergy_level(board, Suit.SPADE) == 2

    def test_spade_5_cards_level_2(self):
        board = board_with_suit(Suit.SPADE, 5)
        from src.combat import get_suit_synergy_level
        assert get_suit_synergy_level(board, Suit.SPADE) == 2

    def test_spade_6_cards_level_3(self):
        board = board_with_suit(Suit.SPADE, 6)
        from src.combat import get_suit_synergy_level
        assert get_suit_synergy_level(board, Suit.SPADE) == 3

    def test_heart_synergy_level(self):
        board = board_with_suit(Suit.HEART, 4)
        from src.combat import get_suit_synergy_level
        assert get_suit_synergy_level(board, Suit.HEART) == 2

    def test_diamond_synergy_level(self):
        board = board_with_suit(Suit.DIAMOND, 6)
        from src.combat import get_suit_synergy_level
        assert get_suit_synergy_level(board, Suit.DIAMOND) == 3

    def test_club_synergy_level(self):
        board = board_with_suit(Suit.CLUB, 2)
        from src.combat import get_suit_synergy_level
        assert get_suit_synergy_level(board, Suit.CLUB) == 1

    def test_mixed_suits_each_level_0(self):
        board = OFCBoard()
        suits = [Suit.SPADE, Suit.HEART, Suit.DIAMOND, Suit.CLUB]
        ranks = list(Rank)
        for i, s in enumerate(suits):
            board.bottom.append(Card(suit=s, rank=ranks[i]))
        from src.combat import get_suit_synergy_level
        for s in suits:
            assert get_suit_synergy_level(board, s) == 0

    def test_all_cards_same_suit_level_3(self):
        board = board_with_suit(Suit.SPADE, 13)
        from src.combat import get_suit_synergy_level
        assert get_suit_synergy_level(board, Suit.SPADE) == 3


class TestClubSynergyRollCost:
    def test_no_synergy_roll_cost_2(self):
        from src.economy import Player
        p = Player(name="A")
        # ♣ 시너지 없음 → 기본 2골드
        assert p.calc_roll_cost(club_synergy_level=0) == 2

    def test_club_level1_roll_cost_2(self):
        from src.economy import Player
        p = Player(name="A")
        assert p.calc_roll_cost(club_synergy_level=1) == 2

    def test_club_level2_roll_cost_1(self):
        from src.economy import Player
        p = Player(name="A")
        assert p.calc_roll_cost(club_synergy_level=2) == 1

    def test_club_level3_roll_cost_0(self):
        from src.economy import Player
        p = Player(name="A")
        assert p.calc_roll_cost(club_synergy_level=3) == 0


class TestSpadeWinOnTie:
    """♠ 전사 시너지: 동률 라인에서 ♠ 시너지 레벨 우위 → 자동 승리"""
    def test_spade_synergy_wins_tie(self):
        """♠ 시너지 레벨 1+ 보유 플레이어가 동률 라인에서 승리"""
        from src.combat import get_suit_synergy_level, apply_spade_synergy_tiebreak
        from src.board import OFCBoard
        attacker_board = board_with_suit(Suit.SPADE, 2)  # ♠ 레벨 1
        defender_board = OFCBoard()  # ♠ 레벨 0
        # 동률일 때 attacker 승리
        result = apply_spade_synergy_tiebreak(attacker_board, defender_board)
        assert result == 1  # attacker 승리

    def test_no_spade_synergy_no_tiebreak(self):
        from src.combat import apply_spade_synergy_tiebreak
        attacker_board = OFCBoard()
        defender_board = OFCBoard()
        result = apply_spade_synergy_tiebreak(attacker_board, defender_board)
        assert result == 0  # 동률 유지

    def test_both_have_spade_higher_level_wins(self):
        from src.combat import apply_spade_synergy_tiebreak
        attacker_board = board_with_suit(Suit.SPADE, 4)  # 레벨 2
        defender_board = board_with_suit(Suit.SPADE, 2)  # 레벨 1
        result = apply_spade_synergy_tiebreak(attacker_board, defender_board)
        assert result == 1  # attacker 승리 (레벨 2 > 1)

    def test_defender_higher_spade_loses_attacker(self):
        from src.combat import apply_spade_synergy_tiebreak
        attacker_board = board_with_suit(Suit.SPADE, 2)  # 레벨 1
        defender_board = board_with_suit(Suit.SPADE, 4)  # 레벨 2
        result = apply_spade_synergy_tiebreak(attacker_board, defender_board)
        assert result == -1  # defender 승리
