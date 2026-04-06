/**
 * 방/게임 상태 관리 모듈
 * OFC Pineapple 게임의 전체 라이프사이클 관리
 */

const { EventEmitter } = require('events');
const { v4: uuidv4 } = require('uuid');
const { createDeck, shuffle, dealCards, cardsEqual } = require('./deck');
const { evaluateLine, isFoul } = require('./evaluator');
const { calcTotalRoyalty, checkFantasylandEntry, checkFantasylandStay } = require('./royalty');
const { scoreHand } = require('./scorer');

/**
 * 게임 방 클래스
 *
 * Events:
 *   'empty'                        — 방에 플레이어가 0명이 됨
 *   'playerRemoved'  (playerId, result) — removePlayer 완료
 *   'disconnectTimeout' (playerId, result) — disconnect 타이머 만료로 퇴장
 */
class Room extends EventEmitter {
  constructor({ name, maxPlayers = 3, turnTimeLimit = 60, password = '' }) {
    super();
    this.id = uuidv4();
    this.name = name;
    this.maxPlayers = Math.min(Math.max(maxPlayers, 2), 6);
    this.turnTimeLimit = turnTimeLimit; // 초 단위, 0이면 타임아웃 없음
    this.password = password || '';

    // 플레이어 관리
    this.players = new Map(); // playerId → PlayerState
    this.playerOrder = []; // 플레이어 ID 순서 (딜링 순서)
    this.hostId = null;

    // 세션 토큰 매핑 (재접속용)
    this.sessionTokens = new Map(); // sessionToken → playerId
    this.disconnectTimers = new Map(); // playerId → setTimeout ref

    // 게임 상태
    this.phase = 'waiting'; // waiting | playing | scoring | finished
    this.deck = [];
    this.discardPile = []; // 4인+ 게임: 버린 카드 풀 (덱 재충전용)
    this.round = 0; // 0: 게임 시작 전, 1~5: 현재 라운드
    this.handNumber = 0;
    this.currentTurnIndex = 0;
    this.turnTimer = null;
    this.turnDeadline = null;

    // 딜러 버튼
    this.dealerButtonId = null;
    this.playOrFoldChoices = new Map();
    this.playOrFoldOrder = [];       // play/fold 선택 순서
    this.playOrFoldCurrentIdx = 0;   // 현재 선택할 차례

    // 핸드 종료 대기
    this.readyPlayers = new Set();

    // WebSocket 연결 관리
    this.connections = new Map(); // playerId → ws
  }

  /**
   * 방 정보 (로비용)
   */
  toRoomInfo() {
    return {
      id: this.id,
      name: this.name,
      max_players: this.maxPlayers,
      turn_time_limit: this.turnTimeLimit,
      playerCount: this.players.size,
      players: this.getPlayerNames(),
      phase: this.phase,
      hasPassword: this.password !== '',
    };
  }

  checkPassword(input) {
    if (this.password === '') return true;
    return input === this.password;
  }

  getPlayerNames() {
    return Array.from(this.players.values()).map(p => p.name);
  }

  /**
   * 플레이어 참가
   */
  addPlayer(playerName, ws) {
    if (this.players.size >= this.maxPlayers) {
      return { error: '방이 가득 찼습니다.' };
    }
    if (this.phase !== 'waiting') {
      return { error: '게임이 이미 진행 중입니다.' };
    }

    const playerId = uuidv4();
    const sessionToken = uuidv4();

    const playerState = {
      id: playerId,
      name: playerName,
      sessionToken,
      hand: [], // 현재 손에 들고 있는 카드
      board: { top: [], mid: [], bottom: [] },
      discarded: [], // 이번 라운드에 버린 카드들
      placed: [], // 이번 라운드에 배치한 카드들 (확정 전)
      confirmed: false, // 이번 라운드 배치 확정 여부
      inFantasyland: false,
      fouled: false,
      folded: false,
      totalScore: 0,
      connected: true
    };

    this.players.set(playerId, playerState);
    this.playerOrder.push(playerId);
    this.sessionTokens.set(sessionToken, playerId);
    this.connections.set(playerId, ws);

    // 첫 플레이어가 호스트
    if (!this.hostId) {
      this.hostId = playerId;
    }

    return {
      playerId,
      sessionToken,
      playerCount: this.players.size,
      hostId: this.hostId,
      players: this.getPlayerNames(),
      playerName
    };
  }

