/**
 * ML Bot — ONNX 모델 기반 OFC Pineapple 배치 결정
 *
 * 가능한 모든 배치 조합을 열거하고 모델로 각 조합을 평가한 뒤
 * 가장 높은 reward 예측값의 조합을 선택한다.
 */

const { extractFeatures } = require('./feature-extractor');
const { isFoul } = require('./evaluator');

// ONNX Runtime 로드 시도
let ort;
try {
  ort = require('onnxruntime-node');
} catch {
  console.warn('[ml-bot] onnxruntime-node not installed. Run: npm install onnxruntime-node');
  ort = null;
}

const LINE_MAX = { top: 3, mid: 5, bottom: 5 };
const LINES = ['top', 'mid', 'bottom'];

/**
 * 보드 깊은 복사
 */
function cloneBoard(board) {
  return {
    top: [...board.top],
    mid: [...board.mid],
    bottom: [...board.bottom]
  };
}

/**
 * 라인에 빈 슬롯이 있는지
 */
function lineHasRoom(board, line) {
  return board[line].length < LINE_MAX[line];
}

/**
 * 카드 N장을 보드에 배치하는 모든 가능한 조합을 생성
 * @param {Array} cards - 배치할 카드 배열
 * @param {Object} board - 현재 보드 상태
 * @returns {Array<Array<{card, line}>>} 가능한 배치 조합 목록
 */
function generatePlacements(cards, board) {
  if (cards.length === 0) return [[]];

  const results = [];
  const card = cards[0];
  const remaining = cards.slice(1);

  for (const line of LINES) {
    // 시뮬레이션 보드에서 슬롯 확인
    const simBoard = cloneBoard(board);
    if (!lineHasRoom(simBoard, line)) continue;

    simBoard[line].push(card);
    const placement = { card, line };

    // 나머지 카드의 배치 조합을 재귀적으로 생성
    const subPlacements = generatePlacements(remaining, simBoard);
    for (const sub of subPlacements) {
      results.push([placement, ...sub]);
    }
  }

  return results;
}

/**
 * 배치 후 보드가 foul인지 빠른 체크 (불완전 보드도 부분 체크)
 */
function wouldFoul(board, placements) {
  const simBoard = cloneBoard(board);
  for (const p of placements) {
    simBoard[p.line].push(p.card);
  }

  // 보드가 완성되지 않으면 완전한 foul 체크 불가 — 허용
  if (simBoard.top.length !== 3 || simBoard.mid.length !== 5 || simBoard.bottom.length !== 5) {
    return false;
  }

  return isFoul(simBoard);
}


class MLBot {
  /**
   * @param {string} modelPath - ONNX 모델 파일 경로
   */
  constructor(modelPath) {
    this.modelPath = modelPath;
    this.session = null;
    this.loaded = false;
  }

  /**
   * ONNX 세션 초기화 (비동기)
   */
  async init() {
    if (!ort) {
      throw new Error('onnxruntime-node not available');
    }
    this.session = await ort.InferenceSession.create(this.modelPath);
    this.loaded = true;
    console.log(`[ml-bot] Model loaded: ${this.modelPath}`);
  }

  /**
   * feature vector를 모델에 넣어 reward 예측
   * @param {number[]} features - 62차원 feature vector
   * @returns {Promise<number>} 예측 reward
   */
  async predict(features) {
    if (!this.loaded) throw new Error('Model not loaded. Call init() first.');

    const inputTensor = new ort.Tensor('float32', Float32Array.from(features), [1, features.length]);
    const results = await this.session.run({ features: inputTensor });
    const output = results.reward || results[Object.keys(results)[0]];
    return output.data[0];
  }

  /**
   * 배치 예측 (여러 feature vector를 한 번에)
   * @param {number[][]} featuresBatch - feature vector 배열
   * @returns {Promise<number[]>} 예측 reward 배열
   */
  async predictBatch(featuresBatch) {
    if (!this.loaded) throw new Error('Model not loaded. Call init() first.');

    const batchSize = featuresBatch.length;
    const inputDim = featuresBatch[0].length;
    const flatData = new Float32Array(batchSize * inputDim);

    for (let i = 0; i < batchSize; i++) {
      for (let j = 0; j < inputDim; j++) {
        flatData[i * inputDim + j] = featuresBatch[i][j];
      }
    }

    const inputTensor = new ort.Tensor('float32', flatData, [batchSize, inputDim]);
    const results = await this.session.run({ features: inputTensor });
    const output = results.reward || results[Object.keys(results)[0]];
    return Array.from(output.data);
  }

  /**
   * 메인 결정 함수 — 가능한 모든 배치 조합을 평가하여 최적 선택
   *
   * @param {Array} hand - 현재 손패
   * @param {Object} board - 현재 보드 { top, mid, bottom }
   * @param {number} round - 라운드 (1~5)
   * @param {Object} options - { isFantasyland, is4Plus, deadCards }
   * @returns {Promise<{placements: Array, discard: Object|null}>}
   */
  async decide(hand, board, round, options = {}) {
    const { isFantasyland = false, is4Plus = false, deadCards = [] } = options;

    if (!hand || hand.length === 0) {
      return { placements: [], discard: null };
    }

    // Fantasyland: 14장 중 13장 배치 + 1장 버림
    if (isFantasyland) {
      return this._decideFL(hand, board, deadCards);
    }

    // R1: 5장 전부 배치, 버림 없음
    if (round === 1) {
      return this._decideNormal(hand, board, round, deadCards, 0);
    }

    // R5 (4인+): 남은 슬롯만큼 배치, 버림 없음
    if (round === 5 && is4Plus) {
      return this._decideNormal(hand, board, round, deadCards, 0);
    }

    // R2-R4 (또는 R5 2-3인): 3장 중 2장 배치 + 1장 버림
    return this._decideWithDiscard(hand, board, round, deadCards);
  }

