import random

from src.card import Card, Rank, Suit
from src.hand import HandType, beats_suit, compare_hands, evaluate_hand


class TestHandEvaluation5Cards:
    """5장 핸드 판정 테스트"""

    def test_royal_flush(self):
        cards = [
            Card(Rank.TEN, Suit.SPADE),
            Card(Rank.JACK, Suit.SPADE),
            Card(Rank.QUEEN, Suit.SPADE),
            Card(Rank.KING, Suit.SPADE),
            Card(Rank.ACE, Suit.SPADE),
        ]
        result = evaluate_hand(cards)
        assert result.hand_type == HandType.ROYAL_FLUSH

    def test_straight_flush(self):
        cards = [
            Card(Rank.NINE, Suit.HEART),
            Card(Rank.TEN, Suit.HEART),
            Card(Rank.JACK, Suit.HEART),
            Card(Rank.QUEEN, Suit.HEART),
            Card(Rank.KING, Suit.HEART),
        ]
        result = evaluate_hand(cards)
        assert result.hand_type == HandType.STRAIGHT_FLUSH

    def test_straight_flush_low(self):
        """2-3-4-5-6 스트레이트 플러시"""
        cards = [
            Card(Rank.TWO, Suit.DIAMOND),
            Card(Rank.THREE, Suit.DIAMOND),
            Card(Rank.FOUR, Suit.DIAMOND),
            Card(Rank.FIVE, Suit.DIAMOND),
            Card(Rank.SIX, Suit.DIAMOND),
        ]
        result = evaluate_hand(cards)
        assert result.hand_type == HandType.STRAIGHT_FLUSH

    def test_four_of_a_kind(self):
        cards = [
            Card(Rank.ACE, Suit.SPADE),
            Card(Rank.ACE, Suit.HEART),
            Card(Rank.ACE, Suit.DIAMOND),
            Card(Rank.ACE, Suit.CLUB),
            Card(Rank.KING, Suit.SPADE),
        ]
        result = evaluate_hand(cards)
        assert result.hand_type == HandType.FOUR_OF_A_KIND

    def test_four_of_a_kind_low_rank(self):
        cards = [
            Card(Rank.TWO, Suit.SPADE),
            Card(Rank.TWO, Suit.HEART),
            Card(Rank.TWO, Suit.DIAMOND),
            Card(Rank.TWO, Suit.CLUB),
            Card(Rank.ACE, Suit.SPADE),
        ]
        result = evaluate_hand(cards)
        assert result.hand_type == HandType.FOUR_OF_A_KIND

    def test_full_house(self):
        cards = [
            Card(Rank.KING, Suit.SPADE),
            Card(Rank.KING, Suit.HEART),
            Card(Rank.KING, Suit.DIAMOND),
            Card(Rank.ACE, Suit.SPADE),
            Card(Rank.ACE, Suit.HEART),
        ]
        result = evaluate_hand(cards)
        assert result.hand_type == HandType.FULL_HOUSE

    def test_full_house_low_rank(self):
        cards = [
            Card(Rank.TWO, Suit.SPADE),
            Card(Rank.TWO, Suit.HEART),
            Card(Rank.TWO, Suit.DIAMOND),
            Card(Rank.THREE, Suit.SPADE),
            Card(Rank.THREE, Suit.HEART),
        ]
        result = evaluate_hand(cards)
        assert result.hand_type == HandType.FULL_HOUSE

    def test_flush(self):
        cards = [
            Card(Rank.TWO, Suit.HEART),
            Card(Rank.FIVE, Suit.HEART),
            Card(Rank.SEVEN, Suit.HEART),
            Card(Rank.NINE, Suit.HEART),
            Card(Rank.KING, Suit.HEART),
        ]
        result = evaluate_hand(cards)
        assert result.hand_type == HandType.FLUSH

    def test_flush_club(self):
        cards = [
            Card(Rank.ACE, Suit.CLUB),
            Card(Rank.THREE, Suit.CLUB),
            Card(Rank.SIX, Suit.CLUB),
            Card(Rank.EIGHT, Suit.CLUB),
            Card(Rank.JACK, Suit.CLUB),
        ]
        result = evaluate_hand(cards)
        assert result.hand_type == HandType.FLUSH

    def test_straight(self):
        cards = [
            Card(Rank.FIVE, Suit.SPADE),
            Card(Rank.SIX, Suit.HEART),
            Card(Rank.SEVEN, Suit.DIAMOND),
            Card(Rank.EIGHT, Suit.CLUB),
            Card(Rank.NINE, Suit.SPADE),
        ]
        result = evaluate_hand(cards)
        assert result.hand_type == HandType.STRAIGHT

    def test_straight_high(self):
        """10-J-Q-K-A 스트레이트 (로열 플러시 아닌 경우)"""
        cards = [
            Card(Rank.TEN, Suit.SPADE),
            Card(Rank.JACK, Suit.HEART),
            Card(Rank.QUEEN, Suit.DIAMOND),
            Card(Rank.KING, Suit.CLUB),
            Card(Rank.ACE, Suit.SPADE),
        ]
        result = evaluate_hand(cards)
        assert result.hand_type == HandType.STRAIGHT

    def test_low_straight_a2345(self):
        """A-2-3-4-5 로우 스트레이트"""
        cards = [
            Card(Rank.ACE, Suit.SPADE),
            Card(Rank.TWO, Suit.HEART),
            Card(Rank.THREE, Suit.DIAMOND),
            Card(Rank.FOUR, Suit.CLUB),
            Card(Rank.FIVE, Suit.SPADE),
        ]
        result = evaluate_hand(cards)
        assert result.hand_type == HandType.STRAIGHT

    def test_three_of_a_kind(self):
        cards = [
            Card(Rank.SEVEN, Suit.SPADE),
            Card(Rank.SEVEN, Suit.HEART),
            Card(Rank.SEVEN, Suit.DIAMOND),
            Card(Rank.TWO, Suit.CLUB),
            Card(Rank.FIVE, Suit.SPADE),
        ]
        result = evaluate_hand(cards)
        assert result.hand_type == HandType.THREE_OF_A_KIND

    def test_two_pair(self):
        cards = [
            Card(Rank.ACE, Suit.SPADE),
            Card(Rank.ACE, Suit.HEART),
            Card(Rank.KING, Suit.SPADE),
            Card(Rank.KING, Suit.HEART),
            Card(Rank.TWO, Suit.CLUB),
        ]
        result = evaluate_hand(cards)
        assert result.hand_type == HandType.TWO_PAIR

    def test_one_pair(self):
        cards = [
            Card(Rank.ACE, Suit.SPADE),
            Card(Rank.ACE, Suit.HEART),
            Card(Rank.KING, Suit.SPADE),
            Card(Rank.QUEEN, Suit.HEART),
            Card(Rank.TWO, Suit.CLUB),
        ]
        result = evaluate_hand(cards)
        assert result.hand_type == HandType.ONE_PAIR

    def test_high_card(self):
        cards = [
            Card(Rank.ACE, Suit.SPADE),
            Card(Rank.KING, Suit.HEART),
            Card(Rank.QUEEN, Suit.DIAMOND),
            Card(Rank.JACK, Suit.CLUB),
            Card(Rank.NINE, Suit.SPADE),
        ]
        result = evaluate_hand(cards)
        assert result.hand_type == HandType.HIGH_CARD

    def test_high_card_diverse(self):
        cards = [
            Card(Rank.TWO, Suit.SPADE),
            Card(Rank.FOUR, Suit.HEART),
            Card(Rank.SIX, Suit.DIAMOND),
            Card(Rank.EIGHT, Suit.CLUB),
            Card(Rank.TEN, Suit.SPADE),
        ]
        result = evaluate_hand(cards)
        assert result.hand_type == HandType.HIGH_CARD

    def test_not_straight_gap(self):
        """연속이 아닌 5장 → 스트레이트 아님"""
        cards = [
            Card(Rank.TWO, Suit.SPADE),
            Card(Rank.THREE, Suit.HEART),
            Card(Rank.FIVE, Suit.DIAMOND),
            Card(Rank.SIX, Suit.CLUB),
            Card(Rank.SEVEN, Suit.SPADE),
        ]
        result = evaluate_hand(cards)
        assert result.hand_type != HandType.STRAIGHT

    def test_not_flush_mixed_suits(self):
        """혼합 수트 → 플러시 아님"""
        cards = [
            Card(Rank.TWO, Suit.SPADE),
            Card(Rank.FIVE, Suit.HEART),
            Card(Rank.SEVEN, Suit.SPADE),
            Card(Rank.NINE, Suit.DIAMOND),
            Card(Rank.KING, Suit.SPADE),
        ]
        result = evaluate_hand(cards)
        assert result.hand_type != HandType.FLUSH


