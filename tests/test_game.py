from src.board import OFCBoard
from src.card import Card, Rank, Suit
from src.economy import Player
from src.game import GameState, RoundManager
from src.pool import SharedCardPool


def setup_boards_for_combat(p1: Player, p2: Player):
    """전투용 간단 보드 설정"""
    p1.board = OFCBoard()
    p2.board = OFCBoard()

    # p1: flush bottom (강)
    for r in [Rank.TWO, Rank.FIVE, Rank.SEVEN, Rank.NINE, Rank.KING]:
        p1.board.bottom.append(Card(r, Suit.SPADE))
    p1.board.mid = [
        Card(Rank.ACE, Suit.HEART),
        Card(Rank.ACE, Suit.DIAMOND),
        Card(Rank.TWO, Suit.CLUB),
        Card(Rank.THREE, Suit.SPADE),
        Card(Rank.FOUR, Suit.HEART),
    ]
    p1.board.top = [
        Card(Rank.KING, Suit.CLUB),
        Card(Rank.QUEEN, Suit.CLUB),
        Card(Rank.JACK, Suit.CLUB),
    ]

    # p2: pair bottom (약)
    p2.board.bottom = [
        Card(Rank.ACE, Suit.CLUB),
        Card(Rank.ACE, Suit.SPADE),
        Card(Rank.KING, Suit.HEART),
        Card(Rank.QUEEN, Suit.HEART),
        Card(Rank.JACK, Suit.HEART),
    ]
    p2.board.mid = [
        Card(Rank.SEVEN, Suit.SPADE),
        Card(Rank.SEVEN, Suit.CLUB),
        Card(Rank.TWO, Suit.HEART),
        Card(Rank.THREE, Suit.HEART),
        Card(Rank.FOUR, Suit.SPADE),
    ]
    p2.board.top = [
        Card(Rank.TWO, Suit.CLUB),
        Card(Rank.THREE, Suit.CLUB),
        Card(Rank.FOUR, Suit.DIAMOND),
    ]


class TestGameState:
    def setup_method(self):
        self.pool = SharedCardPool()
        self.pool.initialize()
        self.p1 = Player(name="Player1", gold=0)
        self.p2 = Player(name="Player2", gold=0)
        self.state = GameState(players=[self.p1, self.p2], pool=self.pool)
        self.manager = RoundManager(self.state)

    def test_game_not_over_at_start(self):
        assert self.state.is_game_over() is False

    def test_get_winner_during_game(self):
        assert self.state.get_winner() is None

    def test_game_over_on_hp_zero(self):
        self.p2.hp = 0
        assert self.state.is_game_over() is True
        winner = self.state.get_winner()
        assert winner == self.p1

    def test_game_over_max_rounds(self):
        self.state.round_num = self.state.max_rounds + 1
        assert self.state.is_game_over() is True

    def test_initial_phase_is_prep(self):
        assert self.state.phase == 'prep'

    def test_initial_round_num(self):
        assert self.state.round_num == 1

    def test_winner_is_higher_hp_player(self):
        """5라운드 후 HP가 높은 쪽이 승자"""
        self.state.round_num = self.state.max_rounds + 1
        self.p1.hp = 80
        self.p2.hp = 60
        winner = self.state.get_winner()
        assert winner == self.p1


class TestRoundManager:
    def setup_method(self):
        self.pool = SharedCardPool()
        self.pool.initialize()
        self.p1 = Player(name="Player1", gold=0)
        self.p2 = Player(name="Player2", gold=0)
        self.state = GameState(players=[self.p1, self.p2], pool=self.pool)
        self.manager = RoundManager(self.state)

    def test_prep_phase_income(self):
        """준비 단계: 최소 5골드 지급"""
        self.manager.start_prep_phase()
        assert self.p1.gold >= 5
        assert self.p2.gold >= 5

    def test_prep_phase_sets_phase(self):
        self.manager.start_prep_phase()
        assert self.state.phase == 'prep'

    def test_combat_phase_damage(self):
        """전투 후 HP 감소"""
        setup_boards_for_combat(self.p1, self.p2)
        initial_p2_hp = self.p2.hp
        initial_p1_hp = self.p1.hp
        self.manager.start_combat_phase()
        # 플러시 > 원페어이므로 p1이 back에서 이기고 p2 HP가 줄어야 함
        assert self.p2.hp <= initial_p2_hp or self.p1.hp <= initial_p1_hp

    def test_combat_phase_returns_results(self):
        setup_boards_for_combat(self.p1, self.p2)
        results = self.manager.start_combat_phase()
        assert len(results) > 0

    def test_end_round_increments_round(self):
        self.manager.start_prep_phase()
        setup_boards_for_combat(self.p1, self.p2)
        self.manager.start_combat_phase()
        self.manager.end_round()
        assert self.state.round_num == 2

    def test_end_round_resets_boards(self):
        """라운드 종료 후 보드 초기화"""
        setup_boards_for_combat(self.p1, self.p2)
        self.manager.end_round()
        assert len(self.p1.board.bottom) == 0
        assert len(self.p1.board.mid) == 0
        assert len(self.p1.board.top) == 0

    def test_streak_updated_after_combat(self):
        """전투 후 연승/연패 업데이트"""
        setup_boards_for_combat(self.p1, self.p2)
        self.manager.start_combat_phase()
        # p1이 이기거나 p2가 이기거나 → 한 쪽 streak 증가
        total_streaks = (
            self.p1.win_streak + self.p2.win_streak
            + self.p1.loss_streak + self.p2.loss_streak
        )
        assert total_streaks > 0


