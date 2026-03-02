from collections import Counter
from dataclasses import dataclass
from enum import IntEnum

from src.card import Rank, Suit


class HandType(IntEnum):
    HIGH_CARD = 1
    ONE_PAIR = 2
    TWO_PAIR = 3
    THREE_OF_A_KIND = 4
    STRAIGHT = 5
    FLUSH = 6
    FULL_HOUSE = 7
    FOUR_OF_A_KIND = 8
    STRAIGHT_FLUSH = 9
    ROYAL_FLUSH = 10


@dataclass
class HandResult:
    hand_type: HandType
    cards: list
    enhanced_count: int
    dominant_suit: Suit
    high_card_rank: Rank


def evaluate_hand(cards: list) -> HandResult:
    """카드 목록에서 최강 포커 핸드 판정"""
    if not cards:
        return HandResult(HandType.HIGH_CARD, [], 0, Suit.CLUB, Rank.TWO)

    n = len(cards)
    rank_counts = Counter(card.rank for card in cards)
    suit_counts = Counter(card.suit for card in cards)
    ranks = sorted(rank_counts.keys(), key=lambda r: r.value, reverse=True)

    # 5장일 때만 플러시/스트레이트 판정
    is_flush = False
    is_straight = False

    if n >= 5:
        is_flush = max(suit_counts.values()) >= 5

        if len(rank_counts) == 5:
            rank_vals = sorted([r.value for r in rank_counts.keys()])
            if rank_vals[-1] - rank_vals[0] == 4:
                is_straight = True
            elif set(rank_vals) == {14, 2, 3, 4, 5}:
                # A-2-3-4-5 로우 스트레이트
                is_straight = True

    # 핸드 타입 결정
    if n >= 5:
        if is_flush and is_straight:
            rank_vals = sorted([r.value for r in rank_counts.keys()])
            # 로열 플러시: 10-J-Q-K-A 동수트
            if set(rank_vals) == {10, 11, 12, 13, 14}:
                hand_type = HandType.ROYAL_FLUSH
            else:
                hand_type = HandType.STRAIGHT_FLUSH
        elif 4 in rank_counts.values():
            hand_type = HandType.FOUR_OF_A_KIND
        elif 3 in rank_counts.values() and 2 in rank_counts.values():
            hand_type = HandType.FULL_HOUSE
        elif is_flush:
            hand_type = HandType.FLUSH
        elif is_straight:
            hand_type = HandType.STRAIGHT
        elif 3 in rank_counts.values():
            hand_type = HandType.THREE_OF_A_KIND
        elif list(rank_counts.values()).count(2) == 2:
            hand_type = HandType.TWO_PAIR
        elif 2 in rank_counts.values():
            hand_type = HandType.ONE_PAIR
        else:
            hand_type = HandType.HIGH_CARD
    else:
        # 3장 이하 (Front 라인): 스트레이트/플러시/풀하우스/포카인드/SF/RF 불가
        if 3 in rank_counts.values():
            hand_type = HandType.THREE_OF_A_KIND
        elif 2 in rank_counts.values():
            hand_type = HandType.ONE_PAIR
        else:
            hand_type = HandType.HIGH_CARD

    enhanced_count = sum(1 for c in cards if c.is_enhanced)
    dominant_suit = _calc_dominant_suit(cards, suit_counts, hand_type, rank_counts)
    high_card_rank = ranks[0] if ranks else Rank.TWO

    return HandResult(
        hand_type=hand_type,
        cards=cards,
        enhanced_count=enhanced_count,
        dominant_suit=dominant_suit,
        high_card_rank=high_card_rank,
    )


def _calc_dominant_suit(
    cards: list,
    suit_counts: Counter,
    hand_type: HandType,
    rank_counts: Counter,
) -> Suit:
    """dominant_suit 계산 로직"""
    # 풀하우스: 스리카인드 파트의 수트
    if hand_type == HandType.FULL_HOUSE:
        three_rank = next(r for r, c in rank_counts.items() if c == 3)
        three_cards = [c for c in cards if c.rank == three_rank]
        three_suit_counts = Counter(c.suit for c in three_cards)
        return three_suit_counts.most_common(1)[0][0]

    # 가장 많이 보유한 수트
    most_common = suit_counts.most_common()
    if len(most_common) == 1 or most_common[0][1] > most_common[1][1]:
        return most_common[0][0]

    # 동수 시: 더 높은 랭크 카드가 속한 수트
    tied_count = most_common[0][1]
    tied_suits = {s for s, c in most_common if c == tied_count}

    for card in sorted(cards, key=lambda c: c.rank.value, reverse=True):
        if card.suit in tied_suits:
            return card.suit

    return most_common[0][0]