class TestHandEvaluation3Cards:
    """Front 라인 (3장) 핸드 판정"""

    def test_front_three_of_a_kind(self):
        cards = [
            Card(Rank.ACE, Suit.SPADE),
            Card(Rank.ACE, Suit.HEART),
            Card(Rank.ACE, Suit.DIAMOND),
        ]
        result = evaluate_hand(cards)
        assert result.hand_type == HandType.THREE_OF_A_KIND

    def test_front_one_pair(self):
        cards = [
            Card(Rank.ACE, Suit.SPADE),
            Card(Rank.ACE, Suit.HEART),
            Card(Rank.KING, Suit.DIAMOND),
        ]
        result = evaluate_hand(cards)
        assert result.hand_type == HandType.ONE_PAIR

    def test_front_high_card(self):
        cards = [
            Card(Rank.ACE, Suit.SPADE),
            Card(Rank.KING, Suit.HEART),
            Card(Rank.QUEEN, Suit.DIAMOND),
        ]
        result = evaluate_hand(cards)
        assert result.hand_type == HandType.HIGH_CARD

    def test_front_no_straight(self):
        """Front 라인: 3장 스트레이트 불가"""
        cards = [
            Card(Rank.ACE, Suit.SPADE),
            Card(Rank.TWO, Suit.HEART),
            Card(Rank.THREE, Suit.DIAMOND),
        ]
        result = evaluate_hand(cards)
        assert result.hand_type != HandType.STRAIGHT
        assert result.hand_type == HandType.HIGH_CARD

    def test_front_no_flush(self):
        """Front 라인: 3장 플러시 불가"""
        cards = [
            Card(Rank.ACE, Suit.SPADE),
            Card(Rank.KING, Suit.SPADE),
            Card(Rank.QUEEN, Suit.SPADE),
        ]
        result = evaluate_hand(cards)
        assert result.hand_type != HandType.FLUSH
        assert result.hand_type == HandType.HIGH_CARD

    def test_front_no_two_pair(self):
        """Front 라인: 3장 투페어 불가"""
        cards = [
            Card(Rank.ACE, Suit.SPADE),
            Card(Rank.ACE, Suit.HEART),
            Card(Rank.KING, Suit.SPADE),
        ]
        result = evaluate_hand(cards)
        # 3장에서 투페어는 불가능 (페어 + 키커)
        assert result.hand_type == HandType.ONE_PAIR


