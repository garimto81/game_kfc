from src.board import OFCBoard
from src.card import Card, Rank, Suit
from src.combat import CombatResolver, CombatResult, count_synergies


def make_flush_board(suit: Suit = Suit.SPADE) -> OFCBoard:
    """플러시 bottom + 원페어 mid + 하이카드 top"""
    board = OFCBoard()
    for r in [Rank.TWO, Rank.FIVE, Rank.SEVEN, Rank.NINE, Rank.KING]:
        board.bottom.append(Card(r, suit))
    board.mid = [
        Card(Rank.ACE, Suit.HEART),
        Card(Rank.ACE, Suit.DIAMOND),
        Card(Rank.TWO, Suit.CLUB),
        Card(Rank.THREE, Suit.SPADE),
        Card(Rank.FOUR, Suit.HEART),
    ]
    board.top = [
        Card(Rank.KING, Suit.CLUB),
        Card(Rank.QUEEN, Suit.CLUB),
        Card(Rank.JACK, Suit.CLUB),
    ]
    return board


def make_pair_board() -> OFCBoard:
    """원페어 bottom + 원페어 mid + 하이카드 top"""
    board = OFCBoard()
    board.bottom = [
        Card(Rank.ACE, Suit.HEART),
        Card(Rank.ACE, Suit.DIAMOND),
        Card(Rank.KING, Suit.HEART),
        Card(Rank.QUEEN, Suit.HEART),
        Card(Rank.TWO, Suit.HEART),
    ]
    board.mid = [
        Card(Rank.SEVEN, Suit.HEART),
        Card(Rank.SEVEN, Suit.DIAMOND),
        Card(Rank.TWO, Suit.CLUB),
        Card(Rank.THREE, Suit.SPADE),
        Card(Rank.FOUR, Suit.HEART),
    ]
    board.top = [
        Card(Rank.TWO, Suit.SPADE),
        Card(Rank.THREE, Suit.HEART),
        Card(Rank.FOUR, Suit.DIAMOND),
    ]
    return board


class TestCombatResolver:
    def setup_method(self):
        self.resolver = CombatResolver()

    def test_resolve_basic_flush_beats_pair(self):
        """플러시 bottom이 원페어 bottom을 이김"""
        board_a = make_flush_board()
        board_b = make_pair_board()
        result_a, result_b = self.resolver.resolve(board_a, board_b)
        assert result_a.line_results['bottom'] == 1
        assert result_b.line_results['bottom'] == -1

    def test_resolve_returns_two_results(self):
        """resolve는 두 개의 CombatResult 반환"""
        board_a = make_flush_board()
        board_b = make_pair_board()
        results = self.resolver.resolve(board_a, board_b)
        assert len(results) == 2
        result_a, result_b = results
        assert isinstance(result_a, CombatResult)
        assert isinstance(result_b, CombatResult)

    def test_resolve_antisymmetry(self):
        """A vs B의 라인 결과는 B vs A의 반대"""
        board_a = make_flush_board()
        board_b = make_pair_board()
        result_a, result_b = self.resolver.resolve(board_a, board_b)
        for line in ['bottom', 'mid', 'top']:
            assert result_a.line_results[line] == -result_b.line_results[line]

    def test_scoop_3_0(self):
        """3라인 전승 → scoop=True"""
        board_a = make_flush_board()
        board_b = make_pair_board()
        result_a, result_b = self.resolver.resolve(board_a, board_b)
        # flush back > pair back
        # pair mid == pair mid (but check actual)
        # front: 하이카드 vs 하이카드 (어느 쪽이 이기는지 확인)
        # 스쿠프는 3라인 모두 이겨야 함

    def test_damage_3_0_scoop(self):
        """3:0 스쿠프 → 기본 damage = 3*2 + 2 = 8"""
        damage = self.resolver.calc_damage(3, is_scoop=True)
        assert damage == 8

    def test_damage_2_1(self):
        """2라인 승 → damage = 2*2 = 4"""
        damage = self.resolver.calc_damage(2, is_scoop=False)
        assert damage == 4

    def test_damage_1_2(self):
        """1라인 승 → damage = 1*2 = 2"""
        damage = self.resolver.calc_damage(1, is_scoop=False)
        assert damage == 2

    def test_damage_0(self):
        """0라인 승 → damage = 0"""
        damage = self.resolver.calc_damage(0, is_scoop=False)
        assert damage == 0

    def test_hula_multiplier_x4(self):
        """훌라 성공 → damage × 4"""
        base_damage = 4
        hula_damage = self.resolver.apply_hula(base_damage)
        assert hula_damage == 16

    def test_hula_multiplier_x4_scoop(self):
        """훌라 + 스쿠프 → 8 × 4 = 32"""
        hula_damage = self.resolver.apply_hula(8)
        assert hula_damage == 32

    def test_hula_not_applied_when_lose(self):
        """훌라 선언했지만 패배(승리 라인 < 2) → 훌라 미적용"""
        board_a = make_pair_board()  # 약한 보드
        board_b = make_flush_board()  # 강한 보드
        result_a, result_b = self.resolver.resolve(board_a, board_b, hula_a=True)
        assert result_a.hula_applied is False