  /**
   * 버림 없는 배치 (R1, R5 4인+)
   */
  async _decideNormal(hand, board, round, deadCards, discardCount) {
    const allCombos = generatePlacements(hand, board);

    if (allCombos.length === 0) {
      return { placements: [], discard: null };
    }

    // foul 필터
    const validCombos = allCombos.filter(combo => !wouldFoul(board, combo));
    const candidates = validCombos.length > 0 ? validCombos : allCombos;

    // 각 조합에 대해 feature 추출
    const featuresBatch = [];
    for (const combo of candidates) {
      const simBoard = cloneBoard(board);
      for (const p of combo) simBoard[p.line].push(p.card);
      const features = extractFeatures(simBoard, [], round, deadCards);
      featuresBatch.push(features);
    }

    // 배치 예측
    const scores = await this.predictBatch(featuresBatch);

    // 최고 점수 조합 선택
    let bestIdx = 0;
    for (let i = 1; i < scores.length; i++) {
      if (scores[i] > scores[bestIdx]) bestIdx = i;
    }

    return { placements: candidates[bestIdx], discard: null };
  }

  /**
   * 버림 있는 배치 (R2-R4)
   */
  async _decideWithDiscard(hand, board, round, deadCards) {
    let bestScore = -Infinity;
    let bestPlacements = [];
    let bestDiscard = null;

    // 각 카드를 버림 후보로 설정
    for (let d = 0; d < hand.length; d++) {
      const discard = hand[d];
      const toPlace = hand.filter((_, i) => i !== d);

      const allCombos = generatePlacements(toPlace, board);
      if (allCombos.length === 0) continue;

      const validCombos = allCombos.filter(combo => !wouldFoul(board, combo));
      const candidates = validCombos.length > 0 ? validCombos : allCombos;

      const featuresBatch = [];
      for (const combo of candidates) {
        const simBoard = cloneBoard(board);
        for (const p of combo) simBoard[p.line].push(p.card);
        const features = extractFeatures(simBoard, [], round, [...deadCards, discard]);
        featuresBatch.push(features);
      }

      const scores = await this.predictBatch(featuresBatch);

      for (let i = 0; i < scores.length; i++) {
        if (scores[i] > bestScore) {
          bestScore = scores[i];
          bestPlacements = candidates[i];
          bestDiscard = discard;
        }
      }
    }

    return { placements: bestPlacements, discard: bestDiscard };
  }

  /**
   * Fantasyland 결정: 14장 → 13장 배치 + 1장 버림
   */
  async _decideFL(hand, board, deadCards) {
    // FL은 조합이 폭발적이므로 상위 N개만 샘플링
    const MAX_SAMPLES = 500;
    let bestScore = -Infinity;
    let bestPlacements = [];
    let bestDiscard = null;

    for (let d = 0; d < hand.length; d++) {
      const discard = hand[d];
      const toPlace = hand.filter((_, i) => i !== d);
      if (toPlace.length !== 13) continue;

      // 간단 전략: rank 정렬 후 bottom 5, mid 5, top 3
      const sorted = [...toPlace].sort((a, b) => b.rank - a.rank);
      const placements = [];
      for (let i = 0; i < 5; i++) placements.push({ card: sorted[i], line: 'bottom' });
      for (let i = 5; i < 10; i++) placements.push({ card: sorted[i], line: 'mid' });
      for (let i = 10; i < 13; i++) placements.push({ card: sorted[i], line: 'top' });

      if (wouldFoul({ top: [], mid: [], bottom: [] }, placements)) continue;

      const simBoard = { top: [], mid: [], bottom: [] };
      for (const p of placements) simBoard[p.line].push(p.card);
      const features = extractFeatures(simBoard, [], 1, [...deadCards, discard]);
      const score = await this.predict(features);

      if (score > bestScore) {
        bestScore = score;
        bestPlacements = placements;
        bestDiscard = discard;
      }
    }

    // fallback
    if (bestPlacements.length === 0) {
      const sorted = [...hand].sort((a, b) => b.rank - a.rank);
      const discard = sorted[sorted.length - 1];
      const toPlace = sorted.slice(0, 13);
      bestPlacements = [];
      for (let i = 0; i < 5; i++) bestPlacements.push({ card: toPlace[i], line: 'bottom' });
      for (let i = 5; i < 10; i++) bestPlacements.push({ card: toPlace[i], line: 'mid' });
      for (let i = 10; i < 13; i++) bestPlacements.push({ card: toPlace[i], line: 'top' });
      bestDiscard = discard;
    }

    return { placements: bestPlacements, discard: bestDiscard };
  }
}

module.exports = { MLBot };