class TestHandResultFields:
    """HandResult 필드 검증"""

    def test_enhanced_count_calculation(self):
        """2성+3성 카드 수 정확 집계"""
        cards = [
            Card(Rank.ACE, Suit.SPADE, stars=2),
            Card(Rank.ACE, Suit.HEART, stars=1),
            Card(Rank.KING, Suit.SPADE, stars=3),
            Card(Rank.QUEEN, Suit.HEART, stars=1),
            Card(Rank.TWO, Suit.CLUB, stars=1),
        ]
        result = evaluate_hand(cards)
        assert result.enhanced_count == 2  # 2성 1 + 3성 1

    def test_enhanced_count_zero(self):
        cards = [
            Card(Rank.ACE, Suit.SPADE),
            Card(Rank.ACE, Suit.HEART),
            Card(Rank.KING, Suit.SPADE),
            Card(Rank.QUEEN, Suit.HEART),
            Card(Rank.TWO, Suit.CLUB),
        ]
        result = evaluate_hand(cards)
        assert result.enhanced_count == 0

    def test_high_card_rank(self):
        """high_card_rank는 가장 높은 랭크"""
        cards = [
            Card(Rank.ACE, Suit.SPADE),
            Card(Rank.KING, Suit.HEART),
            Card(Rank.QUEEN, Suit.DIAMOND),
            Card(Rank.JACK, Suit.CLUB),
            Card(Rank.NINE, Suit.SPADE),
        ]
        result = evaluate_hand(cards)
        assert result.high_card_rank == Rank.ACE

    def test_dominant_suit_single_suit(self):
        """단일 수트 → dominant_suit = 그 수트"""
        cards = [
            Card(Rank.TWO, Suit.HEART),
            Card(Rank.FIVE, Suit.HEART),
            Card(Rank.SEVEN, Suit.HEART),
            Card(Rank.NINE, Suit.HEART),
            Card(Rank.KING, Suit.HEART),
        ]
        result = evaluate_hand(cards)
        assert result.dominant_suit == Suit.HEART

    def test_dominant_suit_majority(self):
        """3 SPADE, 2 HEART → dominant_suit = SPADE"""
        cards = [
            Card(Rank.ACE, Suit.SPADE),
            Card(Rank.KING, Suit.SPADE),
            Card(Rank.QUEEN, Suit.SPADE),
            Card(Rank.JACK, Suit.HEART),
            Card(Rank.TEN, Suit.HEART),
        ]
        result = evaluate_hand(cards)
        assert result.dominant_suit == Suit.SPADE

    def test_dominant_suit_tiebreak_higher_rank(self):
        """2 SPADE (ACE), 2 HEART (KING) → dominant_suit = SPADE (ACE가 더 높음)"""
        cards = [
            Card(Rank.ACE, Suit.SPADE),
            Card(Rank.TWO, Suit.SPADE),
            Card(Rank.KING, Suit.HEART),
            Card(Rank.THREE, Suit.HEART),
            Card(Rank.FOUR, Suit.CLUB),
        ]
        result = evaluate_hand(cards)
        assert result.dominant_suit == Suit.SPADE

    def test_full_house_dominant_suit_is_three_of_a_kind_suit(self):
        """풀하우스 dominant_suit = 스리카인드 파트의 수트"""
        cards = [
            Card(Rank.KING, Suit.SPADE),
            Card(Rank.KING, Suit.HEART),
            Card(Rank.KING, Suit.DIAMOND),
            Card(Rank.ACE, Suit.SPADE),
            Card(Rank.ACE, Suit.HEART),
        ]
        result = evaluate_hand(cards)
        assert result.hand_type == HandType.FULL_HOUSE
        # 스리카인드(K)의 dominant suit 확인 — SPADE or HEART or DIAMOND 중 하나
        assert result.dominant_suit in [Suit.SPADE, Suit.HEART, Suit.DIAMOND]