def beats_suit(attacker: Suit, defender: Suit) -> bool:
    """수트 순환 우위: SPADE>HEART>DIAMOND>CLUB>SPADE
    공식: (defender.value % 4) + 1 == attacker.value
    """
    return (defender.value % 4) + 1 == attacker.value


def compare_hands(h1: HandResult, h2: HandResult, reverse_rank: bool = False) -> int:
    """+1: h1 승, -1: h2 승, 0: 무승부

    reverse_rank=True 시 4단계(high_card_rank) 비교를 역전 (낮은 랭크 우선).
    1~3단계(핸드 강도, 강화수, 수트 우위)는 역전 없음.
    """
    # 1단계: 핸드 강도
    if h1.hand_type != h2.hand_type:
        return 1 if h1.hand_type > h2.hand_type else -1

    # 2단계: 강화 카드 수
    if h1.enhanced_count != h2.enhanced_count:
        return 1 if h1.enhanced_count > h2.enhanced_count else -1

    # 3단계: 수트 순환 우위
    s1, s2 = h1.dominant_suit, h2.dominant_suit
    if s1 != s2:
        if beats_suit(s1, s2):
            return 1
        if beats_suit(s2, s1):
            return -1

    # 4단계: 최고 랭크 비교 (reverse_rank=True 시 낮은 랭크 우선)
    if h1.high_card_rank != h2.high_card_rank:
        cmp = 1 if h1.high_card_rank > h2.high_card_rank else -1
        return -cmp if reverse_rank else cmp

    return 0


def _get_kicker_ranks(cards: list, rank_counts: 'Counter') -> list:
    """핸드 비교용 랭크 리스트 반환 (그룹 크기 내림차순 -> 랭크 내림차순)"""
    groups = sorted(rank_counts.items(), key=lambda x: (x[1], x[0].value), reverse=True)
    return [r.value for r, _ in groups]


def _is_wheel(cards: list) -> bool:
    """A-2-3-4-5 wheel straight 여부 판정"""
    ranks = {c.rank.value for c in cards}
    return ranks == {14, 2, 3, 4, 5}


def compare_hands_ofc(h1: HandResult, h2: HandResult) -> int:
    """+1: h1 승, -1: h2 승, 0: 무승부 (OFC 규칙: kicker 비교)"""
    # 1단계: 핸드 강도
    if h1.hand_type != h2.hand_type:
        return 1 if h1.hand_type > h2.hand_type else -1

    # 2단계: 같은 핸드 타입 -> 랭크 그룹 비교 (kicker)
    rc1 = Counter(c.rank for c in h1.cards)
    rc2 = Counter(c.rank for c in h2.cards)
    kickers1 = _get_kicker_ranks(h1.cards, rc1)
    kickers2 = _get_kicker_ranks(h2.cards, rc2)

    # STRAIGHT / STRAIGHT_FLUSH에서 wheel (A-2-3-4-5) 보정
    if h1.hand_type in (HandType.STRAIGHT, HandType.STRAIGHT_FLUSH):
        if _is_wheel(h1.cards):
            kickers1 = [5]  # 5-high straight
        if _is_wheel(h2.cards):
            kickers2 = [5]  # 5-high straight

    for k1, k2 in zip(kickers1, kickers2):
        if k1 != k2:
            return 1 if k1 > k2 else -1

    return 0


def apply_foul_penalty(hand: HandResult) -> HandResult:
    """Foul 발생 라인의 HandType -1등급 강등 (최하 HIGH_CARD 유지)"""
    new_type = HandType(max(1, hand.hand_type.value - 1))
    return HandResult(
        hand_type=new_type,
        cards=hand.cards,
        enhanced_count=hand.enhanced_count,
        dominant_suit=hand.dominant_suit,
        high_card_rank=hand.high_card_rank,
    )
