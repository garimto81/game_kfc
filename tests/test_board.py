from src.board import FoulResult, OFCBoard, check_fantasyland
from src.card import Card, Rank, Suit


class TestOFCBoardPlacement:
    def test_place_card_bottom_success(self):
        board = OFCBoard()
        card = Card(Rank.ACE, Suit.SPADE)
        assert board.place_card('bottom', card) is True
        assert card in board.bottom

    def test_place_card_mid_success(self):
        board = OFCBoard()
        card = Card(Rank.KING, Suit.HEART)
        assert board.place_card('mid', card) is True
        assert card in board.mid

    def test_place_card_top_success(self):
        board = OFCBoard()
        card = Card(Rank.QUEEN, Suit.DIAMOND)
        assert board.place_card('top', card) is True
        assert card in board.top

    def test_place_card_bottom_over_limit(self):
        """bottom 5장 초과 시 False"""
        board = OFCBoard()
        for i in range(5):
            board.place_card('bottom', Card(Rank(i + 2), Suit.SPADE))
        assert board.place_card('bottom', Card(Rank.ACE, Suit.HEART)) is False

    def test_place_card_mid_over_limit(self):
        """mid 5장 초과 시 False"""
        board = OFCBoard()
        for i in range(5):
            board.place_card('mid', Card(Rank(i + 2), Suit.HEART))
        assert board.place_card('mid', Card(Rank.ACE, Suit.SPADE)) is False

    def test_place_card_top_over_limit(self):
        """top 3장 초과 시 False"""
        board = OFCBoard()
        for i in range(3):
            board.place_card('top', Card(Rank(i + 2), Suit.SPADE))
        assert board.place_card('top', Card(Rank.ACE, Suit.HEART)) is False

    def test_is_full_true(self):
        board = OFCBoard()
        for r in [Rank.TWO, Rank.THREE, Rank.FOUR]:
            board.place_card('top', Card(r, Suit.SPADE))
        for r in [Rank.FIVE, Rank.SIX, Rank.SEVEN, Rank.EIGHT, Rank.NINE]:
            board.place_card('mid', Card(r, Suit.HEART))
        for r in [Rank.TEN, Rank.JACK, Rank.QUEEN, Rank.KING, Rank.ACE]:
            board.place_card('bottom', Card(r, Suit.DIAMOND))
        assert board.is_full() is True

    def test_is_full_false_partial(self):
        board = OFCBoard()
        board.place_card('bottom', Card(Rank.ACE, Suit.SPADE))
        assert board.is_full() is False

    def test_remove_card_success(self):
        board = OFCBoard()
        card = Card(Rank.ACE, Suit.SPADE)
        board.place_card('bottom', card)
        assert board.remove_card('bottom', card) is True
        assert card not in board.bottom

    def test_remove_card_not_present(self):
        board = OFCBoard()
        card = Card(Rank.ACE, Suit.SPADE)
        assert board.remove_card('bottom', card) is False