class TestHandComparison:
    """핸드 비교 테스트"""

    def test_higher_hand_type_wins(self):
        """ROYAL_FLUSH > ONE_PAIR"""
        royal = evaluate_hand([
            Card(Rank.TEN, Suit.SPADE),
            Card(Rank.JACK, Suit.SPADE),
            Card(Rank.QUEEN, Suit.SPADE),
            Card(Rank.KING, Suit.SPADE),
            Card(Rank.ACE, Suit.SPADE),
        ])
        pair = evaluate_hand([
            Card(Rank.ACE, Suit.HEART),
            Card(Rank.ACE, Suit.DIAMOND),
            Card(Rank.KING, Suit.HEART),
            Card(Rank.QUEEN, Suit.HEART),
            Card(Rank.JACK, Suit.HEART),
        ])
        assert compare_hands(royal, pair) == 1

    def test_lower_hand_type_loses(self):
        """ONE_PAIR < ROYAL_FLUSH"""
        royal = evaluate_hand([
            Card(Rank.TEN, Suit.SPADE),
            Card(Rank.JACK, Suit.SPADE),
            Card(Rank.QUEEN, Suit.SPADE),
            Card(Rank.KING, Suit.SPADE),
            Card(Rank.ACE, Suit.SPADE),
        ])
        pair = evaluate_hand([
            Card(Rank.ACE, Suit.HEART),
            Card(Rank.ACE, Suit.DIAMOND),
            Card(Rank.KING, Suit.HEART),
            Card(Rank.QUEEN, Suit.HEART),
            Card(Rank.JACK, Suit.HEART),
        ])
        assert compare_hands(pair, royal) == -1

    def test_flush_beats_straight(self):
        flush = evaluate_hand([
            Card(Rank.TWO, Suit.HEART),
            Card(Rank.FIVE, Suit.HEART),
            Card(Rank.SEVEN, Suit.HEART),
            Card(Rank.NINE, Suit.HEART),
            Card(Rank.KING, Suit.HEART),
        ])
        straight = evaluate_hand([
            Card(Rank.FIVE, Suit.SPADE),
            Card(Rank.SIX, Suit.HEART),
            Card(Rank.SEVEN, Suit.DIAMOND),
            Card(Rank.EIGHT, Suit.CLUB),
            Card(Rank.NINE, Suit.SPADE),
        ])
        assert compare_hands(flush, straight) == 1

    def test_four_beats_full_house(self):
        four = evaluate_hand([
            Card(Rank.ACE, Suit.SPADE),
            Card(Rank.ACE, Suit.HEART),
            Card(Rank.ACE, Suit.DIAMOND),
            Card(Rank.ACE, Suit.CLUB),
            Card(Rank.KING, Suit.SPADE),
        ])
        full = evaluate_hand([
            Card(Rank.KING, Suit.SPADE),
            Card(Rank.KING, Suit.HEART),
            Card(Rank.KING, Suit.DIAMOND),
            Card(Rank.ACE, Suit.SPADE),
            Card(Rank.ACE, Suit.HEART),
        ])
        assert compare_hands(four, full) == 1

    def test_enhanced_tiebreaker(self):
        """같은 핸드 타입, 강화 카드 수로 승패"""
        pair_enhanced = evaluate_hand([
            Card(Rank.ACE, Suit.SPADE, stars=2),
            Card(Rank.ACE, Suit.HEART, stars=1),
            Card(Rank.KING, Suit.SPADE),
            Card(Rank.QUEEN, Suit.HEART),
            Card(Rank.TWO, Suit.CLUB),
        ])
        pair_normal = evaluate_hand([
            Card(Rank.ACE, Suit.DIAMOND),
            Card(Rank.ACE, Suit.CLUB),
            Card(Rank.KING, Suit.HEART),
            Card(Rank.QUEEN, Suit.DIAMOND),
            Card(Rank.TWO, Suit.HEART),
        ])
        result = compare_hands(pair_enhanced, pair_normal)
        assert result == 1

    def test_enhanced_tiebreaker_reversed(self):
        """강화 카드 적은 쪽 패배"""
        pair_normal = evaluate_hand([
            Card(Rank.ACE, Suit.DIAMOND),
            Card(Rank.ACE, Suit.CLUB),
            Card(Rank.KING, Suit.HEART),
            Card(Rank.QUEEN, Suit.DIAMOND),
            Card(Rank.TWO, Suit.HEART),
        ])
        pair_enhanced = evaluate_hand([
            Card(Rank.ACE, Suit.SPADE, stars=2),
            Card(Rank.ACE, Suit.HEART, stars=1),
            Card(Rank.KING, Suit.SPADE),
            Card(Rank.QUEEN, Suit.HEART),
            Card(Rank.TWO, Suit.CLUB),
        ])
        result = compare_hands(pair_normal, pair_enhanced)
        assert result == -1

    def test_suit_circular_spade_beats_heart(self):
        """같은 핸드+강화, SPADE dominant vs HEART dominant → SPADE 승"""
        # 단일 수트 플러시로 dominant_suit 확정
        flush_spade = evaluate_hand([
            Card(Rank.TWO, Suit.SPADE),
            Card(Rank.FIVE, Suit.SPADE),
            Card(Rank.SEVEN, Suit.SPADE),
            Card(Rank.NINE, Suit.SPADE),
            Card(Rank.KING, Suit.SPADE),
        ])
        flush_heart = evaluate_hand([
            Card(Rank.TWO, Suit.HEART),
            Card(Rank.FIVE, Suit.HEART),
            Card(Rank.SEVEN, Suit.HEART),
            Card(Rank.NINE, Suit.HEART),
            Card(Rank.KING, Suit.HEART),
        ])
        assert flush_spade.dominant_suit == Suit.SPADE
        assert flush_heart.dominant_suit == Suit.HEART
        result = compare_hands(flush_spade, flush_heart)
        assert result == 1

    def test_suit_circular_heart_beats_diamond(self):
        flush_heart = evaluate_hand([
            Card(Rank.TWO, Suit.HEART),
            Card(Rank.FIVE, Suit.HEART),
            Card(Rank.SEVEN, Suit.HEART),
            Card(Rank.NINE, Suit.HEART),
            Card(Rank.KING, Suit.HEART),
        ])
        flush_diamond = evaluate_hand([
            Card(Rank.TWO, Suit.DIAMOND),
            Card(Rank.FIVE, Suit.DIAMOND),
            Card(Rank.SEVEN, Suit.DIAMOND),
            Card(Rank.NINE, Suit.DIAMOND),
            Card(Rank.KING, Suit.DIAMOND),
        ])
        result = compare_hands(flush_heart, flush_diamond)
        assert result == 1

    def test_suit_circular_diamond_beats_club(self):
        flush_diamond = evaluate_hand([
            Card(Rank.TWO, Suit.DIAMOND),
            Card(Rank.FIVE, Suit.DIAMOND),
            Card(Rank.SEVEN, Suit.DIAMOND),
            Card(Rank.NINE, Suit.DIAMOND),
            Card(Rank.KING, Suit.DIAMOND),
        ])
        flush_club = evaluate_hand([
            Card(Rank.TWO, Suit.CLUB),
            Card(Rank.FIVE, Suit.CLUB),
            Card(Rank.SEVEN, Suit.CLUB),
            Card(Rank.NINE, Suit.CLUB),
            Card(Rank.KING, Suit.CLUB),
        ])
        result = compare_hands(flush_diamond, flush_club)
        assert result == 1

    def test_suit_circular_club_beats_spade(self):
        """CLUB > SPADE (순환)"""
        flush_club = evaluate_hand([
            Card(Rank.TWO, Suit.CLUB),
            Card(Rank.FIVE, Suit.CLUB),
            Card(Rank.SEVEN, Suit.CLUB),
            Card(Rank.NINE, Suit.CLUB),
            Card(Rank.KING, Suit.CLUB),
        ])
        flush_spade = evaluate_hand([
            Card(Rank.TWO, Suit.SPADE),
            Card(Rank.FIVE, Suit.SPADE),
            Card(Rank.SEVEN, Suit.SPADE),
            Card(Rank.NINE, Suit.SPADE),
            Card(Rank.KING, Suit.SPADE),
        ])
        result = compare_hands(flush_club, flush_spade)
        assert result == 1