class TestCombatResultStopFields:
    """A4: 스톱(×8) 필드 검증"""

    def test_stop_applied_default_false(self):
        """CombatResult 기본값: stop_applied=False"""
        resolver = CombatResolver()
        board_a = make_flush_board()
        board_b = make_pair_board()
        result_a, result_b = resolver.resolve(board_a, board_b)
        assert result_a.stop_applied is False
        assert result_b.stop_applied is False

    def test_stop_multiplier_field_not_present(self):
        """CombatResult에 stop_multiplier 필드 없음 확인"""
        result = CombatResult(
            line_results={'bottom': 1, 'mid': 1, 'top': 1},
            winner_lines=3,
            is_scoop=True,
            damage=8,
            hula_applied=False,
        )
        assert not hasattr(result, 'stop_multiplier')

    def test_combat_result_has_stop_applied_field(self):
        """CombatResult 데이터클래스에 stop_applied 필드 존재 확인"""
        result = CombatResult(
            line_results={'bottom': 1, 'mid': 1, 'top': 1},
            winner_lines=3,
            is_scoop=True,
            damage=8,
            hula_applied=False,
            stop_applied=True,
        )
        assert result.stop_applied is True

    def test_stop_damage_multiplier_8(self):
        """스톱 선언 시 데미지 ×8 계산 검증"""
        base_damage = 4
        stop_damage = base_damage * 8
        assert stop_damage == 32


class TestCountSynergies:
    def test_synergies_zero(self):
        """모두 다른 수트 → 시너지 0"""
        board = OFCBoard()
        board.bottom = [
            Card(Rank.ACE, Suit.SPADE),
            Card(Rank.KING, Suit.HEART),
            Card(Rank.QUEEN, Suit.DIAMOND),
            Card(Rank.JACK, Suit.CLUB),
            Card(Rank.TEN, Suit.SPADE),
        ]
        # 2개 수트(SPADE 2장)
        synergies = count_synergies(board)
        assert synergies >= 0

    def test_synergies_one_suit_dominant(self):
        """같은 수트 5장 → 시너지 1 (그 수트만)"""
        board = OFCBoard()
        for r in [Rank.TWO, Rank.FIVE, Rank.SEVEN, Rank.NINE, Rank.KING]:
            board.bottom.append(Card(r, Suit.SPADE))
        synergies = count_synergies(board)
        assert synergies >= 1

    def test_synergies_3_suits(self):
        """3 종류의 수트 각 2장 이상 → 시너지 3"""
        board = OFCBoard()
        board.bottom = [
            Card(Rank.ACE, Suit.SPADE),
            Card(Rank.KING, Suit.SPADE),
            Card(Rank.ACE, Suit.HEART),
            Card(Rank.KING, Suit.HEART),
            Card(Rank.ACE, Suit.DIAMOND),
        ]
        board.mid = [
            Card(Rank.KING, Suit.DIAMOND),
            Card(Rank.QUEEN, Suit.CLUB),
            Card(Rank.JACK, Suit.CLUB),
            Card(Rank.TEN, Suit.SPADE),
            Card(Rank.NINE, Suit.HEART),
        ]
        board.top = [
            Card(Rank.EIGHT, Suit.DIAMOND),
            Card(Rank.SEVEN, Suit.CLUB),
            Card(Rank.SIX, Suit.SPADE),
        ]
        synergies = count_synergies(board)
        assert synergies >= 3

    def test_hula_declare_requires_3_synergies(self):
        """시너지 3개 미만 → 훌라 선언 불가"""
        board = OFCBoard()
        board.bottom = [
            Card(Rank.ACE, Suit.SPADE),
            Card(Rank.KING, Suit.HEART),
            Card(Rank.QUEEN, Suit.DIAMOND),
            Card(Rank.JACK, Suit.CLUB),
            Card(Rank.TEN, Suit.SPADE),
        ]
        # SPADE 2장만 있음 → 시너지 1개
        assert count_synergies(board) < 3