  /**
   * 플레이어 나가기
   */
  removePlayer(playerId) {
    const player = this.players.get(playerId);
    if (!player) return null;

    const wasHost = this.hostId === playerId;

    this.players.delete(playerId);
    this.playerOrder = this.playerOrder.filter(id => id !== playerId);
    this.connections.delete(playerId);

    // 호스트 이관
    if (this.hostId === playerId && this.playerOrder.length > 0) {
      this.hostId = this.playerOrder[0];
    }

    let result;
    if (this.phase === 'playing') {
      const activePlayers = this.getActivePlayers();
      if (activePlayers.length <= 1) {
        result = { action: 'gameOver', hostChanged: wasHost };
      } else if (this.getCurrentTurnPlayerId() === playerId) {
        result = { action: 'nextTurn', hostChanged: true };
      }
    }
    if (!result) {
      result = {
        action: 'playerLeft',
        hostChanged: wasHost,
        players: this.getPlayerNames()
      };
    }

    this.emit('playerRemoved', playerId, result);
    if (this.players.size === 0) {
      this.emit('empty');
    }
    return result;
  }

  /**
   * 재접속
   */
  reconnectPlayer(sessionToken, ws) {
    const playerId = this.sessionTokens.get(sessionToken);
    if (!playerId) return null;

    const player = this.players.get(playerId);
    if (!player) return { rejoinRequired: true, playerId };

    player.connected = true;
    this.connections.set(playerId, ws);

    // disconnect 타이머 취소
    const timer = this.disconnectTimers.get(playerId);
    if (timer) {
      clearTimeout(timer);
      this.disconnectTimers.delete(playerId);
    }
    // 전원 이탈 유예 타이머 취소
    if (this._allDisconnectedTimer) {
      clearTimeout(this._allDisconnectedTimer);
      this._allDisconnectedTimer = null;
    }

    return {
      playerId,
      gameState: this.getGameState(playerId)
    };
  }

  /**
   * 플레이어 연결 해제 (나가기가 아닌 연결 끊김)
   */
  disconnectPlayer(playerId) {
    const player = this.players.get(playerId);
    if (player) {
      player.connected = false;
    }
    this.connections.delete(playerId);

    // waiting: 30초 후 퇴장, playing: 120초 후 퇴장
    const timeout = this.phase === 'playing' ? 120000 : 30000;
    this.disconnectTimers.set(playerId, setTimeout(() => {
      this.disconnectTimers.delete(playerId);
      const p = this.players.get(playerId);
      if (p && !p.connected) {
        const result = this.removePlayer(playerId);
        this.emit('disconnectTimeout', playerId, result);
      }
    }, timeout));
  }

  /**
   * 게임 시작 (호스트만)
   */
  startGame(playerId) {
    if (playerId !== this.hostId) {
      return { error: '호스트만 게임을 시작할 수 있습니다.' };
    }
    if (this.players.size < 2) {
      return { error: '최소 2명의 플레이어가 필요합니다.' };
    }
    if (this.phase !== 'waiting') {
      return { error: '게임이 이미 진행 중입니다.' };
    }

    this.phase = 'dealing';
    const dealerResult = this.determineDealerButton();

    return dealerResult;
  }

  /**
   * 딜러 버튼 결정
   */
  determineDealerButton() {
    const tempDeck = shuffle(createDeck());
    const dealerCards = {};

    for (const playerId of this.playerOrder) {
      dealerCards[playerId] = dealCards(tempDeck, 1)[0];
    }

    // 가장 높은 카드 찾기 (rank 우선, suit 보조: spade=4 > heart=3 > diamond=2 > club=1)
    let dealerId = null;
    let highestCard = null;
    for (const [id, card] of Object.entries(dealerCards)) {
      if (!highestCard || card.rank > highestCard.rank ||
          (card.rank === highestCard.rank && card.suit > highestCard.suit)) {
        highestCard = card;
        dealerId = id;
      }
    }

    this.dealerButtonId = dealerId;

    // playerOrder를 딜러 기준으로 재정렬 (딜러부터 시계방향)
    const dealerIdx = this.playerOrder.indexOf(dealerId);
    this.playerOrder = [
      ...this.playerOrder.slice(dealerIdx),
      ...this.playerOrder.slice(0, dealerIdx)
    ];

    return { dealerCards, dealerId, playerOrder: [...this.playerOrder] };
  }