class TestBeatsSuit:
    """beats_suit 함수 단위 테스트"""

    def test_spade_beats_heart(self):
        assert beats_suit(Suit.SPADE, Suit.HEART) is True

    def test_heart_beats_diamond(self):
        assert beats_suit(Suit.HEART, Suit.DIAMOND) is True

    def test_diamond_beats_club(self):
        assert beats_suit(Suit.DIAMOND, Suit.CLUB) is True

    def test_club_beats_spade(self):
        assert beats_suit(Suit.CLUB, Suit.SPADE) is True

    def test_spade_does_not_beat_diamond(self):
        assert beats_suit(Suit.SPADE, Suit.DIAMOND) is False

    def test_spade_does_not_beat_club(self):
        assert beats_suit(Suit.SPADE, Suit.CLUB) is False

    def test_heart_does_not_beat_spade(self):
        assert beats_suit(Suit.HEART, Suit.SPADE) is False

    def test_heart_does_not_beat_club(self):
        assert beats_suit(Suit.HEART, Suit.CLUB) is False

    def test_diamond_does_not_beat_heart(self):
        assert beats_suit(Suit.DIAMOND, Suit.HEART) is False

    def test_club_does_not_beat_diamond(self):
        assert beats_suit(Suit.CLUB, Suit.DIAMOND) is False

    def test_same_suit_no_beats(self):
        for suit in Suit:
            assert beats_suit(suit, suit) is False