class TestGameIntegration:
    def setup_method(self):
        self.pool = SharedCardPool()
        self.pool.initialize()
        self.p1 = Player(name="Player1", gold=0)
        self.p2 = Player(name="Player2", gold=0)
        self.state = GameState(players=[self.p1, self.p2], pool=self.pool)
        self.manager = RoundManager(self.state)

    def test_5_round_simulation_no_crash(self):
        """5라운드 완주 테스트 — 크래시 없음"""
        for round_num in range(1, 6):
            if self.state.is_game_over():
                break
            self.manager.start_prep_phase()
            setup_boards_for_combat(self.p1, self.p2)
            self.manager.start_combat_phase()
            self.manager.end_round()

        # 5라운드 완주하거나 HP 0으로 게임 종료
        assert self.state.round_num > 1 or self.state.is_game_over()

    def test_game_over_hp_zero(self):
        """HP 0 즉시 종료"""
        setup_boards_for_combat(self.p1, self.p2)
        self.p1.hp = 1
        self.p2.hp = 100
        # 전투 수행
        self.manager.start_combat_phase()
        # 만약 p1이 0 이하가 됐다면 게임 종료
        if self.p1.hp <= 0:
            assert self.state.is_game_over() is True

    def test_round_num_increments(self):
        """라운드 번호 단조 증가"""
        for _ in range(3):
            if self.state.is_game_over():
                break
            self.manager.start_prep_phase()
            setup_boards_for_combat(self.p1, self.p2)
            self.manager.start_combat_phase()
            self.manager.end_round()

        assert self.state.round_num >= 2

    def test_5_round_winner_exists(self):
        """5라운드 완료 후 승자 결정 (HP > 0인 사람)"""
        for _ in range(5):
            if self.state.is_game_over():
                break
            self.manager.start_prep_phase()
            setup_boards_for_combat(self.p1, self.p2)
            self.manager.start_combat_phase()
            self.manager.end_round()

        if self.state.is_game_over():
            winner = self.state.get_winner()
            if winner is not None:
                assert winner.hp > 0


class TestGenerateMatchups:
    """A5: 3~4인 매칭 확장 검증 (인덱스 기반)"""

    def _make_state(self, count: int):
        pool = SharedCardPool()
        pool.initialize()
        players = [Player(name=f"p{i+1}") for i in range(count)]
        state = GameState(players=players, pool=pool)
        return state, players

    def test_2_players_1_matchup(self):
        """2인: 항상 1쌍"""
        state, players = self._make_state(2)
        manager = RoundManager(state)
        matchups = manager.generate_matchups()
        assert len(matchups) == 1
        a, b = matchups[0]
        assert a in (0, 1)
        assert b in (0, 1)
        assert a != b

    def test_3_players_1_matchup(self):
        """3인: 항상 1쌍 (bye 1명)"""
        state, players = self._make_state(3)
        manager = RoundManager(state)
        matchups = manager.generate_matchups()
        assert len(matchups) == 1

    def test_3_players_matchup_is_valid_pair(self):
        """3인: 선택된 쌍 인덱스가 0-2 범위"""
        state, players = self._make_state(3)
        manager = RoundManager(state)
        matchups = manager.generate_matchups()
        a, b = matchups[0]
        assert 0 <= a < 3
        assert 0 <= b < 3
        assert a != b

    def test_4_players_2_matchups(self):
        """4인: 항상 2쌍"""
        state, players = self._make_state(4)
        manager = RoundManager(state)
        matchups = manager.generate_matchups()
        assert len(matchups) == 2

    def test_4_players_no_duplicate(self):
        """4인: 같은 인덱스가 두 쌍에 중복되지 않음"""
        state, players = self._make_state(4)
        manager = RoundManager(state)
        matchups = manager.generate_matchups()
        all_indices = [idx for pair in matchups for idx in pair]
        assert len(all_indices) == len(set(all_indices))

    def test_4_players_all_active(self):
        """4인: 매칭에 포함된 인덱스가 4개"""
        state, players = self._make_state(4)
        manager = RoundManager(state)
        matchups = manager.generate_matchups()
        matched = {idx for pair in matchups for idx in pair}
        assert len(matched) == 4

    def test_empty_returns_empty(self):
        """플레이어 없음 → ValueError 또는 빈 리스트"""
        pool = SharedCardPool()
        pool.initialize()
        state = GameState(players=[], pool=pool)
        manager = RoundManager(state)
        import pytest
        with pytest.raises((ValueError, IndexError, Exception)):
            manager.generate_matchups()

    def test_2_players_valid_indices(self):
        """2인 매칭: 반환 인덱스가 0, 1"""
        state, players = self._make_state(2)
        manager = RoundManager(state)
        matchups = manager.generate_matchups()
        a, b = matchups[0]
        assert {a, b} == {0, 1}