  /**
   * Play/Fold 선택 초기화 (5~6인)
   */
  initPlayOrFold() {
    this.playOrFoldChoices.clear();
    // 딜러 다음 사람부터 순서대로, 딜러는 마지막
    this.playOrFoldOrder = [
      ...this.playerOrder.slice(1),
      this.playerOrder[0]
    ];
    this.playOrFoldCurrentIdx = 0;
    return {
      currentPlayerId: this.playOrFoldOrder[0],
      requiredPlayers: 4,
      totalPlayers: this.players.size
    };
  }

  /**
   * Play/Fold 응답 처리
   */
  playOrFoldResponse(playerId, choice) {
    // 순서 확인
    if (this.playOrFoldOrder[this.playOrFoldCurrentIdx] !== playerId) {
      return { error: '현재 선택 차례가 아닙니다.' };
    }

    this.playOrFoldChoices.set(playerId, choice);
    this.playOrFoldCurrentIdx++;

    const playCount = [...this.playOrFoldChoices.values()].filter(c => c === 'play').length;
    const foldCount = [...this.playOrFoldChoices.values()].filter(c => c === 'fold').length;
    const remaining = this.players.size - this.playOrFoldChoices.size;

    // 4명이 play 선택 → 나머지 자동 fold
    if (playCount >= 4) {
      for (const id of this.playOrFoldOrder) {
        if (!this.playOrFoldChoices.has(id)) {
          this.playOrFoldChoices.set(id, 'fold');
        }
      }
    }

    // fold 수가 필요한 수에 도달 → 나머지 전원 자동 play
    const requiredFolds = this.players.size - 4; // 5인→1, 6인→2
    if (requiredFolds > 0 && foldCount >= requiredFolds) {
      for (const id of this.playOrFoldOrder) {
        if (!this.playOrFoldChoices.has(id)) {
          this.playOrFoldChoices.set(id, 'play');
        }
      }
    }

    // 모든 선택 완료
    if (this.playOrFoldChoices.size >= this.players.size) {
      for (const [id, ch] of this.playOrFoldChoices) {
        if (ch === 'fold') {
          const player = this.players.get(id);
          if (player) player.folded = true;
        }
      }
      return {
        action: 'allDecided',
        choices: Object.fromEntries(this.playOrFoldChoices),
        activePlayers: this.getActivePlayers()
      };
    }

    // 다음 차례
    return {
      action: 'waiting',
      playCount,
      foldCount,
      remaining,
      currentPlayerId: this.playOrFoldOrder[this.playOrFoldCurrentIdx],
      lastChoice: { playerId, choice }
    };
  }

  /**
   * 새 핸드 시작
   */
  startNewHand(foldedPlayerIds = []) {
    this.deck = shuffle(createDeck());
    this.discardPile = [];
    this.round = 1;
    this.readyPlayers.clear();

    // 모든 플레이어 상태 초기화
    for (const [playerId, player] of this.players) {
      player.hand = [];
      player.board = { top: [], mid: [], bottom: [] };
      player.discarded = [];
      player.placed = [];
      player.confirmed = false;
      player.fouled = false;
      // Play/Fold에서 fold된 플레이어는 folded 상태 유지
      player.folded = foldedPlayerIds.includes(playerId);
    }

    // 턴 순서 설정 (Fantasyland 플레이어 제외)
    this.currentTurnIndex = 0;

    // Round 1: 5장 딜
    this.dealRound();

    return {
      turnTimeLimit: this.turnTimeLimit,
      currentTurnPlayerId: this.getCurrentTurnPlayerId(),
      gameState: this.getFullGameState()
    };
  }