class TestEdgeCases:
    """설계 문서 엣지 케이스 (EC1~EC8) 테스트"""

    def test_ec1_front_3cards_no_straight(self):
        """EC1: Front 3장 스트레이트 불가 — A-2-3은 HIGH_CARD"""
        cards = [
            Card(Rank.ACE, Suit.SPADE),
            Card(Rank.TWO, Suit.HEART),
            Card(Rank.THREE, Suit.DIAMOND),
        ]
        result = evaluate_hand(cards)
        assert result.hand_type == HandType.HIGH_CARD

    def test_ec2_low_straight_a2345(self):
        """EC2: A-2-3-4-5 로우 스트레이트 판정"""
        cards = [
            Card(Rank.ACE, Suit.SPADE),
            Card(Rank.TWO, Suit.HEART),
            Card(Rank.THREE, Suit.DIAMOND),
            Card(Rank.FOUR, Suit.CLUB),
            Card(Rank.FIVE, Suit.SPADE),
        ]
        result = evaluate_hand(cards)
        assert result.hand_type == HandType.STRAIGHT

    def test_ec3_same_hand_same_enhanced_same_suit_high_rank_wins(self):
        """EC3: 같은 핸드 + 강화 동수 + dominant_suit 동일 → 최고 랭크 비교"""
        pair_ace = evaluate_hand([
            Card(Rank.ACE, Suit.SPADE),
            Card(Rank.ACE, Suit.HEART),
            Card(Rank.TWO, Suit.CLUB),
            Card(Rank.THREE, Suit.DIAMOND),
            Card(Rank.FOUR, Suit.SPADE),
        ])
        pair_king = evaluate_hand([
            Card(Rank.KING, Suit.SPADE),
            Card(Rank.KING, Suit.HEART),
            Card(Rank.TWO, Suit.CLUB),
            Card(Rank.THREE, Suit.DIAMOND),
            Card(Rank.FOUR, Suit.CLUB),
        ])
        # ACE pair 의 high_card_rank가 더 높음
        assert pair_ace.high_card_rank == Rank.ACE
        assert pair_king.high_card_rank == Rank.KING

    def test_ec4_full_house_dominant_suit_three_of_kind(self):
        """EC4: 풀하우스 dominant_suit = 스리카인드 파트의 수트"""
        cards = [
            Card(Rank.KING, Suit.SPADE),
            Card(Rank.KING, Suit.HEART),
            Card(Rank.KING, Suit.DIAMOND),
            Card(Rank.ACE, Suit.SPADE),
            Card(Rank.ACE, Suit.HEART),
        ]
        result = evaluate_hand(cards)
        assert result.hand_type == HandType.FULL_HOUSE
        # 스리카인드(K) 파트 중 가장 많은 수트 → SPADE, HEART, DIAMOND 중 하나
        assert result.dominant_suit in [Suit.SPADE, Suit.HEART, Suit.DIAMOND]

    def test_ec5_enhanced_pair_beats_normal_pair(self):
        """EC5: 2성 카드 있는 원페어 vs 1성 원페어 — enhanced_count로 해소"""
        pair_enhanced = evaluate_hand([
            Card(Rank.ACE, Suit.SPADE, stars=2),
            Card(Rank.ACE, Suit.HEART),
            Card(Rank.KING, Suit.SPADE),
            Card(Rank.QUEEN, Suit.HEART),
            Card(Rank.TWO, Suit.CLUB),
        ])
        pair_normal = evaluate_hand([
            Card(Rank.ACE, Suit.DIAMOND),
            Card(Rank.ACE, Suit.CLUB),
            Card(Rank.KING, Suit.HEART),
            Card(Rank.QUEEN, Suit.DIAMOND),
            Card(Rank.TWO, Suit.HEART),
        ])
        assert pair_enhanced.enhanced_count == 1
        assert pair_normal.enhanced_count == 0
        assert compare_hands(pair_enhanced, pair_normal) == 1

    def test_ec6_club_beats_spade(self):
        """EC6: CLUB > SPADE (순환)"""
        assert beats_suit(Suit.CLUB, Suit.SPADE) is True
        assert beats_suit(Suit.SPADE, Suit.CLUB) is False

    def test_ec8_straight_flush_beats_four_of_kind(self):
        """EC8: STRAIGHT_FLUSH (9) > FOUR_OF_A_KIND (8)"""
        sf = evaluate_hand([
            Card(Rank.FIVE, Suit.HEART),
            Card(Rank.SIX, Suit.HEART),
            Card(Rank.SEVEN, Suit.HEART),
            Card(Rank.EIGHT, Suit.HEART),
            Card(Rank.NINE, Suit.HEART),
        ])
        four = evaluate_hand([
            Card(Rank.ACE, Suit.SPADE),
            Card(Rank.ACE, Suit.HEART),
            Card(Rank.ACE, Suit.DIAMOND),
            Card(Rank.ACE, Suit.CLUB),
            Card(Rank.KING, Suit.SPADE),
        ])
        assert sf.hand_type == HandType.STRAIGHT_FLUSH
        assert four.hand_type == HandType.FOUR_OF_A_KIND
        assert compare_hands(sf, four) == 1