class TestFoulDetection:
    def test_no_foul_normal_bottom_gt_mid_gt_top(self):
        """정상: Bottom(플러시) > Mid(원페어) > Top(하이카드)"""
        board = OFCBoard()
        # bottom: 플러시
        for r in [Rank.TWO, Rank.FIVE, Rank.SEVEN, Rank.NINE, Rank.KING]:
            board.bottom.append(Card(r, Suit.SPADE))
        # mid: 원페어
        board.mid = [
            Card(Rank.ACE, Suit.HEART),
            Card(Rank.ACE, Suit.DIAMOND),
            Card(Rank.KING, Suit.HEART),
            Card(Rank.QUEEN, Suit.HEART),
            Card(Rank.TWO, Suit.HEART),
        ]
        # top: 하이카드
        board.top = [
            Card(Rank.KING, Suit.CLUB),
            Card(Rank.QUEEN, Suit.CLUB),
            Card(Rank.JACK, Suit.CLUB),
        ]
        result = board.check_foul()
        assert result.has_foul is False
        assert result.foul_lines == []

    def test_no_foul_equal_hands(self):
        """Bottom>=Mid>=Top (kicker 포함 정상 순서) -> Foul 없음"""
        board = OFCBoard()
        # bottom: 하이카드 (A-high, 가장 강함)
        board.bottom = [
            Card(Rank.ACE, Suit.SPADE),
            Card(Rank.KING, Suit.HEART),
            Card(Rank.QUEEN, Suit.DIAMOND),
            Card(Rank.JACK, Suit.CLUB),
            Card(Rank.NINE, Suit.SPADE),
        ]
        # mid: 하이카드 (T-high, 중간)
        board.mid = [
            Card(Rank.TEN, Suit.SPADE),
            Card(Rank.EIGHT, Suit.HEART),
            Card(Rank.SEVEN, Suit.DIAMOND),
            Card(Rank.SIX, Suit.CLUB),
            Card(Rank.FIVE, Suit.SPADE),
        ]
        # top: 하이카드 (9-high, 가장 약함)
        board.top = [
            Card(Rank.FOUR, Suit.SPADE),
            Card(Rank.THREE, Suit.CLUB),
            Card(Rank.TWO, Suit.HEART),
        ]
        result = board.check_foul()
        assert result.has_foul is False

    def test_foul_bottom_weaker_than_mid(self):
        """폴: Bottom(원페어) < Mid(플러시)"""
        board = OFCBoard()
        board.bottom = [
            Card(Rank.ACE, Suit.SPADE),
            Card(Rank.ACE, Suit.HEART),
            Card(Rank.TWO, Suit.CLUB),
            Card(Rank.THREE, Suit.DIAMOND),
            Card(Rank.FOUR, Suit.SPADE),
        ]
        board.mid = [
            Card(Rank.TWO, Suit.HEART),
            Card(Rank.FIVE, Suit.HEART),
            Card(Rank.SEVEN, Suit.HEART),
            Card(Rank.NINE, Suit.HEART),
            Card(Rank.KING, Suit.HEART),
        ]
        board.top = [
            Card(Rank.TWO, Suit.SPADE),
            Card(Rank.THREE, Suit.SPADE),
            Card(Rank.FOUR, Suit.CLUB),
        ]
        result = board.check_foul()
        assert result.has_foul is True
        assert 'bottom' in result.foul_lines

    def test_foul_mid_weaker_than_top(self):
        """폴: Mid(하이카드) < Top(원페어)"""
        board = OFCBoard()
        # bottom: 투페어
        board.bottom = [
            Card(Rank.ACE, Suit.SPADE),
            Card(Rank.ACE, Suit.HEART),
            Card(Rank.KING, Suit.SPADE),
            Card(Rank.KING, Suit.HEART),
            Card(Rank.TWO, Suit.CLUB),
        ]
        # mid: 하이카드
        board.mid = [
            Card(Rank.ACE, Suit.DIAMOND),
            Card(Rank.KING, Suit.DIAMOND),
            Card(Rank.QUEEN, Suit.DIAMOND),
            Card(Rank.JACK, Suit.CLUB),
            Card(Rank.NINE, Suit.CLUB),
        ]
        # top: 원페어 (mid보다 강함 → Foul)
        board.top = [
            Card(Rank.QUEEN, Suit.SPADE),
            Card(Rank.QUEEN, Suit.HEART),
            Card(Rank.TWO, Suit.DIAMOND),
        ]
        result = board.check_foul()
        assert result.has_foul is True
        assert 'mid' in result.foul_lines

    def test_foul_both_lines(self):
        """Bottom < Mid AND Mid < Top → 두 라인 폴"""
        board = OFCBoard()
        # bottom: 하이카드
        board.bottom = [
            Card(Rank.TWO, Suit.SPADE),
            Card(Rank.THREE, Suit.HEART),
            Card(Rank.FIVE, Suit.DIAMOND),
            Card(Rank.SEVEN, Suit.CLUB),
            Card(Rank.NINE, Suit.SPADE),
        ]
        # mid: 원페어
        board.mid = [
            Card(Rank.ACE, Suit.SPADE),
            Card(Rank.ACE, Suit.HEART),
            Card(Rank.TWO, Suit.CLUB),
            Card(Rank.THREE, Suit.DIAMOND),
            Card(Rank.FOUR, Suit.SPADE),
        ]
        # top: 스리카인드 (mid보다 강함 → Foul)
        board.top = [
            Card(Rank.KING, Suit.SPADE),
            Card(Rank.KING, Suit.HEART),
            Card(Rank.KING, Suit.DIAMOND),
        ]
        result = board.check_foul()
        assert result.has_foul is True
        assert 'bottom' in result.foul_lines
        assert 'mid' in result.foul_lines

    def test_foul_result_dataclass(self):
        """FoulResult 타입 확인"""
        board = OFCBoard()
        result = board.check_foul()
        assert isinstance(result, FoulResult)
        assert isinstance(result.has_foul, bool)
        assert isinstance(result.foul_lines, list)