  /**
   * 현재 라운드에 맞게 카드 딜
   * 2-3인: Pineapple (R1: 5장, R2-R5: 3장 → 2배치+1버림)
   * 4인+: R1: 5장, R2-R4: 3장 → 2배치+1버림, R5: 2장 → 2배치
   *        덱 부족 시 discardPile 셔플 후 재투입
   */
  dealRound() {
    const activePlayers = this.getActivePlayers();
    const nonFLPlayers = activePlayers.filter(id => {
      const p = this.players.get(id);
      return !p.inFantasyland;
    });
    const is4p = activePlayers.length >= 4;

    // 딜링 수 결정
    let cardCount;
    if (this.round === 1) {
      cardCount = 5;
    } else if (is4p && this.round === 5) {
      cardCount = 2; // 4인+ R5: 2장 (버림 없음)
    } else {
      cardCount = 3; // R2-R4: 3장 (2배치+1버림)
    }

    // 4인+ 덱 부족 시 버린 카드 재투입
    const totalNeeded = nonFLPlayers.length * cardCount;
    if (is4p && totalNeeded > this.deck.length && this.discardPile.length > 0) {
      this.deck.push(...shuffle([...this.discardPile]));
      this.discardPile = [];
    }

    for (const playerId of activePlayers) {
      const player = this.players.get(playerId);

      if (player.inFantasyland && this.round === 1) {
        player.hand = dealCards(this.deck, 14);
      } else if (!player.inFantasyland && cardCount > 0) {
        player.hand = dealCards(this.deck, Math.min(cardCount, this.deck.length));
      }

      // FL 플레이어는 라운드 1에서 이미 14장을 받았으므로 상태 보존
      if (!player.inFantasyland) {
        player.placed = [];
        player.discarded = [];
        player.confirmed = false;
      }
    }

    this.startTurnTimer();
  }

  /**
   * 활성 플레이어 목록 (폴드하지 않은)
   */
  getActivePlayers() {
    return this.playerOrder.filter(id => {
      const p = this.players.get(id);
      return p && !p.folded;
    });
  }

  /**
   * 비FL 활성 플레이어 목록 (턴 순서용)
   */
  getNonFLActivePlayers() {
    return this.getActivePlayers().filter(id => {
      const p = this.players.get(id);
      return !p.inFantasyland;
    });
  }

  /**
   * FL 활성 플레이어 목록
   */
  getFLActivePlayers() {
    return this.getActivePlayers().filter(id => {
      const p = this.players.get(id);
      return p.inFantasyland;
    });
  }

  /**
   * 현재 턴 플레이어 ID (FL 제외)
   */
  getCurrentTurnPlayerId() {
    const nonFL = this.getNonFLActivePlayers();
    if (nonFL.length === 0) return null;
    return nonFL[this.currentTurnIndex % nonFL.length];
  }

  /**
   * 카드 배치
   */
  placeCard(playerId, card, line) {
    const player = this.players.get(playerId);
    if (!player) return { error: '플레이어를 찾을 수 없습니다.' };

    if (this.phase !== 'playing') {
      return { error: '현재 카드를 배치할 수 없는 상태입니다.' };
    }

    // Fantasyland이 아닌 경우 턴 체크
    if (!player.inFantasyland && this.getCurrentTurnPlayerId() !== playerId) {
      return { error: '현재 턴이 아닙니다.' };
    }

    if (player.confirmed) {
      return { error: '이미 배치를 확정했습니다.' };
    }

    // 손에 해당 카드가 있는지 확인
    const cardIndex = player.hand.findIndex(c => cardsEqual(c, card));
    if (cardIndex === -1) {
      return { error: '해당 카드를 보유하고 있지 않습니다.' };
    }

    // 라인 용량 체크
    const maxSize = line === 'top' ? 3 : 5;
    if (player.board[line].length >= maxSize) {
      return { error: `${line} 라인이 가득 찼습니다.` };
    }

    // 카드 이동: 손 → 보드
    const [removedCard] = player.hand.splice(cardIndex, 1);
    player.board[line].push(removedCard);
    player.placed.push({ card: removedCard, line });

    // 라인 완성 여부 (이펙트 브로드캐스트용)
    const lineCompleted = player.board[line].length === maxSize
        ? { playerId, line }
        : null;
    return { success: true, lineCompleted };
  }

  /**
   * 카드 배치 취소
   */
  unplaceCard(playerId, card, line) {
    const player = this.players.get(playerId);
    if (!player) return { error: '플레이어를 찾을 수 없습니다.' };

    if (player.confirmed) {
      return { error: '이미 배치를 확정했습니다.' };
    }

    // 보드에서 카드 찾기
    const cardIndex = player.board[line].findIndex(c => cardsEqual(c, card));
    if (cardIndex === -1) {
      return { error: '해당 라인에 카드가 없습니다.' };
    }

    // 이번 라운드에 배치한 카드인지 확인
    const placedIndex = player.placed.findIndex(p => cardsEqual(p.card, card) && p.line === line);
    if (placedIndex === -1) {
      return { error: '이전 라운드에 배치한 카드는 취소할 수 없습니다.' };
    }

    // 카드 이동: 보드 → 손
    const [removedCard] = player.board[line].splice(cardIndex, 1);
    player.hand.push(removedCard);
    player.placed.splice(placedIndex, 1);

    return { success: true };
  }