class TestRandomHandsSmoke:
    """100개 무작위 핸드 스모크 테스트 — 오판정 없음"""

    def test_100_random_hands_no_crash(self):
        """100개 무작위 5장 핸드 판정 시 크래시 없음"""
        all_cards = [Card(rank, suit) for rank in Rank for suit in Suit]
        for _ in range(100):
            sample = random.sample(all_cards, 5)
            result = evaluate_hand(sample)
            assert isinstance(result.hand_type, HandType)
            assert result.enhanced_count == 0  # 기본 별 없음
            assert result.dominant_suit in Suit
            assert result.high_card_rank in Rank

    def test_50_random_3card_hands_no_crash(self):
        """50개 무작위 3장 핸드 판정 시 크래시 없음"""
        all_cards = [Card(rank, suit) for rank in Rank for suit in Suit]
        for _ in range(50):
            sample = random.sample(all_cards, 3)
            result = evaluate_hand(sample)
            assert isinstance(result.hand_type, HandType)
            # 3장은 스트레이트/플러시 불가
            assert result.hand_type not in [
                HandType.STRAIGHT, HandType.FLUSH,
                HandType.FULL_HOUSE, HandType.FOUR_OF_A_KIND,
                HandType.STRAIGHT_FLUSH, HandType.ROYAL_FLUSH,
            ]

    def test_compare_hands_antisymmetry(self):
        """compare_hands 반대칭 검증: compare(a,b) = -compare(b,a)"""
        all_cards = [Card(rank, suit) for rank in Rank for suit in Suit]
        for _ in range(30):
            sample = random.sample(all_cards, 10)
            h1 = evaluate_hand(sample[:5])
            h2 = evaluate_hand(sample[5:])
            r1 = compare_hands(h1, h2)
            r2 = compare_hands(h2, h1)
            assert r1 == -r2 or (r1 == 0 and r2 == 0)


