/**
 * OFC Pineapple 학습 데이터 수집 모듈
 * 각 결정(state-action-reward)을 JSONL 형식으로 저장
 */

const fs = require('fs');
const path = require('path');

class TrainingLogger {
  /**
   * @param {string} outputDir - 출력 디렉토리 경로
   */
  constructor(outputDir = 'data/training') {
    this.outputDir = outputDir;
    this.buffer = []; // 파일에 flush 전까지 메모리에 보관
    this.decisions = new Map(); // gameId-handNumber → decision 배열
    this.stats = {
      totalDecisions: 0,
      totalHands: 0,
      totalGames: 0,
      foulCount: 0,
      fantasylandEntries: 0,
      avgScore: 0,
      scoreSum: 0
    };
    this.gameIds = new Set();

    // 출력 디렉토리 생성
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * 매 결정마다 호출 — state-action-evaluation 기록
   * @param {string} gameId - 게임 고유 ID
   * @param {number} handNumber - 핸드 번호
   * @param {number} round - 현재 라운드 (1~5)
   * @param {string} playerId - 플레이어 ID
   * @param {Object} state - 현재 게임 상태
   * @param {Object} action - 수행한 액션
   * @param {Object} evaluation - 점수 평가
   */
  logDecision(gameId, handNumber, round, playerId, state, action, evaluation) {
    const key = `${gameId}-${handNumber}`;

    if (!this.decisions.has(key)) {
      this.decisions.set(key, []);
    }

    const decision = {
      gameId,
      handNumber,
      round,
      playerId,
      timestamp: Date.now(),
      state: {
        board: state.board || { top: [], mid: [], bottom: [] },
        hand: state.hand || [],
        dead_cards: state.dead_cards || state.deadCards || [],
        remaining_deck_size: state.remaining_deck_size || state.remainingDeckSize || 0,
        current_royalty: state.current_royalty || state.currentRoyalty || { top: 0, mid: 0, bottom: 0 },
        is_fantasyland: state.is_fantasyland || state.isFantasyland || false,
        round,
        hand_number: handNumber
      },
      action: {
        placements: (action.placements || []).map(p => ({
          card: { rank: p.card.rank, suit: p.card.suit },
          line: p.line
        })),
        discard: action.discard ? { rank: action.discard.rank, suit: action.discard.suit } : null
      },
      evaluation: {
        score_function: evaluation.score_function || evaluation.scoreFunction || 0,
        foul_risk: evaluation.foul_risk || evaluation.foulRisk || 0,
        fl_probability: evaluation.fl_probability || evaluation.flProbability || 0
      },
      result: null // 핸드 종료 후 추가
    };

    this.decisions.get(key).push(decision);
    this.stats.totalDecisions++;

    if (!this.gameIds.has(gameId)) {
      this.gameIds.add(gameId);
      this.stats.totalGames++;
    }
  }

  /**
   * 핸드 종료 시 호출 — 해당 핸드의 모든 decision에 result 추가
   * @param {string} gameId - 게임 고유 ID
   * @param {number} handNumber - 핸드 번호
   * @param {Object} result - 핸드 결과
   */
  logHandResult(gameId, handNumber, result) {
    const key = `${gameId}-${handNumber}`;
    const decisions = this.decisions.get(key);

    if (!decisions || decisions.length === 0) {
      return;
    }

    const handResult = {
      final_score: result.final_score || result.finalScore || 0,
      royalties: result.royalties || { top: 0, mid: 0, bottom: 0, total: 0 },
      fouled: result.fouled || false,
      fantasyland_entry: result.fantasyland_entry || result.fantasylandEntry || false,
      opponent_scores: result.opponent_scores || result.opponentScores || []
    };

    // 모든 decision에 result 추가
    for (const decision of decisions) {
      decision.result = handResult;
    }

    // 통계 업데이트
    this.stats.totalHands++;
    this.stats.scoreSum += handResult.final_score;
    this.stats.avgScore = this.stats.scoreSum / this.stats.totalHands;
    if (handResult.fouled) this.stats.foulCount++;
    if (handResult.fantasyland_entry) this.stats.fantasylandEntries++;

    // buffer에 추가 (flush 대기)
    for (const decision of decisions) {
      this.buffer.push(decision);
    }

    // 메모리 해제
    this.decisions.delete(key);
  }

  /**
   * 버퍼의 데이터를 파일에 flush
   * @returns {string|null} 생성된 파일 경로 또는 null
   */
  flush() {
    if (this.buffer.length === 0) {
      return null;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `training-${timestamp}.jsonl`;
    const filepath = path.join(this.outputDir, filename);

    const lines = this.buffer.map(d => JSON.stringify(d));
    fs.writeFileSync(filepath, lines.join('\n') + '\n', 'utf-8');

    const flushedCount = this.buffer.length;
    this.buffer = [];

    return filepath;
  }

  /**
   * 통계 반환
   * @returns {Object} 수집 통계
   */
  getStats() {
    return {
      ...this.stats,
      pendingDecisions: this.buffer.length,
      unresolvedHands: this.decisions.size
    };
  }
}

module.exports = { TrainingLogger };