  /**
   * 카드 버리기
   */
  discardCard(playerId, card) {
    const player = this.players.get(playerId);
    if (!player) return { error: '플레이어를 찾을 수 없습니다.' };

    if (player.confirmed) {
      return { error: '이미 배치를 확정했습니다.' };
    }

    if (this.round === 1 && !player.inFantasyland) {
      return { error: '라운드 1에서는 버릴 수 없습니다.' };
    }

    // 손에 해당 카드가 있는지 확인
    const cardIndex = player.hand.findIndex(c => cardsEqual(c, card));
    if (cardIndex === -1) {
      return { error: '해당 카드를 보유하고 있지 않습니다.' };
    }

    // 버리기 한도 체크
    const maxDiscard = 1;
    if (player.discarded.length >= maxDiscard) {
      return { error: '더 이상 버릴 수 없습니다.' };
    }

    const [removedCard] = player.hand.splice(cardIndex, 1);
    player.discarded.push(removedCard);

    return { success: true };
  }

  /**
   * 카드 버리기 취소
   */
  unDiscardCard(playerId, card) {
    const player = this.players.get(playerId);
    if (!player) return { error: '플레이어를 찾을 수 없습니다.' };

    if (player.confirmed) {
      return { error: '이미 배치를 확정했습니다.' };
    }

    const cardIndex = player.discarded.findIndex(c => cardsEqual(c, card));
    if (cardIndex === -1) {
      return { error: '버린 카드에서 찾을 수 없습니다.' };
    }

    const [removedCard] = player.discarded.splice(cardIndex, 1);
    player.hand.push(removedCard);

    return { success: true };
  }

  /**
   * 배치 확정
   */
  confirmPlacement(playerId) {
    const player = this.players.get(playerId);
    if (!player) return { error: '플레이어를 찾을 수 없습니다.' };

    if (player.confirmed) {
      return { error: '이미 확정했습니다.' };
    }

    // 유효성 검사
    if (player.inFantasyland) {
      // FL: 13장 배치 + 1장 버림
      const totalPlaced = player.board.top.length + player.board.mid.length + player.board.bottom.length;
      if (totalPlaced !== 13) {
        return { error: 'Fantasyland: 13장을 모두 배치해야 합니다.' };
      }
      if (player.discarded.length !== 1) {
        return { error: 'Fantasyland: 1장을 버려야 합니다.' };
      }
    } else if (this.round === 1) {
      // Round 1: 5장 모두 배치
      if (player.hand.length !== 0) {
        return { error: '라운드 1: 5장을 모두 배치해야 합니다.' };
      }
    } else {
      // Round 2~5
      if (player.hand.length !== 0) {
        return { error: '모든 카드를 배치해야 합니다.' };
      }
      const is4p = this.getActivePlayers().length >= 4;
      const is2CardRound = is4p && this.round === 5;
      // 3장 라운드: 2배치 + 1버림, 2장 라운드(4인+ R5): 2배치 + 0버림
      if (!is2CardRound && player.discarded.length !== 1) {
        return { error: '1장을 버려야 합니다.' };
      }
    }

    player.confirmed = true;
    // 버린 카드를 공용 discard pile에 수집 (4인+ 덱 재충전용)
    if (player.discarded.length > 0) {
      this.discardPile.push(...player.discarded);
    }
    player.placed = []; // 확정 후 클리어

    // FL 플레이어는 턴 시스템에서 독립
    if (player.inFantasyland) {
      // FL 완료 → 비FL이 모든 라운드를 끝냈으면 핸드 종료
      const nonFL = this.getNonFLActivePlayers();
      const round = this.round;
      const nonFLConfirmed = nonFL.map(id => ({ id: id.substring(0,4), confirmed: this.players.get(id).confirmed }));
      console.log(`[FL CONFIRM] round=${round}, nonFL=${JSON.stringify(nonFLConfirmed)}`);
      const allNonFLDone = nonFL.length === 0 ||
        (this.round >= 5 && nonFL.every(id => this.players.get(id).confirmed));
      console.log(`[FL CONFIRM] allNonFLDone=${allNonFLDone}`);
      if (allNonFLDone) {
        console.log('[FL CONFIRM] → endHand()');
        return this.endHand();
      }
      return { action: 'flConfirmed' };
    }

    // 비FL: 다음 턴으로 이동
    return this.advanceTurn();
  }