class TestFoulWarning:
    def test_foul_warning_top_incomplete(self):
        """Top 라인 미완성 → 경고"""
        board = OFCBoard()
        board.top = [Card(Rank.ACE, Suit.SPADE)]  # 1장만
        warnings = board.get_foul_warning()
        assert any("Top" in w for w in warnings)

    def test_foul_warning_bottom_weaker_than_mid(self):
        """Bottom < Mid → 경고"""
        board = OFCBoard()
        board.bottom = [
            Card(Rank.ACE, Suit.SPADE),
            Card(Rank.ACE, Suit.HEART),
            Card(Rank.TWO, Suit.CLUB),
            Card(Rank.THREE, Suit.DIAMOND),
            Card(Rank.FOUR, Suit.SPADE),
        ]
        board.mid = [
            Card(Rank.TWO, Suit.HEART),
            Card(Rank.FIVE, Suit.HEART),
            Card(Rank.SEVEN, Suit.HEART),
            Card(Rank.NINE, Suit.HEART),
            Card(Rank.KING, Suit.HEART),
        ]
        warnings = board.get_foul_warning()
        assert any("Bottom" in w or "Foul" in w for w in warnings)

    def test_no_warning_when_valid(self):
        """올바른 배치 → 경고 없음 (top 완성 + 강도 순서 맞을 때)"""
        board = OFCBoard()
        # bottom: 플러시
        for r in [Rank.TWO, Rank.FIVE, Rank.SEVEN, Rank.NINE, Rank.KING]:
            board.bottom.append(Card(r, Suit.SPADE))
        # mid: 원페어
        board.mid = [
            Card(Rank.ACE, Suit.HEART),
            Card(Rank.ACE, Suit.DIAMOND),
            Card(Rank.KING, Suit.HEART),
            Card(Rank.QUEEN, Suit.HEART),
            Card(Rank.TWO, Suit.HEART),
        ]
        # top: 하이카드 (3장)
        board.top = [
            Card(Rank.KING, Suit.CLUB),
            Card(Rank.QUEEN, Suit.CLUB),
            Card(Rank.JACK, Suit.CLUB),
        ]
        warnings = board.get_foul_warning()
        # 경고 없거나 foul 관련 경고 없음
        foul_warnings = [w for w in warnings if "Foul" in w]
        assert len(foul_warnings) == 0


class TestGetHandResults:
    def test_get_hand_results_all_lines(self):
        """3라인 모두 HandResult 반환"""
        board = OFCBoard()
        for r in [Rank.TWO, Rank.FIVE, Rank.SEVEN, Rank.NINE, Rank.KING]:
            board.bottom.append(Card(r, Suit.SPADE))
        board.mid = [
            Card(Rank.ACE, Suit.HEART),
            Card(Rank.ACE, Suit.DIAMOND),
            Card(Rank.KING, Suit.HEART),
            Card(Rank.QUEEN, Suit.HEART),
            Card(Rank.TWO, Suit.HEART),
        ]
        board.top = [
            Card(Rank.KING, Suit.CLUB),
            Card(Rank.QUEEN, Suit.CLUB),
            Card(Rank.JACK, Suit.CLUB),
        ]
        results = board.get_hand_results()
        assert 'bottom' in results
        assert 'mid' in results
        assert 'top' in results

    def test_get_hand_results_empty_lines_excluded(self):
        """빈 라인은 결과에서 제외"""
        board = OFCBoard()
        board.bottom.append(Card(Rank.ACE, Suit.SPADE))
        results = board.get_hand_results()
        assert 'bottom' in results
        assert 'mid' not in results
        assert 'top' not in results