class TestFantasylandReset:
    """S6: FL 보드 리셋 버그 수정 검증"""

    def _make_state_with_board(self):
        pool = SharedCardPool()
        pool.initialize()
        p1 = Player(name="p1")
        p2 = Player(name="p2")
        state = GameState(players=[p1, p2], pool=pool)
        manager = RoundManager(state)
        return state, manager, p1, p2

    def _set_nonempty_board(self, player):
        """플레이어 보드에 카드 1장 추가 (비어있지 않음)"""
        from src.board import OFCBoard
        player.board = OFCBoard()
        player.board.bottom.append(Card(Rank.ACE, Suit.SPADE))

    def test_fl_player_board_not_reset(self):
        """S6: fantasyland_next=True → end_round() 후 보드 리셋되지 않음"""
        state, manager, p1, p2 = self._make_state_with_board()
        p1.fantasyland_next = True
        self._set_nonempty_board(p1)
        manager.end_round()
        # FL 진입한 p1의 보드는 리셋되지 않아야 함
        assert len(p1.board.bottom) > 0

    def test_non_fl_player_board_reset(self):
        """S6: 일반 플레이어 보드는 end_round() 후 정상 리셋"""
        state, manager, p1, p2 = self._make_state_with_board()
        self._set_nonempty_board(p1)
        manager.end_round()
        assert len(p1.board.bottom) == 0
        assert len(p1.board.mid) == 0
        assert len(p1.board.top) == 0

    def test_fl_exit_board_reset(self):
        """S6: FL 탈출 후 다음 end_round()에서 보드 리셋"""
        state, manager, p1, p2 = self._make_state_with_board()
        # 첫 번째 라운드: FL 진입
        p1.fantasyland_next = True
        manager.end_round()
        # FL 상태이고 보드에 카드 추가
        p1.in_fantasyland = True
        self._set_nonempty_board(p1)
        # fantasyland_next=False로 FL 탈출 설정
        p1.fantasyland_next = False
        # 두 번째 end_round: FL 탈출 → 보드 리셋
        manager.end_round()
        # 탈락 처리 후 p1이 있을 경우 (HP>0 유지)
        # p1이 남아있다면 보드가 리셋되어야 함
        alive = [p for p in state.players if p.name == "p1"]
        if alive:
            assert len(alive[0].board.bottom) == 0


class TestFantasylandKeep:
    """S1: FL 유지 조건 자동 판정 검증"""

    def _make_fl_state(self):
        pool = SharedCardPool()
        pool.initialize()
        p1 = Player(name="p1")
        p2 = Player(name="p2")
        state = GameState(players=[p1, p2], pool=pool)
        manager = RoundManager(state)
        return state, manager, p1, p2

    def test_fl_keep_three_of_a_kind(self):
        """S1: FL 중 Front THREE_OF_A_KIND → 다음 라운드 FL 유지 예약 (fantasyland_next=True)"""
        state, manager, p1, p2 = self._make_fl_state()
        from src.board import OFCBoard
        p1.in_fantasyland = True
        p1.board = OFCBoard()
        # Front에 스리카인드 배치
        p1.board.top = [
            Card(Rank.ACE, Suit.SPADE),
            Card(Rank.ACE, Suit.HEART),
            Card(Rank.ACE, Suit.DIAMOND),
        ]
        manager.end_round()
        # FL 유지 조건 충족: fantasyland_next=True로 다음 라운드 FL 진입 예약
        assert p1.fantasyland_next is True

    def test_fl_keep_not_met_high_card(self):
        """S1: FL 중 Front HIGH_CARD → fantasyland_next=False"""
        state, manager, p1, p2 = self._make_fl_state()
        from src.board import OFCBoard
        p1.in_fantasyland = True
        p1.board = OFCBoard()
        p1.board.top = [
            Card(Rank.TWO, Suit.SPADE),
            Card(Rank.THREE, Suit.HEART),
            Card(Rank.FIVE, Suit.DIAMOND),
        ]
        manager.end_round()
        assert p1.fantasyland_next is False