  /**
   * 턴 진행 (비FL 플레이어만, FL과 독립)
   */
  advanceTurn() {
    const nonFL = this.getNonFLActivePlayers();

    // 비FL 전원 확정 체크
    const allNonFLDone = nonFL.every(id => this.players.get(id).confirmed);

    if (allNonFLDone) {
      // 비FL 전원 done → 다음 라운드 (FL 무관하게 진행)
      this.round++;

      if (this.round > 5 || this.deck.length === 0) {
        // 핸드 종료 시점: FL도 완료인지 확인
        const fl = this.getFLActivePlayers();
        const allFLDone = fl.every(id => this.players.get(id).confirmed);
        if (allFLDone) {
          return this.endHand();
        }
        // FL 미완료 → 비FL 대기, FL만 계속 진행
        return { action: 'waitingForFL' };
      }

      this.currentTurnIndex = 0;
      this.dealRound();

      return {
        action: 'newRound',
        round: this.round,
        currentTurnPlayerId: this.getCurrentTurnPlayerId()
      };
    }

    // 다음 비FL 플레이어 턴
    this.currentTurnIndex = (this.currentTurnIndex + 1) % nonFL.length;

    // confirmed 스킵
    let safety = 0;
    while (safety < nonFL.length) {
      const currentId = this.getCurrentTurnPlayerId();
      const currentPlayer = this.players.get(currentId);
      if (!currentPlayer.confirmed) break;
      this.currentTurnIndex = (this.currentTurnIndex + 1) % nonFL.length;
      safety++;
    }

    if (safety >= nonFL.length) {
      return { action: 'turnChanged', currentTurnPlayerId: this.getCurrentTurnPlayerId() };
    }

    this.startTurnTimer();

    return {
      action: 'turnChanged',
      currentTurnPlayerId: this.getCurrentTurnPlayerId()
    };
  }

  /**
   * 모든 보드가 13장 완성되었는지 체크
   */
  isAllBoardsFull() {
    const activePlayers = this.getActivePlayers();
    return activePlayers.every(id => {
      const p = this.players.get(id);
      const total = p.board.top.length + p.board.mid.length + p.board.bottom.length;
      return total >= 13;
    });
  }

  /**
   * 자동 폴드 (타임아웃)
   */
  autoFold(playerId) {
    const player = this.players.get(playerId);
    if (!player || player.confirmed) return null;

    player.folded = true;
    player.fouled = true;

    return this.advanceTurn();
  }

  /**
   * 턴 타이머 시작
   */
  startTurnTimer() {
    this.clearTurnTimer();

    if (this.turnTimeLimit <= 0) return;

    const currentPlayerId = this.getCurrentTurnPlayerId();
    if (!currentPlayerId) return;

    this.turnDeadline = Date.now() / 1000 + this.turnTimeLimit;

    this.turnTimer = setTimeout(() => {
      if (this.phase !== 'playing') return;
      // Guard: 타이머 시작 시점과 현재 턴 플레이어가 다르면 무시
      if (currentPlayerId !== this.getCurrentTurnPlayerId()) return;
      const result = this.autoFold(currentPlayerId);
      if (result && this.onTurnTimeout) {
        this.onTurnTimeout(currentPlayerId, result);
      }
    }, this.turnTimeLimit * 1000);
  }

  /**
   * 턴 타이머 정리
   */
  clearTurnTimer() {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
    this.turnDeadline = null;
  }

