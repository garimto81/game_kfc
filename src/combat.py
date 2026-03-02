from collections import Counter
from dataclasses import dataclass

from src.board import OFCBoard
from src.hand import apply_foul_penalty, compare_hands, evaluate_hand


@dataclass
class CombatResult:
    line_results: dict  # {'bottom': 1, 'mid': -1, 'top': 0}
    winner_lines: int
    is_scoop: bool
    damage: int
    hula_applied: bool
    stop_applied: bool = False   # 스톱(×8) 선언 여부


def get_suit_synergy_level(board: OFCBoard, suit) -> int:
    """특정 수트의 시너지 레벨 반환 (0, 1, 2, 3).
    2~3장=레벨1, 4~5장=레벨2, 6장+=레벨3
    """
    all_cards = board.bottom + board.mid + board.top
    count = sum(1 for c in all_cards if c.suit == suit)
    if count >= 6:
        return 3
    elif count >= 4:
        return 2
    elif count >= 2:
        return 1
    return 0


def apply_spade_synergy_tiebreak(attacker_board: OFCBoard, defender_board: OFCBoard) -> int:
    """♠ 전사 시너지 동률 타이브레이커.
    Returns: 1=attacker 승리, -1=defender 승리, 0=동률 유지
    """
    from src.card import Suit
    atk_level = get_suit_synergy_level(attacker_board, Suit.SPADE)
    def_level = get_suit_synergy_level(defender_board, Suit.SPADE)
    if atk_level > def_level:
        return 1
    elif def_level > atk_level:
        return -1
    return 0


def count_synergies(board: OFCBoard, player=None) -> int:
    """같은 수트 2장 이상인 수트 수 = 활성 시너지 수.
    suit_mystery 증강체 보유 시 +1 (최대 4).
    """
    all_cards = board.bottom + board.mid + board.top
    if not all_cards:
        return 0
    suit_counts = Counter(c.suit for c in all_cards)
    base = sum(1 for cnt in suit_counts.values() if cnt >= 2)
    if player is not None and player.has_augment("suit_mystery"):
        base = min(base + 1, 4)
    return base