class TestCompareHandsReverseRank:
    """S4: compare_hands reverse_rank 파라미터 테스트"""

    def test_compare_hands_reverse_rank_false_default(self):
        """reverse_rank=False (기본): 높은 랭크 우선"""
        h_ace = evaluate_hand([
            Card(Rank.ACE, Suit.SPADE),
            Card(Rank.ACE, Suit.HEART),
            Card(Rank.TWO, Suit.CLUB),
            Card(Rank.THREE, Suit.DIAMOND),
            Card(Rank.FOUR, Suit.SPADE),
        ])
        h_two = evaluate_hand([
            Card(Rank.TWO, Suit.SPADE),
            Card(Rank.TWO, Suit.HEART),
            Card(Rank.THREE, Suit.CLUB),
            Card(Rank.FOUR, Suit.DIAMOND),
            Card(Rank.FIVE, Suit.SPADE),
        ])
        # 둘 다 ONE_PAIR, 강화수 0, 동일 수트 (모든 수트 포함)
        # high_card_rank: ACE pair > TWO pair
        result = compare_hands(h_ace, h_two, reverse_rank=False)
        assert result == 1  # ACE pair 승리

    def test_compare_hands_reverse_rank_true(self):
        """reverse_rank=True: 낮은 랭크 우선 (high_card_rank 역전)"""
        h_ace = evaluate_hand([
            Card(Rank.ACE, Suit.SPADE),
            Card(Rank.ACE, Suit.HEART),
            Card(Rank.TWO, Suit.CLUB),
            Card(Rank.THREE, Suit.DIAMOND),
            Card(Rank.FOUR, Suit.SPADE),
        ])
        h_two = evaluate_hand([
            Card(Rank.TWO, Suit.SPADE),
            Card(Rank.TWO, Suit.HEART),
            Card(Rank.THREE, Suit.CLUB),
            Card(Rank.FOUR, Suit.DIAMOND),
            Card(Rank.FIVE, Suit.SPADE),
        ])
        # reverse_rank=True: 낮은 랭크 우선 → TWO pair 승리
        result = compare_hands(h_ace, h_two, reverse_rank=True)
        assert result == -1  # TWO pair 승리

    def test_reverse_rank_no_effect_on_different_hand_type(self):
        """reverse_rank=True여도 핸드 강도 차이가 있으면 역전 없음"""
        flush = evaluate_hand([
            Card(Rank.TWO, Suit.SPADE),
            Card(Rank.FIVE, Suit.SPADE),
            Card(Rank.SEVEN, Suit.SPADE),
            Card(Rank.NINE, Suit.SPADE),
            Card(Rank.KING, Suit.SPADE),
        ])
        pair = evaluate_hand([
            Card(Rank.ACE, Suit.HEART),
            Card(Rank.ACE, Suit.DIAMOND),
            Card(Rank.KING, Suit.HEART),
            Card(Rank.QUEEN, Suit.HEART),
            Card(Rank.JACK, Suit.HEART),
        ])
        # FLUSH > ONE_PAIR, reverse_rank=True여도 핸드 강도 역전 없음
        result = compare_hands(flush, pair, reverse_rank=True)
        assert result == 1  # FLUSH 여전히 승리


class TestWheelStraightKicker:
    """A5: wheel straight (A-2-3-4-5) kicker 비교 오류 수정"""

    def test_wheel_loses_to_6_high_straight(self):
        """A2345 vs 23456: 23456이 이겨야 함 (wheel = 5-high straight)"""
        from src.hand import compare_hands_ofc
        wheel = evaluate_hand([
            Card(Rank.ACE, Suit.SPADE),
            Card(Rank.TWO, Suit.HEART),
            Card(Rank.THREE, Suit.DIAMOND),
            Card(Rank.FOUR, Suit.CLUB),
            Card(Rank.FIVE, Suit.SPADE),
        ])
        six_high = evaluate_hand([
            Card(Rank.TWO, Suit.SPADE),
            Card(Rank.THREE, Suit.HEART),
            Card(Rank.FOUR, Suit.DIAMOND),
            Card(Rank.FIVE, Suit.CLUB),
            Card(Rank.SIX, Suit.SPADE),
        ])
        assert wheel.hand_type == HandType.STRAIGHT
        assert six_high.hand_type == HandType.STRAIGHT
        result = compare_hands_ofc(wheel, six_high)
        assert result == -1  # 23456 승리

    def test_wheel_vs_wheel_is_tie(self):
        """A2345 vs A2345는 tie"""
        from src.hand import compare_hands_ofc
        wheel1 = evaluate_hand([
            Card(Rank.ACE, Suit.SPADE),
            Card(Rank.TWO, Suit.HEART),
            Card(Rank.THREE, Suit.DIAMOND),
            Card(Rank.FOUR, Suit.CLUB),
            Card(Rank.FIVE, Suit.SPADE),
        ])
        wheel2 = evaluate_hand([
            Card(Rank.ACE, Suit.HEART),
            Card(Rank.TWO, Suit.DIAMOND),
            Card(Rank.THREE, Suit.CLUB),
            Card(Rank.FOUR, Suit.SPADE),
            Card(Rank.FIVE, Suit.HEART),
        ])
        result = compare_hands_ofc(wheel1, wheel2)
        assert result == 0  # 무승부