  /**
   * 핸드 종료 → 스코어링
   */
  endHand() {
    this.clearTurnTimer();
    this.phase = 'scoring';

    // Foul 체크
    for (const player of this.players.values()) {
      if (!player.folded) {
        const total = player.board.top.length + player.board.mid.length + player.board.bottom.length;
        if (total === 13) {
          // 완성 보드: 일반 Foul 체크 (Bottom >= Mid >= Top)
          player.fouled = isFoul(player.board);
        } else if (total > 0) {
          // 불완전 보드 (4인+ 게임, 덱 소진): Foul 처리
          player.fouled = true;
        } else {
          player.fouled = true;
        }
      }
    }

    // 스코어링 데이터 준비
    const scorePlayers = {};
    for (const [id, player] of this.players) {
      if (!player.folded) {
        scorePlayers[id] = {
          board: player.board,
          fouled: player.fouled
        };
      }
    }

    const results = scoreHand(scorePlayers);

    // 총점 업데이트 + 플레이어 이름 주입
    for (const [id, result] of Object.entries(results)) {
      const player = this.players.get(id);
      if (player) {
        result.name = player.name;
        player.totalScore += result.score;
      }
    }

    // 폴드한 플레이어도 결과에 포함
    for (const [id, player] of this.players) {
      if (player.folded && !results[id]) {
        results[id] = {
          name: player.name,
          score: 0,
          royalties: { top: 0, mid: 0, bottom: 0, total: 0 },
          royaltyTotal: 0,
          lineWins: { top: 0, mid: 0, bottom: 0 },
          lineResults: {},
          fouled: false,
          folded: true,
          scooped: false
        };
      }
    }

    // Fantasyland 체크
    for (const [id, player] of this.players) {
      if (!player.folded && !player.fouled) {
        if (player.inFantasyland) {
          // FL 유지 조건 체크
          player.inFantasyland = checkFantasylandStay(player.board);
        } else {
          // FL 진입 조건 체크
          player.inFantasyland = checkFantasylandEntry(player.board.top);
        }
        if (results[id]) {
          results[id].inFantasyland = player.inFantasyland;
        }
      }
    }

    return {
      action: 'handScored',
      results,
      handNumber: this.handNumber
    };
  }

  /**
   * 다음 핸드 준비 완료
   */
  playerReady(playerId) {
    this.readyPlayers.add(playerId);

    const total = Array.from(this.players.values()).filter(p => p.connected).length;
    const ready = this.readyPlayers.size;

    if (ready >= total) {
      // 다음 핸드 시작
      this.handNumber++;
      this.phase = 'playing';
      return {
        action: 'nextHand',
        readyCount: ready,
        totalCount: total
      };
    }

    return {
      action: 'waitingReady',
      readyCount: ready,
      totalCount: total
    };
  }

  /**
   * 게임 상태 (특정 플레이어 시점)
   */
  getGameState(forPlayerId) {
    const state = {
      phase: this.phase,
      round: this.round,
      handNumber: this.handNumber,
      turnTimeLimit: this.turnTimeLimit,
      turnDeadline: this.turnDeadline,
      serverTime: Date.now() / 1000,
      currentTurnPlayerId: this.getCurrentTurnPlayerId(),
      players: {}
    };

    const currentTurnId = this.getCurrentTurnPlayerId();
    for (const [id, player] of this.players) {
      const isMe = id === forPlayerId;
      // 자기 턴이거나 confirmed 또는 FL일 때만 hand 전달 (순차 딜링 보호)
      const showHand = isMe && (id === currentTurnId || player.confirmed || player.inFantasyland);
      state.players[id] = {
        name: player.name,
        board: player.board,
        hand: showHand ? player.hand : [],
        handCount: player.hand.length,
        inFantasyland: player.inFantasyland,
        confirmed: player.confirmed,
        fouled: player.fouled,
        folded: player.folded,
        totalScore: player.totalScore,
        connected: player.connected
      };
    }

    return state;
  }

  /**
   * 전체 게임 상태 (브로드캐스트용, 손패는 각자에게만)
   */
  getFullGameState() {
    return {
      phase: this.phase,
      round: this.round,
      handNumber: this.handNumber,
      currentTurnPlayerId: this.getCurrentTurnPlayerId()
    };
  }

  /**
   * 특정 플레이어에게 메시지 전송
   */
  sendToPlayer(playerId, type, payload) {
    const ws = this.connections.get(playerId);
    if (ws && ws.readyState === 1) { // WebSocket.OPEN
      ws.send(JSON.stringify({ type, payload }));
    }
  }

  /**
   * 방의 모든 플레이어에게 메시지 전송
   */
  broadcast(type, payload, excludeId = null) {
    for (const [playerId, ws] of this.connections) {
      if (playerId !== excludeId && ws && ws.readyState === 1) {
        ws.send(JSON.stringify({ type, payload }));
      }
    }
  }

  /**
   * 각 플레이어에게 개별화된 메시지 전송
   */
  broadcastIndividual(type, payloadFn) {
    for (const [playerId, ws] of this.connections) {
      if (ws && ws.readyState === 1) {
        const payload = payloadFn(playerId);
        ws.send(JSON.stringify({ type, payload }));
      }
    }
  }
}

module.exports = { Room };