class CombatResolver:
    def resolve(
        self,
        board_a: OFCBoard,
        board_b: OFCBoard,
        hula_a: bool = False,
        hula_b: bool = False,
        player_a=None,
        player_b=None,
        events=None,
    ) -> tuple:
        """3라인 비교 → CombatResult 쌍 반환"""
        # foul_amnesty 이벤트 확인
        foul_amnesty_active = (
            events is not None
            and any(getattr(e, 'id', None) == "foul_amnesty" for e in events)
        )

        # Foul 판정
        if player_a is not None and player_a.in_fantasyland:
            foul_a = []
        elif foul_amnesty_active:
            foul_a = []
        else:
            foul_a = board_a.check_foul().foul_lines

        if player_b is not None and player_b.in_fantasyland:
            foul_b = []
        elif foul_amnesty_active:
            foul_b = []
        else:
            foul_b = board_b.check_foul().foul_lines

        line_results_a = {}
        line_results_b = {}

        # low_card_power 이벤트: 타이브레이커 랭크 비교 역전 (낮은 랭크 우선)
        low_card_power_active = (
            events is not None
            and any(getattr(e, 'id', None) == "low_card_power" for e in events)
        )

        for line in ['bottom', 'mid', 'top']:
            cards_a = getattr(board_a, line)
            cards_b = getattr(board_b, line)

            if cards_a and cards_b:
                h_a = evaluate_hand(cards_a)
                h_b = evaluate_hand(cards_b)
                if line in foul_a:
                    h_a = apply_foul_penalty(h_a)
                if line in foul_b:
                    h_b = apply_foul_penalty(h_b)
                cmp = compare_hands(h_a, h_b, reverse_rank=low_card_power_active)
            elif cards_a:
                cmp = 1
            elif cards_b:
                cmp = -1
            else:
                cmp = 0

            line_results_a[line] = cmp
            line_results_b[line] = -cmp

        winner_lines_a = sum(1 for v in line_results_a.values() if v > 0)
        winner_lines_b = sum(1 for v in line_results_b.values() if v > 0)

        is_scoop_a = winner_lines_a == 3
        is_scoop_b = winner_lines_b == 3

        damage_a = self.calc_damage(winner_lines_a, is_scoop_a)
        damage_b = self.calc_damage(winner_lines_b, is_scoop_b)

        # scoop_bonus 이벤트: 스쿠프 시 추가 피해 +4 (기존 +2 → +6)
        if events and any(getattr(e, 'id', None) == "scoop_bonus" for e in events):
            if is_scoop_a:
                damage_a += 4
            if is_scoop_b:
                damage_b += 4

        synergies_a = count_synergies(board_a, player=player_a)
        synergies_b = count_synergies(board_b, player=player_b)

        # suit_bonus_spade 이벤트: ♠ 수트 시너지 카운트 +1
        if events and any(getattr(e, 'id', None) == "suit_bonus_spade" for e in events):
            from src.card import Suit
            all_a = board_a.bottom + board_a.mid + board_a.top
            all_b = board_b.bottom + board_b.mid + board_b.top
            spade_a = sum(1 for c in all_a if c.suit == Suit.SPADE)
            spade_b = sum(1 for c in all_b if c.suit == Suit.SPADE)
            if spade_a >= 2:
                synergies_a = min(synergies_a + 1, 4)
            if spade_b >= 2:
                synergies_b = min(synergies_b + 1, 4)

        if hula_a and winner_lines_a >= 2 and synergies_a >= 3:
            damage_a = self.apply_hula(damage_a)
            hula_applied_a = True
        else:
            hula_applied_a = False

        if hula_b and winner_lines_b >= 2 and synergies_b >= 3:
            damage_b = self.apply_hula(damage_b)
            hula_applied_b = True
        else:
            hula_applied_b = False

        # 스톱(×8) 판정: 훌라 성공 + (상대 HP ≤ 10 OR 스쿠프+로얄플러시백)
        if hula_applied_a:
            low_stop = (player_b is not None and player_b.hp <= 10)
            bottom_hand_a = evaluate_hand(board_a.bottom) if board_a.bottom else None
            high_stop = (
                is_scoop_a and bottom_hand_a is not None
                and bottom_hand_a.hand_type.value == 10
            )
            if low_stop or high_stop:
                damage_a = damage_a // 4 * 8
                stop_applied_a = True
            else:
                stop_applied_a = False
        else:
            stop_applied_a = False

        if hula_applied_b:
            low_stop = (player_a is not None and player_a.hp <= 10)
            bottom_hand_b = evaluate_hand(board_b.bottom) if board_b.bottom else None
            high_stop = (
                is_scoop_b and bottom_hand_b is not None
                and bottom_hand_b.hand_type.value == 10
            )
            if low_stop or high_stop:
                damage_b = damage_b // 4 * 8
                stop_applied_b = True
            else:
                stop_applied_b = False
        else:
            stop_applied_b = False

        result_a = CombatResult(
            line_results=line_results_a,
            winner_lines=winner_lines_a,
            is_scoop=is_scoop_a,
            damage=damage_a,
            hula_applied=hula_applied_a,
            stop_applied=stop_applied_a,
        )
        result_b = CombatResult(
            line_results=line_results_b,
            winner_lines=winner_lines_b,
            is_scoop=is_scoop_b,
            damage=damage_b,
            hula_applied=hula_applied_b,
            stop_applied=stop_applied_b,
        )
        return result_a, result_b

    def calc_damage(self, winner_lines: int, is_scoop: bool, stage_damage: int = 2) -> int:
        """기본: 이긴라인수 × stage_damage + 스쿠프 +2"""
        base = winner_lines * stage_damage
        if is_scoop:
            base += 2
        return base

    def apply_hula(self, damage: int) -> int:
        """훌라 성공 시 damage × 4"""
        return damage * 4