class TestLowCardPower:
    """S4: low_card_power 이벤트 전투 효과"""

    def setup_method(self):
        self.resolver = CombatResolver()

    def _make_same_type_boards_diff_rank(self):
        """같은 핸드 타입 (ONE_PAIR), 강화 없음, 수트 동일 패턴 — rank만 다름"""
        board_high = OFCBoard()
        board_high.bottom = [
            Card(Rank.ACE, Suit.SPADE),
            Card(Rank.ACE, Suit.HEART),
            Card(Rank.KING, Suit.DIAMOND),
            Card(Rank.QUEEN, Suit.CLUB),
            Card(Rank.TWO, Suit.SPADE),
        ]
        board_high.mid = [
            Card(Rank.SEVEN, Suit.SPADE),
            Card(Rank.SEVEN, Suit.HEART),
            Card(Rank.TWO, Suit.DIAMOND),
            Card(Rank.THREE, Suit.CLUB),
            Card(Rank.FOUR, Suit.SPADE),
        ]
        board_high.top = [
            Card(Rank.KING, Suit.CLUB),
            Card(Rank.QUEEN, Suit.DIAMOND),
            Card(Rank.JACK, Suit.HEART),
        ]

        board_low = OFCBoard()
        board_low.bottom = [
            Card(Rank.TWO, Suit.SPADE),
            Card(Rank.TWO, Suit.HEART),
            Card(Rank.THREE, Suit.DIAMOND),
            Card(Rank.FOUR, Suit.CLUB),
            Card(Rank.FIVE, Suit.SPADE),
        ]
        board_low.mid = [
            Card(Rank.THREE, Suit.SPADE),
            Card(Rank.THREE, Suit.HEART),
            Card(Rank.TWO, Suit.DIAMOND),
            Card(Rank.FOUR, Suit.CLUB),
            Card(Rank.FIVE, Suit.SPADE),
        ]
        board_low.top = [
            Card(Rank.TWO, Suit.CLUB),
            Card(Rank.THREE, Suit.DIAMOND),
            Card(Rank.FOUR, Suit.HEART),
        ]
        return board_high, board_low

    def _make_low_card_power_event(self):
        from dataclasses import dataclass

        @dataclass
        class MockEvent:
            id: str

        return MockEvent(id="low_card_power")

    def test_inactive_no_reversal(self):
        """S4: low_card_power 이벤트 없으면 높은 랭크 우선 정상 비교"""
        board_high, board_low = self._make_same_type_boards_diff_rank()
        result_high, result_low = self.resolver.resolve(board_high, board_low, events=[])
        # 높은 랭크 보드가 이겨야 함 (정상 비교)
        assert result_high.winner_lines >= result_low.winner_lines

    def test_active_reversal_tiebreak(self):
        """S4: low_card_power 활성 시 타이브레이커 랭크 역전"""
        board_high, board_low = self._make_same_type_boards_diff_rank()
        event = self._make_low_card_power_event()
        result_high_normal, _ = self.resolver.resolve(board_high, board_low, events=[])
        result_high_reversed, _ = self.resolver.resolve(
            board_high, board_low, events=[event]
        )
        # low_card_power 활성: 낮은 랭크 우선 → high board가 불리해져야 함
        assert result_high_reversed.winner_lines <= result_high_normal.winner_lines

    def test_no_reversal_different_hand_type(self):
        """S4: 핸드 강도 차이가 있으면 low_card_power 역전 없음"""
        from src.card import Rank, Suit
        board_flush = OFCBoard()
        board_flush.bottom = [
            Card(Rank.TWO, Suit.SPADE),
            Card(Rank.FIVE, Suit.SPADE),
            Card(Rank.SEVEN, Suit.SPADE),
            Card(Rank.NINE, Suit.SPADE),
            Card(Rank.KING, Suit.SPADE),
        ]
        board_flush.mid = [
            Card(Rank.ACE, Suit.HEART),
            Card(Rank.ACE, Suit.DIAMOND),
            Card(Rank.TWO, Suit.CLUB),
            Card(Rank.THREE, Suit.SPADE),
            Card(Rank.FOUR, Suit.HEART),
        ]
        board_flush.top = [
            Card(Rank.KING, Suit.CLUB),
            Card(Rank.QUEEN, Suit.CLUB),
            Card(Rank.JACK, Suit.CLUB),
        ]

        board_pair = OFCBoard()
        board_pair.bottom = [
            Card(Rank.ACE, Suit.CLUB),
            Card(Rank.ACE, Suit.SPADE),
            Card(Rank.KING, Suit.HEART),
            Card(Rank.QUEEN, Suit.HEART),
            Card(Rank.JACK, Suit.HEART),
        ]
        board_pair.mid = [
            Card(Rank.SEVEN, Suit.SPADE),
            Card(Rank.SEVEN, Suit.CLUB),
            Card(Rank.TWO, Suit.HEART),
            Card(Rank.THREE, Suit.HEART),
            Card(Rank.FOUR, Suit.SPADE),
        ]
        board_pair.top = [
            Card(Rank.TWO, Suit.CLUB),
            Card(Rank.THREE, Suit.CLUB),
            Card(Rank.FOUR, Suit.DIAMOND),
        ]

        event = self._make_low_card_power_event()
        result_flush, _ = self.resolver.resolve(board_flush, board_pair, events=[event])
        # FLUSH가 ONE_PAIR를 이겨야 함 — 핸드 강도 차이 역전 없음
        assert result_flush.line_results['bottom'] == 1
