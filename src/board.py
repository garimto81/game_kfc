from dataclasses import dataclass, field

from src.card import Card
from src.hand import compare_hands_ofc, evaluate_hand


@dataclass
class FoulResult:
    has_foul: bool
    foul_lines: list


@dataclass
class OFCBoard:
    top: list = field(default_factory=list)    # 최대 3칸
    mid: list = field(default_factory=list)    # 최대 5칸
    bottom: list = field(default_factory=list) # 최대 5칸

    _VALID_LINES = {'top', 'mid', 'bottom'}
    _LINE_LIMITS = {'top': 3, 'mid': 5, 'bottom': 5}

    def place_card(self, line: str, card: Card) -> bool:
        """카드 배치. 슬롯 초과 시 False. 유효하지 않은 라인명은 ValueError."""
        if line not in self._VALID_LINES:
            raise ValueError(f"유효하지 않은 라인: '{line}'. 'top', 'mid', 'bottom' 중 하나.")
        slot = getattr(self, line)
        if len(slot) >= self._LINE_LIMITS[line]:
            return False
        slot.append(card)
        return True

    def remove_card(self, line: str, card: Card) -> bool:
        """카드 제거. 유효하지 않은 라인명은 ValueError."""
        if line not in self._VALID_LINES:
            raise ValueError(f"유효하지 않은 라인: '{line}'. 'top', 'mid', 'bottom' 중 하나.")
        slot = getattr(self, line)
        if card in slot:
            slot.remove(card)
            return True
        return False

    def is_full(self) -> bool:
        """top=3, mid=5, bottom=5 모두 채워졌는지"""
        return len(self.top) == 3 and len(self.mid) == 5 and len(self.bottom) == 5

    def check_foul(self) -> FoulResult:
        """Bottom ≥ Mid ≥ Top 핸드 강도 위반 감지"""
        bottom_hand = evaluate_hand(self.bottom) if self.bottom else None
        mid_hand = evaluate_hand(self.mid) if self.mid else None
        top_hand = evaluate_hand(self.top) if self.top else None

        foul_lines = []

        if bottom_hand and mid_hand:
            if compare_hands_ofc(bottom_hand, mid_hand) < 0:
                foul_lines.append('bottom')

        if mid_hand and top_hand:
            if compare_hands_ofc(mid_hand, top_hand) < 0:
                foul_lines.append('mid')

        return FoulResult(has_foul=len(foul_lines) > 0, foul_lines=foul_lines)

    def get_foul_warning(self) -> list:
        """현재 배치 기준 폴 위험 경고 문자열 반환"""
        warnings = []

        bottom_hand = evaluate_hand(self.bottom) if self.bottom else None
        mid_hand = evaluate_hand(self.mid) if self.mid else None
        top_hand = evaluate_hand(self.top) if self.top else None

        if bottom_hand is not None and mid_hand is not None:
            if compare_hands_ofc(bottom_hand, mid_hand) < 0:
                warnings.append("경고: Bottom 라인이 Mid보다 약합니다 (Foul 위험)")

        if mid_hand is not None and top_hand is not None:
            if compare_hands_ofc(mid_hand, top_hand) < 0:
                warnings.append("경고: Mid 라인이 Top보다 약합니다 (Foul 위험)")

        if len(self.top) < 3:
            warnings.append("알림: Top 라인 미완성 (배치 전 반드시 확인)")

        return warnings

    def get_hand_results(self) -> dict:
        """top/mid/bottom 각 라인 핸드 판정 결과 반환"""
        result = {}
        if self.top:
            result['top'] = evaluate_hand(self.top)
        if self.mid:
            result['mid'] = evaluate_hand(self.mid)
        if self.bottom:
            result['bottom'] = evaluate_hand(self.bottom)
        return result

    def check_fantasyland(self) -> bool:
        """판타지랜드 진입 조건: Top QQ 이상 페어 + Foul 없음 (모듈 레벨 함수 위임)"""
        return check_fantasyland(self)


def check_fantasyland(board: 'OFCBoard') -> bool:
    """Top 라인 QQ+ 원페어 이상 달성 여부 판정 (PRD §6.6, alpha.design.md §5.3).

    판정 기준:
    - Foul 보드면 즉시 False
    - ONE_PAIR: 페어 랭크가 QUEEN(12) 이상
    - THREE_OF_A_KIND: 항상 True (Top 최강 핸드)
    - 그 외 (HIGH_CARD, ONE_PAIR with rank < Q): False
    """
    from collections import Counter

    from src.card import Rank
    from src.hand import HandType

    if not board.top:
        return False

    # Foul 보드에서는 FL 진입 불가
    if board.check_foul().has_foul:
        return False

    top_hand = evaluate_hand(board.top)

    if top_hand.hand_type == HandType.ONE_PAIR:
        rank_counts = Counter(c.rank for c in board.top)
        pair_ranks = [r for r, cnt in rank_counts.items() if cnt >= 2]
        return bool(pair_ranks) and max(pair_ranks) >= Rank.QUEEN

    # THREE_OF_A_KIND 이상 (Top 3장 기준 최강)
    return top_hand.hand_type > HandType.ONE_PAIR
