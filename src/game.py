import itertools
import random
from dataclasses import dataclass, field

from src.combat import CombatResolver
from src.economy import Player
from src.pool import SharedCardPool


@dataclass
class GameState:
    players: list
    pool: SharedCardPool
    round_num: int = 1
    phase: str = 'prep'  # 'prep' | 'combat' | 'result' | 'end'
    max_rounds: int = 5
    match_history: dict = field(default_factory=dict)
    combat_pairs: list = field(default_factory=list)
    holdem_state: object = None  # HoldemState | None

    def is_game_over(self) -> bool:
        """생존자 1명 이하이거나 max_rounds 초과 여부"""
        alive = [p for p in self.players if p.hp > 0]
        if len(alive) <= 1:
            return True
        return self.round_num > self.max_rounds

    def get_winner(self) -> 'Player | None':
        """현재 HP 기준 승자 반환. 진행 중이면 None"""
        if not self.is_game_over():
            return None
        alive = [p for p in self.players if p.hp > 0]
        if not alive:
            return None
        return max(alive, key=lambda p: p.hp)


class RoundManager:
    def __init__(self, state: GameState, augment_selector=None):
        self.state = state
        self.resolver = CombatResolver()
        self.augment_selector = augment_selector  # None=자동, callable(player, choices)=CLI

    def start_prep_phase(self):
        """준비 단계: 골드 지급 + 상점 드로우"""
        self.state.phase = 'prep'
        for player in self.state.players:
            income = player.round_income()
            player.gold += income

            # pool 참조 주입 (pineapple_pick/auto_discard_pineapple에서 사용)
            if player.pool is None:
                player.pool = self.state.pool

            # 상점 드로우 (S9 + S1 분기)
            if player.in_fantasyland:
                # S1: FL 플레이어는 13장 드로우 (Pineapple 스킵)
                player.shop_cards = self.state.pool.random_draw_n(13, player.level)
                player.pineapple_cards = []
            else:
                # Pineapple 드래프트: 3장 공개
                player.pineapple_cards = self.state.pool.random_draw_n(3, player.level)
                # S9: 일반 플레이어 — lucky_shop 증강체 시 6장
                shop_size = 6 if player.has_augment("lucky_shop") else 5
                player.shop_cards = self.state.pool.random_draw_n(shop_size, player.level)

    def start_combat_phase(self) -> list:
        """전투 단계: N인 매칭 전투 + apply_damage 사용"""
        self.state.phase = 'combat'

        active_events = (
            self.state.holdem_state.active_events
            if self.state.holdem_state is not None else []
        )

        active_players = [p for p in self.state.players if p.hp > 0]
        matchups = self.generate_matchups_from(active_players)
        self.state.combat_pairs = [
            (self.state.players.index(p1), self.state.players.index(p2))
            for p1, p2 in matchups
        ]

        results = []
        for p1, p2 in matchups:
            result_a, result_b = self.resolver.resolve(
                p1.board, p2.board,
                hula_a=p1.hula_declared,
                hula_b=p2.hula_declared,
                player_a=p1,
                player_b=p2,
                events=active_events,
            )
            p2.apply_damage(result_a.damage)
            p1.apply_damage(result_b.damage)

            # 판타지랜드 진입 판정
            from src.board import check_fantasyland
            if check_fantasyland(p1.board):
                p1.fantasyland_next = True
            if check_fantasyland(p2.board):
                p2.fantasyland_next = True

            self._update_streaks_players(p1, p2, result_a, result_b)
            idx_a = self.state.players.index(p1)
            idx_b = self.state.players.index(p2)
            self._update_match_history(idx_a, idx_b)
            results.append((result_a, result_b))

        return results

    def _update_streaks_players(self, p1, p2, result_a, result_b) -> None:
        """연승/연패 업데이트 (플레이어 객체 기반)"""
        if result_a.winner_lines > result_b.winner_lines:
            p1.win_streak += 1
            p1.loss_streak = 0
            p2.loss_streak += 1
            p2.win_streak = 0
        elif result_b.winner_lines > result_a.winner_lines:
            p2.win_streak += 1
            p2.loss_streak = 0
            p1.loss_streak += 1
            p1.win_streak = 0

    def _get_bye_counts(self) -> dict:
        result = {}
        for player in self.state.players:
            bye_list = self.state.match_history.get(f"__bye__{player.name}", [])
            result[player.name] = len(bye_list)
        return result

    def _record_bye(self, player_name: str) -> None:
        key = f"__bye__{player_name}"
        self.state.match_history.setdefault(key, []).append(self.state.round_num)

    def _update_match_history(self, idx_a: int, idx_b: int) -> None:
        p_a = self.state.players[idx_a]
        p_b = self.state.players[idx_b]
        hist_a = self.state.match_history.setdefault(p_a.name, [])
        hist_a.append(p_b.name)
        if len(hist_a) > 3:
            hist_a.pop(0)
        hist_b = self.state.match_history.setdefault(p_b.name, [])
        hist_b.append(p_a.name)
        if len(hist_b) > 3:
            hist_b.pop(0)

    def _pick_pairs_avoid_repeat(self, indices: list) -> list:
        """4인: match_history 기반 3연속 금지 매칭."""
        candidates = list(itertools.combinations(indices, 2))
        random.shuffle(candidates)

        def recent_matches(idx):
            name = self.state.players[idx].name
            return self.state.match_history.get(name, [])

        for (a, b) in candidates:
            pa_name = self.state.players[a].name
            pb_name = self.state.players[b].name
            hist_a = recent_matches(a)
            hist_b = recent_matches(b)
            # 최근 3회 중 2회 이상 같은 상대면 스킵
            if hist_a.count(pb_name) >= 2 or hist_b.count(pa_name) >= 2:
                continue
            # 나머지 인덱스로 두 번째 쌍 만들기
            remaining = [i for i in indices if i not in (a, b)]
            if len(remaining) == 2:
                return [(a, b), (remaining[0], remaining[1])]

        # fallback: 첫 2쌍
        shuffled = list(indices)
        random.shuffle(shuffled)
        return [(shuffled[0], shuffled[1]), (shuffled[2], shuffled[3])]

    def generate_matchups(self) -> list:
        """생존 플레이어 인덱스 기반 전투 쌍 생성."""
        players = self.state.players
        n = len(players)
        indices = list(range(n))

        if n == 2:
            return [(0, 1)]
        elif n == 3:
            bye_counts = self._get_bye_counts()
            bye_idx = max(indices, key=lambda i: bye_counts.get(players[i].name, 0))
            active = [i for i in indices if i != bye_idx]
            self._record_bye(players[bye_idx].name)
            return [(active[0], active[1])]
        elif n == 4:
            return self._pick_pairs_avoid_repeat(indices)
        elif n == 5:
            return self._pick_pairs_n_players_by_index(indices)
        elif n == 6:
            return self._pick_pairs_n_players_by_index(indices)
        elif n == 7:
            return self._pick_pairs_n_players_by_index(indices)
        elif n == 8:
            return self._pick_pairs_n_players_by_index(indices)
        else:
            raise ValueError(f"지원 플레이어 수: 2~8. 현재: {n}")

    def generate_matchups_from(self, active_players: list) -> list:
        """플레이어 객체 목록 기반 전투 쌍 생성 (S5)."""
        n = len(active_players)
        if n < 2:
            return []
        if n == 2:
            return [(active_players[0], active_players[1])]
        return self._pick_pairs_n_players(active_players)

    def _pick_pairs_n_players(self, active_players: list) -> list:
        """N인(3~8) 플레이어 객체 기반 쌍 생성. 홀수 시 바이 1명."""
        players = list(active_players)
        n = len(players)

        if n % 2 == 1:
            # 홀수: 바이 카운트 가장 적은 플레이어 선정
            bye_counts = self._get_bye_counts()
            bye_player = min(players, key=lambda p: bye_counts.get(p.name, 0))
            self._record_bye(bye_player.name)
            players = [p for p in players if p is not bye_player]

        # 짝수 인원 매칭
        random.shuffle(players)
        pairs = []
        available = list(players)
        while len(available) >= 2:
            a = available.pop(0)
            matched = False
            for i, b in enumerate(available):
                hist_a = self.state.match_history.get(a.name, [])
                if hist_a.count(b.name) < 2:
                    pairs.append((a, b))
                    available.pop(i)
                    matched = True
                    break
            if not matched:
                b = available.pop(0)
                pairs.append((a, b))
        return pairs

    def _pick_pairs_n_players_by_index(self, indices: list) -> list:
        """N인(5~8) 인덱스 기반 쌍 생성. generate_matchups() 내부용."""
        players = self.state.players
        active = list(indices)
        n = len(active)

        if n % 2 == 1:
            bye_counts = self._get_bye_counts()
            bye_idx = min(active, key=lambda i: bye_counts.get(players[i].name, 0))
            self._record_bye(players[bye_idx].name)
            active = [i for i in active if i != bye_idx]

        random.shuffle(active)
        pairs = []
        available = list(active)
        while len(available) >= 2:
            a = available.pop(0)
            matched = False
            for i, b in enumerate(available):
                hist_a = self.state.match_history.get(players[a].name, [])
                if hist_a.count(players[b].name) < 2:
                    pairs.append((a, b))
                    available.pop(i)
                    matched = True
                    break
            if not matched:
                b = available.pop(0)
                pairs.append((a, b))
        return pairs

    def _return_unplaced_cards(self, player) -> None:
        """FL 배치 완료 후 보드에 배치되지 않은 카드를 풀로 반환."""
        placed_ids = set()
        for line in ['top', 'mid', 'bottom']:
            for card in getattr(player.board, line):
                placed_ids.add(id(card))
        for card in player.shop_cards:
            if id(card) not in placed_ids:
                self.state.pool.return_card(card)
        player.shop_cards = []

    def end_round(self):
        """라운드 종료: 번호 증가, 판타지랜드 전환, 보드 리셋, 증강체 선택, 탈락자 처리"""
        self.state.phase = 'result'
        self.state.round_num += 1

        # Phase 1: 현재 FL 플레이어의 보드에서 유지 조건 판정 (플래그 전환 전)
        from src.hand import HandType, evaluate_hand
        fl_keep_players = set()
        for player in self.state.players:
            if player.in_fantasyland and player.board.top:
                top_hand = evaluate_hand(player.board.top)
                if top_hand.hand_type >= HandType.THREE_OF_A_KIND:
                    fl_keep_players.add(id(player))

        # Phase 2: 플래그 전환 + 보드 리셋
        from src.board import OFCBoard
        for player in self.state.players:
            if player.fantasyland_next:
                player.in_fantasyland = True
                player.fantasyland_next = False
            else:
                player.in_fantasyland = False
            # FL 진입/유지 플레이어는 보드 리셋 제외
            if not player.in_fantasyland:
                player.board = OFCBoard()

        # Phase 3: FL 유지 조건 충족 플레이어에게 fantasyland_next 재설정
        for player in self.state.players:
            if id(player) in fl_keep_players:
                player.fantasyland_next = True

        # 증강체 선택 페이즈 (라운드 2→3, 3→4, 4→5 종료 시)
        if self.state.round_num in (3, 4, 5):
            self._offer_augments()

        # 탈락자 처리
        self.state.players = [p for p in self.state.players if p.hp > 0]

        if self.state.is_game_over():
            self.state.phase = 'end'
        else:
            self.state.phase = 'prep'

    def _offer_augments(self) -> None:
        """각 플레이어에게 SILVER_AUGMENTS 중 3개 제시 후 1개 선택.

        selector 콜백이 있으면 CLI 선택 UI 호출, 없으면 자동으로 첫 번째 선택.
        """
        from src.augment import SILVER_AUGMENTS
        for player in self.state.players:
            available = [a for a in SILVER_AUGMENTS if not player.has_augment(a.id)]
            choices = random.sample(available, min(3, len(available)))
            if not choices:
                continue
            if self.augment_selector is not None:
                selected = self.augment_selector(player, choices)
            else:
                selected = choices[0]
            if selected is not None:
                player.add_augment(selected)