class TestFantasyland:
    """A4: 판타지랜드 진입 조건 검증"""

    def test_fantasyland_top_pair_no_foul(self):
        """Top QQ 이상 원페어 + Foul 없음 → 판타지랜드 진입"""
        board = OFCBoard()
        # bottom: 플러시 (강함)
        for r in [Rank.TWO, Rank.FIVE, Rank.SEVEN, Rank.NINE, Rank.KING]:
            board.bottom.append(Card(r, Suit.SPADE))
        # mid: 원페어 (중간)
        board.mid = [
            Card(Rank.ACE, Suit.HEART),
            Card(Rank.ACE, Suit.DIAMOND),
            Card(Rank.KING, Suit.HEART),
            Card(Rank.QUEEN, Suit.HEART),
            Card(Rank.TWO, Suit.HEART),
        ]
        # top: QQ 페어 (QQ 이상 조건 충족)
        board.top = [
            Card(Rank.QUEEN, Suit.SPADE),
            Card(Rank.QUEEN, Suit.CLUB),
            Card(Rank.TWO, Suit.CLUB),
        ]
        assert board.check_fantasyland() is True

    def test_fantasyland_top_three_of_a_kind(self):
        """Top 스리카인드 + Foul 없음 → 판타지랜드 진입"""
        board = OFCBoard()
        # bottom: 풀하우스 (강)
        board.bottom = [
            Card(Rank.ACE, Suit.SPADE),
            Card(Rank.ACE, Suit.HEART),
            Card(Rank.ACE, Suit.DIAMOND),
            Card(Rank.KING, Suit.SPADE),
            Card(Rank.KING, Suit.HEART),
        ]
        # mid: 스리카인드 (중간 — 스리카인드 ≥ 스리카인드이므로 Foul 없음)
        board.mid = [
            Card(Rank.QUEEN, Suit.SPADE),
            Card(Rank.QUEEN, Suit.HEART),
            Card(Rank.QUEEN, Suit.DIAMOND),
            Card(Rank.TWO, Suit.CLUB),
            Card(Rank.THREE, Suit.DIAMOND),
        ]
        # top: 스리카인드 (QQ 이상 → 판타지랜드 진입, mid와 동급이므로 Foul 없음)
        board.top = [
            Card(Rank.QUEEN, Suit.CLUB),
            Card(Rank.QUEEN, Suit.DIAMOND),
            Card(Rank.QUEEN, Suit.HEART),
        ]
        assert board.check_fantasyland() is True

    def test_no_fantasyland_top_high_card(self):
        """Top 하이카드 → 판타지랜드 진입 불가"""
        board = OFCBoard()
        for r in [Rank.TWO, Rank.FIVE, Rank.SEVEN, Rank.NINE, Rank.KING]:
            board.bottom.append(Card(r, Suit.SPADE))
        board.mid = [
            Card(Rank.ACE, Suit.HEART),
            Card(Rank.ACE, Suit.DIAMOND),
            Card(Rank.KING, Suit.HEART),
            Card(Rank.QUEEN, Suit.HEART),
            Card(Rank.TWO, Suit.HEART),
        ]
        # top: 하이카드 (페어 없음)
        board.top = [
            Card(Rank.KING, Suit.CLUB),
            Card(Rank.QUEEN, Suit.CLUB),
            Card(Rank.JACK, Suit.CLUB),
        ]
        assert board.check_fantasyland() is False

    def test_no_fantasyland_with_foul(self):
        """Foul 발생 시 → 판타지랜드 진입 불가"""
        board = OFCBoard()
        # bottom: 원페어 (약함)
        board.bottom = [
            Card(Rank.ACE, Suit.SPADE),
            Card(Rank.ACE, Suit.HEART),
            Card(Rank.TWO, Suit.CLUB),
            Card(Rank.THREE, Suit.DIAMOND),
            Card(Rank.FOUR, Suit.SPADE),
        ]
        # mid: 플러시 (bottom보다 강함 → Foul)
        board.mid = [
            Card(Rank.TWO, Suit.HEART),
            Card(Rank.FIVE, Suit.HEART),
            Card(Rank.SEVEN, Suit.HEART),
            Card(Rank.NINE, Suit.HEART),
            Card(Rank.KING, Suit.HEART),
        ]
        # top: 원페어
        board.top = [
            Card(Rank.FIVE, Suit.SPADE),
            Card(Rank.FIVE, Suit.DIAMOND),
            Card(Rank.TWO, Suit.CLUB),
        ]
        assert board.check_fantasyland() is False

    def test_no_fantasyland_top_incomplete(self):
        """Top 3장 미완성 → 판타지랜드 진입 불가"""
        board = OFCBoard()
        for r in [Rank.TWO, Rank.FIVE, Rank.SEVEN, Rank.NINE, Rank.KING]:
            board.bottom.append(Card(r, Suit.SPADE))
        board.mid = [
            Card(Rank.ACE, Suit.HEART),
            Card(Rank.ACE, Suit.DIAMOND),
            Card(Rank.KING, Suit.HEART),
            Card(Rank.QUEEN, Suit.HEART),
            Card(Rank.TWO, Suit.HEART),
        ]
        board.top = [Card(Rank.FIVE, Suit.HEART), Card(Rank.FIVE, Suit.DIAMOND)]  # 2장만
        assert board.check_fantasyland() is False

    def test_no_fantasyland_empty_board(self):
        """빈 보드 → 판타지랜드 진입 불가"""
        board = OFCBoard()
        assert board.check_fantasyland() is False