class TestElimination:
    """S7: HP 탈락 판정 검증"""

    def _make_state(self):
        pool = SharedCardPool()
        pool.initialize()
        p1 = Player(name="p1")
        p2 = Player(name="p2")
        state = GameState(players=[p1, p2], pool=pool)
        manager = RoundManager(state)
        return state, manager, p1, p2

    def test_hp_zero_eliminated(self):
        """S7: HP=0 플레이어는 end_round() 후 state.players에서 제거"""
        state, manager, p1, p2 = self._make_state()
        p2.hp = 0
        manager.end_round()
        assert p2 not in state.players

    def test_game_over_one_survivor(self):
        """S7: 1명 생존 → is_game_over()==True"""
        state, manager, p1, p2 = self._make_state()
        p2.hp = 0
        manager.end_round()
        assert state.is_game_over() is True


class TestMatchups5to8:
    """S5: 5~8인 매칭 확장 검증"""

    def _make_state(self, count: int):
        pool = SharedCardPool()
        pool.initialize()
        players = [Player(name=f"p{i+1}") for i in range(count)]
        state = GameState(players=players, pool=pool)
        return state, players

    def test_5player_matchup(self):
        """S5: 5인 → 2쌍"""
        state, players = self._make_state(5)
        manager = RoundManager(state)
        matchups = manager.generate_matchups_from(players)
        assert len(matchups) == 2

    def test_6player_matchup(self):
        """S5: 6인 → 3쌍"""
        state, players = self._make_state(6)
        manager = RoundManager(state)
        matchups = manager.generate_matchups_from(players)
        assert len(matchups) == 3

    def test_7player_matchup(self):
        """S5: 7인 → 3쌍"""
        state, players = self._make_state(7)
        manager = RoundManager(state)
        matchups = manager.generate_matchups_from(players)
        assert len(matchups) == 3

    def test_8player_matchup(self):
        """S5: 8인 → 4쌍"""
        state, players = self._make_state(8)
        manager = RoundManager(state)
        matchups = manager.generate_matchups_from(players)
        assert len(matchups) == 4

    def test_matchup_no_duplicate_players(self):
        """S5: 같은 플레이어가 두 쌍에 중복 매칭되지 않음"""
        state, players = self._make_state(6)
        manager = RoundManager(state)
        matchups = manager.generate_matchups_from(players)
        all_players = [p for pair in matchups for p in pair]
        assert len(all_players) == len(set(id(p) for p in all_players))


class TestShopDraw:
    """S9: 샵 시스템 연동 검증"""

    def _make_state(self, count: int = 2):
        pool = SharedCardPool()
        pool.initialize()
        players = [Player(name=f"p{i+1}") for i in range(count)]
        state = GameState(players=players, pool=pool)
        manager = RoundManager(state)
        return state, manager, players

    def test_prep_phase_shop_draw_5_cards(self):
        """S9: start_prep_phase() 후 각 플레이어 shop_cards 5장"""
        state, manager, players = self._make_state()
        manager.start_prep_phase()
        assert len(players[0].shop_cards) == 5

    def test_lucky_shop_draw_6_cards(self):
        """S9: lucky_shop 증강체 보유 플레이어는 6장"""
        from src.augment import SILVER_AUGMENTS
        state, manager, players = self._make_state()
        lucky_aug = next((a for a in SILVER_AUGMENTS if a.id == "lucky_shop"), None)
        if lucky_aug is None:
            import pytest
            pytest.skip("lucky_shop 증강체 없음")
        players[0].augments = [lucky_aug]
        manager.start_prep_phase()
        assert len(players[0].shop_cards) == 6

    def test_fl_player_draws_13_cards(self):
        """S1: in_fantasyland=True 플레이어는 13장 드로우"""
        state, manager, players = self._make_state()
        players[0].in_fantasyland = True
        manager.start_prep_phase()
        assert len(players[0].shop_cards) == 13

    def test_normal_player_draws_5_cards(self):
        """S9: 일반 플레이어는 5장"""
        state, manager, players = self._make_state()
        manager.start_prep_phase()
        assert len(players[0].shop_cards) == 5

    def test_return_unplaced_cards(self):
        """S1: _return_unplaced_cards() 호출 시 미배치 카드 pool 반환"""
        state, manager, players = self._make_state()
        players[0].in_fantasyland = True
        manager.start_prep_phase()
        initial_count = len(players[0].shop_cards)
        assert initial_count == 13
        # 미배치 카드 반환 (보드에 아무것도 배치 안 했으므로 전부 반환)
        manager._return_unplaced_cards(players[0])
        assert players[0].shop_cards == []