class TestCheckFantasylandFunction:
    """모듈 레벨 check_fantasyland() 함수 — QQ+ 조건 검증"""

    def test_empty_board_no_fantasyland(self):
        from src.board import check_fantasyland
        board = OFCBoard()
        assert check_fantasyland(board) is False

    def test_high_card_no_fantasyland(self):
        from src.board import check_fantasyland
        board = OFCBoard()
        board.top = [Card(Rank.ACE, Suit.SPADE), Card(Rank.KING, Suit.HEART), Card(Rank.QUEEN, Suit.DIAMOND)]
        assert check_fantasyland(board) is False

    def test_low_pair_no_fantasyland(self):
        """JJ 이하 페어는 판타지랜드 진입 불가"""
        from src.board import check_fantasyland
        board = OFCBoard()
        board.top = [Card(Rank.FIVE, Suit.SPADE), Card(Rank.FIVE, Suit.HEART), Card(Rank.ACE, Suit.DIAMOND)]
        assert check_fantasyland(board) is False

    def test_jack_pair_no_fantasyland(self):
        from src.board import check_fantasyland
        board = OFCBoard()
        board.top = [Card(Rank.JACK, Suit.SPADE), Card(Rank.JACK, Suit.HEART), Card(Rank.ACE, Suit.DIAMOND)]
        assert check_fantasyland(board) is False

    def test_queen_pair_fantasyland(self):
        """QQ 페어 → 판타지랜드 진입"""
        from src.board import check_fantasyland
        board = OFCBoard()
        board.top = [Card(Rank.QUEEN, Suit.SPADE), Card(Rank.QUEEN, Suit.HEART), Card(Rank.ACE, Suit.DIAMOND)]
        assert check_fantasyland(board) is True

    def test_king_pair_fantasyland(self):
        from src.board import check_fantasyland
        board = OFCBoard()
        board.top = [Card(Rank.KING, Suit.SPADE), Card(Rank.KING, Suit.HEART), Card(Rank.ACE, Suit.DIAMOND)]
        assert check_fantasyland(board) is True

    def test_ace_pair_fantasyland(self):
        from src.board import check_fantasyland
        board = OFCBoard()
        board.top = [Card(Rank.ACE, Suit.SPADE), Card(Rank.ACE, Suit.HEART), Card(Rank.KING, Suit.DIAMOND)]
        assert check_fantasyland(board) is True

    def test_three_of_a_kind_fantasyland(self):
        from src.board import check_fantasyland
        board = OFCBoard()
        board.top = [Card(Rank.TWO, Suit.SPADE), Card(Rank.TWO, Suit.HEART), Card(Rank.TWO, Suit.DIAMOND)]
        assert check_fantasyland(board) is True

    def test_foul_board_with_qq_top_returns_false(self):
        """A2: Foul 보드(Back<Mid) + Top QQ+ → FL=False"""
        board = OFCBoard()
        # bottom: 원페어 (약함)
        board.bottom = [
            Card(Rank.ACE, Suit.SPADE),
            Card(Rank.ACE, Suit.HEART),
            Card(Rank.TWO, Suit.CLUB),
            Card(Rank.THREE, Suit.DIAMOND),
            Card(Rank.FOUR, Suit.SPADE),
        ]
        # mid: 플러시 (bottom보다 강함 → Foul)
        board.mid = [
            Card(Rank.TWO, Suit.HEART),
            Card(Rank.FIVE, Suit.HEART),
            Card(Rank.SEVEN, Suit.HEART),
            Card(Rank.NINE, Suit.HEART),
            Card(Rank.KING, Suit.HEART),
        ]
        # top: QQ 페어 (FL 진입 조건 충족하지만 Foul이므로 불가)
        board.top = [
            Card(Rank.QUEEN, Suit.SPADE),
            Card(Rank.QUEEN, Suit.CLUB),
            Card(Rank.TWO, Suit.DIAMOND),
        ]
        assert board.check_foul().has_foul is True  # Foul 확인
        assert board.check_fantasyland() is False  # FL 진입 불가
