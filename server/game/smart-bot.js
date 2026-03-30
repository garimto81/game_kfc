/**
 * OFC Pineapple 스마트 휴리스틱 봇
 * evaluator.js, royalty.js 모듈을 재사용하여 최적 배치를 결정
 */

const { evaluateHand5, evaluateHand3, evaluateLine, compareHands, isFoul, HAND_TYPE } = require('./evaluator');
const { calcTopRoyalty, calcMidRoyalty, calcBottomRoyalty, calcTotalRoyalty, checkFantasylandEntry, checkFantasylandStay } = require('./royalty');

// 라인별 최대 카드 수
const LINE_MAX = { top: 3, mid: 5, bottom: 5 };

// ─── 유틸리티 ───

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
 * 카드를 보드의 특정 라인에 배치한 시뮬레이션 보드 반환
 */
function simulatePlace(board, card, line) {
  const b = cloneBoard(board);
  b[line].push(card);
  return b;
}

/**
 * 라인에 빈 슬롯이 있는지 확인
 */
function lineHasRoom(board, line) {
  return board[line].length < LINE_MAX[line];
}

/**
 * 보드에 배치 가능한 라인 목록
 */
function availableLines(board) {
  return ['top', 'mid', 'bottom'].filter(l => lineHasRoom(board, l));
}

/**
 * 보드가 완성 상태인지 확인 (13장)
 */
function boardComplete(board) {
  return board.top.length === 3 && board.mid.length === 5 && board.bottom.length === 5;
}

/**
 * 카드가 dead cards에 포함되어 있는지
 */
function isDeadCard(card, deadCards) {
  return deadCards.some(d => d.rank === card.rank && d.suit === card.suit);
}

// ─── 드로우 확률 계산 ───

/**
 * 주어진 아웃 수와 남은 카드/드로우 횟수로 완성 확률 계산
 * @param {number} outs - 필요한 카드 수
 * @param {number} cardsRemaining - 덱에 남은 카드 수
 * @param {number} drawsLeft - 앞으로 볼 수 있는 카드 수
 * @returns {number} 0~1 사이 확률
 */
function drawProbability(outs, cardsRemaining, drawsLeft) {
  if (outs <= 0 || cardsRemaining <= 0 || drawsLeft <= 0) return 0;
  if (outs >= cardsRemaining) return 1;
  let missProb = 1;
  for (let i = 0; i < drawsLeft; i++) {
    if (cardsRemaining - i <= 0) break;
    missProb *= (cardsRemaining - outs - i) / (cardsRemaining - i);
  }
  return 1 - missProb;
}

/**
 * 플러시 아웃 수 계산
 */
function countFlushOuts(board, line, suit, deadCards) {
  const totalSuited = 13;
  let usedCount = 0;
  // 보드 전체에서 해당 수트 카드 수
  for (const l of ['top', 'mid', 'bottom']) {
    for (const c of board[l]) {
      if (c.suit === suit) usedCount++;
    }
  }
  // dead cards에서 해당 수트
  for (const c of deadCards) {
    if (c.suit === suit) usedCount++;
  }
  return totalSuited - usedCount;
}

/**
 * 스트레이트 아웃 수 계산
 */
function countStraightOuts(board, line, ranks, deadCards) {
  // ranks: 현재 해당 라인에 있는 카드들의 rank 배열
  const sorted = [...new Set(ranks)].sort((a, b) => a - b);
  let outs = 0;

  // 가능한 5연속 시퀀스 체크 (A-low 포함)
  const sequences = [];
  for (let start = 2; start <= 10; start++) {
    sequences.push([start, start + 1, start + 2, start + 3, start + 4]);
  }
  // A-2-3-4-5
  sequences.push([14, 2, 3, 4, 5]);

  for (const seq of sequences) {
    const needed = seq.filter(r => !sorted.includes(r === 14 && seq.includes(2) ? 14 : r));
    if (needed.length === 1) {
      // 1장만 필요 → 해당 rank의 잔여 카드가 아웃
      const neededRank = needed[0];
      let available = 4; // 각 rank는 4장
      for (const l of ['top', 'mid', 'bottom']) {
        for (const c of board[l]) {
          if (c.rank === neededRank) available--;
        }
      }
      for (const c of deadCards) {
        if (c.rank === neededRank) available--;
      }
      outs += Math.max(0, available);
    }
  }
  return outs;
}

// ─── 배치 점수 평가 ───

/**
 * 카드를 특정 라인에 배치했을 때의 로열티 기대값
 */
function royaltyEV(card, line, board) {
  const testBoard = simulatePlace(board, card, line);
  const lineCards = testBoard[line];

  // 라인이 완성되면 정확한 로열티 반환
  if (line === 'top' && lineCards.length === 3) {
    return calcTopRoyalty(lineCards);
  }
  if (line === 'mid' && lineCards.length === 5) {
    return calcMidRoyalty(lineCards);
  }
  if (line === 'bottom' && lineCards.length === 5) {
    return calcBottomRoyalty(lineCards);
  }

  // 미완성이면 부분 평가
  if (line === 'top') {
    // pair가 되면 잠재 로열티
    const ranks = lineCards.map(c => c.rank);
    const hasPair = ranks.some((r, i) => ranks.indexOf(r) !== i);
    if (hasPair) {
      const pairRank = ranks.find((r, i) => ranks.indexOf(r) !== i);
      if (pairRank >= 12) return (pairRank - 5) * 0.8; // QQ+ 높은 기대값
      if (pairRank >= 6) return (pairRank - 5) * 0.5;
    }
    return 0;
  }

  // mid/bottom: 플러시/스트레이트 드로우 부분 평가
  const suits = lineCards.map(c => c.suit);
  const suitCounts = {};
  for (const s of suits) suitCounts[s] = (suitCounts[s] || 0) + 1;
  const maxSuitCount = Math.max(...Object.values(suitCounts));

  const ranks = lineCards.map(c => c.rank);
  const uniqueRanks = [...new Set(ranks)].sort((a, b) => a - b);

  let ev = 0;

  // 플러시 드로우 보너스
  if (maxSuitCount >= 3) {
    const flushBonus = line === 'mid' ? 8 : 4;
    ev += flushBonus * (maxSuitCount / 5) * 0.3;
  }

  // 스트레이트 드로우 보너스
  if (uniqueRanks.length >= 3) {
    const span = uniqueRanks[uniqueRanks.length - 1] - uniqueRanks[0];
    if (span <= 4) {
      const straightBonus = line === 'mid' ? 4 : 2;
      ev += straightBonus * (uniqueRanks.length / 5) * 0.3;
    }
  }

  // 페어/트립스 보너스
  const rankCounts = {};
  for (const r of ranks) rankCounts[r] = (rankCounts[r] || 0) + 1;
  const maxRankCount = Math.max(...Object.values(rankCounts));
  if (maxRankCount >= 3 && line === 'bottom') ev += 1;
  if (maxRankCount === 2) {
    const pairRank = parseInt(Object.keys(rankCounts).find(r => rankCounts[r] === 2));
    if (pairRank >= 10) ev += 0.5;
  }

  return ev;
}

/**
 * 핸드 강도 보너스 — 높은 카드를 적절한 라인에 배치하는 보너스
 * bottom에 가장 강한 카드, top에 가장 약한 카드를 배치하도록 유도
 */
function handStrengthBonus(card, line, board) {
  const rankNorm = (card.rank - 2) / 12; // 0~1 정규화

  if (line === 'bottom') {
    return rankNorm * 2.0; // bottom에 높은 카드 강하게 선호
  }
  if (line === 'mid') {
    return rankNorm * 1.0;
  }
  // top에 높은 카드 → 소폭 페널티 (pair/trips 제외)
  if (!hasNOfAKind([...board.top, card], 2)) {
    return -rankNorm * 0.5; // 높은 단일 카드를 top에 넣으면 감점
  }
  return rankNorm * 0.3;
}

/**
 * Foul 위험도 페널티
 * @returns {number} 0 (안전) ~ Infinity (즉시 foul)
 */
function foulRiskPenalty(card, line, board) {
  const testBoard = simulatePlace(board, card, line);

  // 완성된 보드면 직접 foul 체크
  if (boardComplete(testBoard)) {
    return isFoul(testBoard) ? Infinity : 0;
  }

  // 부분 보드에서 확정적 foul 감지
  if (partialFoulCheck(testBoard)) {
    return Infinity;
  }

  // 부분 보드에서 잠재적 foul 위험 평가
  let risk = 0;

  // top과 mid가 모두 채워진 상태에서 mid < top 위험
  if (testBoard.top.length >= 2 && testBoard.mid.length >= 2) {
    // top에 pair가 있고 mid에 더 약한 pair가 있으면 위험
    const topPair = hasNOfAKind(testBoard.top, 2);
    const midPair = hasNOfAKind(testBoard.mid, 2);
    if (topPair && midPair && topPair > midPair) {
      risk += 0.7;
    }
    // top에 pair가 있고 mid에 pair 없으면 경미한 위험
    if (topPair && !midPair && testBoard.mid.length >= 3) {
      risk += 0.3;
    }

    // top에 trips가 있고 mid에 trips 미만이면 높은 위험
    const topTrips = hasNOfAKind(testBoard.top, 3);
    if (topTrips && !hasNOfAKind(testBoard.mid, 3)) {
      risk += 0.5;
    }
  }

  // mid와 bottom 비교 — mid가 bottom보다 강해지면 위험
  if (testBoard.mid.length >= 3 && testBoard.bottom.length >= 3) {
    const midPair = hasNOfAKind(testBoard.mid, 2);
    const bottomPair = hasNOfAKind(testBoard.bottom, 2);

    // mid에 pair가 있고 bottom에 더 낮은 pair밖에 없으면 위험
    if (midPair && bottomPair && midPair > bottomPair) {
      risk += 0.5;
    }
    // mid에 pair가 있고 bottom에 pair 없으면 위험
    if (midPair && !bottomPair) {
      risk += 0.4;
    }

    // mid trips > bottom pair
    const midTrips = hasNOfAKind(testBoard.mid, 3);
    if (midTrips && !hasNOfAKind(testBoard.bottom, 3)) {
      risk += 0.5;
    }
  }

  // 높은 카드를 top에 넣으면 약한 위험
  if (line === 'top' && card.rank >= 10 && testBoard.top.length === 1) {
    // 아직 pair 없이 높은 단일 카드만 top에 → 미미한 위험
    if (!hasNOfAKind(testBoard.top, 2)) {
      risk += 0.1;
    }
  }

  return Math.min(risk, 1);
}

/**
 * 카드 배열에서 N of a kind의 rank 반환 (없으면 0)
 */
function hasNOfAKind(cards, n) {
  const counts = {};
  for (const c of cards) counts[c.rank] = (counts[c.rank] || 0) + 1;
  for (const [rank, count] of Object.entries(counts)) {
    if (count >= n) return parseInt(rank);
  }
  return 0;
}

/**
 * Fantasyland 보너스 — top에 QQ+ 완성 시
 */
function fantasylandBonus(card, line, board) {
  if (line !== 'top') return 0;
  const topCards = [...board.top, card];
  if (topCards.length < 2) return 0;

  const ranks = topCards.map(c => c.rank);
  const hasPair = ranks.some((r, i) => ranks.indexOf(r) !== i);
  if (!hasPair) return 0;

  const pairRank = ranks.find((r, i) => ranks.indexOf(r) !== i);
  if (pairRank >= 12) return 8; // QQ+ → FL 진입 기대값
  return 0;
}

/**
 * 드로우 완성 기대값
 */
function drawCompletionEV(card, line, board, deadCards, round) {
  if (line === 'top') return 0; // top은 3장이라 드로우 개념 없음

  const testBoard = simulatePlace(board, card, line);
  const lineCards = testBoard[line];
  if (lineCards.length >= 5) return 0; // 이미 완성

  const allKnown = [...board.top, ...board.mid, ...board.bottom, ...deadCards];
  const cardsRemaining = 52 - allKnown.length - 1; // -1 for this card
  const drawsLeft = Math.max(0, (5 - round) * 3); // 대략적인 남은 드로우

  // 플러시 드로우 EV
  const suits = lineCards.map(c => c.suit);
  const suitCounts = {};
  for (const s of suits) suitCounts[s] = (suitCounts[s] || 0) + 1;
  const bestSuit = Object.entries(suitCounts).sort((a, b) => b[1] - a[1])[0];

  let ev = 0;
  if (bestSuit && bestSuit[1] >= 3) {
    const needed = 5 - bestSuit[1];
    const outs = countFlushOuts(testBoard, line, parseInt(bestSuit[0]), deadCards);
    const prob = drawProbability(outs, cardsRemaining, drawsLeft);
    const bonus = line === 'mid' ? 8 : 4;
    ev += prob * bonus * 0.5;
  }

  // 스트레이트 드로우 EV
  const ranks = lineCards.map(c => c.rank);
  const uniqueRanks = [...new Set(ranks)].sort((a, b) => a - b);
  if (uniqueRanks.length >= 3) {
    const outs = countStraightOuts(testBoard, line, ranks, deadCards);
    if (outs > 0) {
      const prob = drawProbability(outs, cardsRemaining, drawsLeft);
      const bonus = line === 'mid' ? 4 : 2;
      ev += prob * bonus * 0.5;
    }
  }

  return ev;
}

/**
 * 라인 순서 유지 보너스 — bottom > mid > top 순서 강제
 * 가장 중요한 평가 요소: foul 방지의 핵심
 */
function lineOrderingBonus(card, line, board) {
  const testBoard = simulatePlace(board, card, line);
  let bonus = 0;

  // bottom에 높은 카드를 넣으면 큰 보너스
  if (line === 'bottom') {
    const bottomRankSum = testBoard.bottom.reduce((s, c) => s + c.rank, 0);
    const midRankSum = testBoard.mid.reduce((s, c) => s + c.rank, 0);
    // bottom rank 합이 mid보다 높으면 좋음
    if (testBoard.mid.length > 0) {
      const bottomAvg = bottomRankSum / testBoard.bottom.length;
      const midAvg = midRankSum / testBoard.mid.length;
      if (bottomAvg > midAvg) bonus += 3;
      else bonus -= 2;
    }
    // bottom에 pair가 있으면 보너스
    const bottomPair = hasNOfAKind(testBoard.bottom, 2);
    if (bottomPair) bonus += 2;
  }

  if (line === 'mid') {
    // mid에 카드를 넣을 때 — top보다 강해야 함
    if (testBoard.top.length > 0) {
      const midAvg = testBoard.mid.reduce((s, c) => s + c.rank, 0) / testBoard.mid.length;
      const topAvg = testBoard.top.reduce((s, c) => s + c.rank, 0) / testBoard.top.length;
      if (midAvg > topAvg) bonus += 2;
      else bonus -= 1;
    }
    // mid에 카드를 넣을 때 — bottom보다 약해야 함
    if (testBoard.bottom.length > 0) {
      const midAvg = testBoard.mid.reduce((s, c) => s + c.rank, 0) / testBoard.mid.length;
      const bottomAvg = testBoard.bottom.reduce((s, c) => s + c.rank, 0) / testBoard.bottom.length;
      if (midAvg < bottomAvg) bonus += 1;
      else bonus -= 2;
    }
  }

  if (line === 'top') {
    // top에 낮은 카드가 가면 보너스
    if (card.rank <= 8) bonus += 2;
    else if (card.rank <= 10) bonus += 0;
    else bonus -= 1; // 높은 단일 카드는 약간 감점
    // 단, pair라면 괜찮음
    if (hasNOfAKind(testBoard.top, 2)) bonus += 3;
  }

  return bonus;
}

/**
 * 배치 종합 점수
 */
function scorePlacement(card, line, board, deadCards, round) {
  const rEV = royaltyEV(card, line, board);
  const hsb = handStrengthBonus(card, line, board);
  const frp = foulRiskPenalty(card, line, board);
  const flb = fantasylandBonus(card, line, board);
  const dcEV = drawCompletionEV(card, line, board, deadCards || [], round);
  const lob = lineOrderingBonus(card, line, board);

  return rEV + hsb - frp * 30 + flb + dcEV + lob * 3;
}

// ─── 라운드별 전략 ───

/**
 * R1: 5장 → 5장 모두 배치
 * 기본 배분: bottom 2장 + mid 2장 + top 1장 (foul 방지 원칙)
 * 패턴 매칭으로 예외 허용
 */
function decideR1(hand, board, options) {
  const deadCards = options.deadCards || [];
  const cards = [...hand];

  // 패턴 분석
  const ranks = cards.map(c => c.rank);

  // rank별 그룹
  const rankGroups = {};
  for (const c of cards) {
    if (!rankGroups[c.rank]) rankGroups[c.rank] = [];
    rankGroups[c.rank].push(c);
  }

  // suit별 그룹
  const suitGroups = {};
  for (const c of cards) {
    if (!suitGroups[c.suit]) suitGroups[c.suit] = [];
    suitGroups[c.suit].push(c);
  }

  // pairs 찾기
  const pairs = Object.entries(rankGroups).filter(([, g]) => g.length === 2).map(([r, g]) => ({ rank: parseInt(r), cards: g }));
  const trips = Object.entries(rankGroups).filter(([, g]) => g.length >= 3).map(([r, g]) => ({ rank: parseInt(r), cards: g }));

  // suited 그룹
  const maxSuited = Object.entries(suitGroups).sort((a, b) => b[1].length - a[1].length)[0];

  // connected 체크
  const sortedRanks = [...new Set(ranks)].sort((a, b) => a - b);
  let maxConnected = 1;
  let connStart = 0;
  let curRun = 1;
  for (let i = 1; i < sortedRanks.length; i++) {
    if (sortedRanks[i] - sortedRanks[i - 1] === 1) {
      curRun++;
      if (curRun > maxConnected) {
        maxConnected = curRun;
        connStart = i - curRun + 1;
      }
    } else {
      curRun = 1;
    }
  }

  // QQ+ 보유 → QQ를 top에 고정하고 나머지 최적 배분
  const highPair = pairs.find(p => p.rank >= 12);
  if (highPair) {
    // QQ top 고정, 나머지 3장을 bottom/mid에 최적 배분
    const rest = cards.filter(c => !highPair.cards.includes(c));
    let bestScore = -Infinity;
    let bestPlacements = null;
    const restPerms = generatePermutations(rest);
    for (const perm of restPerms) {
      // bottom 2 + mid 1 또는 bottom 1 + mid 2
      for (const [bCount, mCount] of [[2, 1], [1, 2]]) {
        const bottomCards = perm.slice(0, bCount);
        const midCards = perm.slice(bCount, bCount + mCount);
        const testBoard = {
          top: [...board.top, ...highPair.cards],
          mid: [...board.mid, ...midCards],
          bottom: [...board.bottom, ...bottomCards]
        };
        const s = evaluateBoardQuality(testBoard, deadCards, 1);
        if (s > bestScore) {
          bestScore = s;
          bestPlacements = [
            ...highPair.cards.map(c => ({ card: c, line: 'top' })),
            ...midCards.map(c => ({ card: c, line: 'mid' })),
            ...bottomCards.map(c => ({ card: c, line: 'bottom' }))
          ];
        }
      }
    }
    return { placements: bestPlacements, discard: null };
  }

  // 전수 탐색: 5장을 3라인에 최적 배분
  return r1BruteForce(cards, board, deadCards);
}

/**
 * R1 전수 탐색: 5장을 3라인에 최적 배분
 * 제약: top 1장, mid 2장, bottom 2장 (기본) 또는 top 1, mid 1, bottom 3
 */
function r1BruteForce(cards, board, deadCards) {
  let bestScore = -Infinity;
  let bestPlacements = null;

  // 가능한 배분 패턴: (top, mid, bottom)
  const distributions = [
    [1, 2, 2],
    [1, 1, 3],
    [2, 1, 2],
    [1, 3, 1],
    [2, 2, 1],
  ];

  // 5장의 모든 순열 중 일부만 평가 (5! = 120, 감당 가능)
  const perms = generatePermutations(cards);

  for (const dist of distributions) {
    const [tCount, mCount, bCount] = dist;
    if (tCount > 3 || mCount > 5 || bCount > 5) continue;

    for (const perm of perms) {
      const topCards = perm.slice(0, tCount);
      const midCards = perm.slice(tCount, tCount + mCount);
      const bottomCards = perm.slice(tCount + mCount);

      const testBoard = {
        top: [...board.top, ...topCards],
        mid: [...board.mid, ...midCards],
        bottom: [...board.bottom, ...bottomCards]
      };

      const boardScore = evaluateBoardQuality(testBoard, deadCards, 1);

      if (boardScore > bestScore) {
        bestScore = boardScore;
        bestPlacements = [
          ...topCards.map(c => ({ card: c, line: 'top' })),
          ...midCards.map(c => ({ card: c, line: 'mid' })),
          ...bottomCards.map(c => ({ card: c, line: 'bottom' }))
        ];
      }
    }
  }

  if (!bestPlacements) {
    // 극단적 fallback
    const sorted = [...cards].sort((a, b) => b.rank - a.rank);
    bestPlacements = [
      { card: sorted[0], line: 'bottom' },
      { card: sorted[1], line: 'bottom' },
      { card: sorted[2], line: 'mid' },
      { card: sorted[3], line: 'mid' },
      { card: sorted[4], line: 'top' }
    ];
  }

  return { placements: bestPlacements, discard: null };
}

/**
 * 라인의 핸드 강도를 수치화 (미완성 라인 포함)
 * handType * 1000 + primaryKicker 형태로 비교 가능한 단일 수치 반환
 */
function lineStrength(cards, line) {
  if (cards.length === 0) return 0;

  // 완성 라인
  if ((line === 'top' && cards.length === 3) || (line !== 'top' && cards.length === 5)) {
    const hand = line === 'top' ? evaluateHand3(cards) : evaluateHand5(cards);
    return hand.handType * 1000 + (hand.kickers[0] || 0);
  }

  // 미완성 라인 — pair/trips 기반 추정
  const counts = {};
  for (const c of cards) counts[c.rank] = (counts[c.rank] || 0) + 1;
  const maxCount = Math.max(...Object.values(counts));
  const maxRank = Math.max(...cards.map(c => c.rank));
  const bestGroupRank = parseInt(Object.keys(counts).find(r => counts[r] === maxCount)) || 0;

  if (maxCount >= 3) return HAND_TYPE.THREE_OF_A_KIND * 1000 + bestGroupRank;
  if (maxCount === 2) return HAND_TYPE.ONE_PAIR * 1000 + bestGroupRank;
  return maxRank; // high card
}

/**
 * 보드 전체 평가 점수 — foul 방지가 최우선
 */
function evaluateBoardQuality(board, deadCards, round) {
  let score = 0;

  // 1. 확정 Foul이면 큰 감점
  if (boardComplete(board) && isFoul(board)) return -10000;

  // 2. 부분 확정 foul
  if (partialFoulCheck(board)) return -5000;

  // 3. 라인 강도 비교 — bottom >= mid >= top 순서 강제
  const bottomStr = lineStrength(board.bottom, 'bottom');
  const midStr = lineStrength(board.mid, 'mid');
  const topStr = lineStrength(board.top, 'top');

  // 순서가 올바르면 보너스, 역전되면 큰 감점
  if (board.bottom.length > 0 && board.mid.length > 0) {
    if (bottomStr >= midStr) score += 15;
    else score -= 30; // bottom < mid = foul 방향
  }
  if (board.mid.length > 0 && board.top.length > 0) {
    if (midStr >= topStr) score += 15;
    else score -= 30; // mid < top = foul 방향
  }

  // 4. pair/trips 가산점
  const bottomPair = hasNOfAKind(board.bottom, 2);
  const midPair = hasNOfAKind(board.mid, 2);
  const topPair = hasNOfAKind(board.top, 2);

  if (bottomPair) score += 3;
  if (midPair) score += 2;
  if (topPair && topPair >= 12) score += 8; // QQ+ top = FL 보너스

  // 5. 드로우 가능성 (플러시/스트레이트)
  for (const line of ['bottom', 'mid']) {
    const lineCards = board[line];
    if (lineCards.length >= 3 && lineCards.length < 5) {
      const suitCounts = {};
      for (const c of lineCards) suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1;
      const maxSuit = Math.max(...Object.values(suitCounts));
      if (maxSuit >= 4) score += (line === 'mid' ? 6 : 3);
      else if (maxSuit >= 3) score += (line === 'mid' ? 2 : 1);
    }
  }

  // 6. 완성 라인 로열티 (가중치 2배 — 로열티 완성이 매우 가치 있음)
  if (board.bottom.length === 5) {
    try { score += calcBottomRoyalty(board.bottom) * 2; } catch(e) {}
  }
  if (board.mid.length === 5) {
    try { score += calcMidRoyalty(board.mid) * 2; } catch(e) {}
  }
  if (board.top.length === 3) {
    try { score += calcTopRoyalty(board.top) * 2; } catch(e) {}
  }

  // 7. 미완성 라인의 flush 드로우 4장 → 완성 시 보너스 (라인 완성 유도)
  for (const line of ['bottom', 'mid']) {
    const lineCards = board[line];
    if (lineCards.length === 5) continue;
    if (lineCards.length >= 4) {
      const suitCounts = {};
      for (const c of lineCards) suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1;
      const maxSuit = Math.max(...Object.values(suitCounts));
      if (maxSuit >= 4) score += (line === 'mid' ? 4 : 2); // near-flush 보너스
    }
  }

  return score;
}

/**
 * R2-R4: 3장 → 2장 배치 + 1장 버림
 * 전수 평가: 최대 18가지 조합
 * 보드 전체 품질로 평가
 */
function decideR2R4(hand, board, round, options) {
  const deadCards = options.deadCards || [];
  const cards = [...hand];
  const lines = availableLines(board);

  let bestScore = -Infinity;
  let bestResult = null;

  // 3장 중 2장 선택, 각각 어느 라인에 배치할지 전수 탐색
  for (let discardIdx = 0; discardIdx < cards.length; discardIdx++) {
    const placed = cards.filter((_, i) => i !== discardIdx);
    const discarded = cards[discardIdx];

    // 2장의 모든 라인 조합
    for (const line1 of lines) {
      if (!lineHasRoom(board, line1)) continue;
      const board1 = simulatePlace(board, placed[0], line1);

      for (const line2 of availableLines(board1)) {
        if (!lineHasRoom(board1, line2)) continue;
        const board2 = simulatePlace(board1, placed[1], line2);

        // 보드 전체 품질 평가
        const boardScore = evaluateBoardQuality(board2, deadCards, round);

        if (boardScore > bestScore) {
          bestScore = boardScore;
          bestResult = {
            placements: [
              { card: placed[0], line: line1 },
              { card: placed[1], line: line2 }
            ],
            discard: discarded
          };
        }
      }
    }
  }

  return bestResult || fallbackPlace(cards, board, round, deadCards);
}

/**
 * R5: 남은 2-3장 → 남은 슬롯에 최적 배치
 * 보드 전체 품질 기반 평가
 */
function decideR5(hand, board, round, options) {
  const deadCards = options.deadCards || [];
  const cards = [...hand];

  // 남은 슬롯 수 확인
  const slotsLeft = (LINE_MAX.top - board.top.length) + (LINE_MAX.mid - board.mid.length) + (LINE_MAX.bottom - board.bottom.length);

  if (slotsLeft === 0) {
    return { placements: [], discard: cards[0] || null };
  }

  let bestScore = -Infinity;
  let bestResult = null;

  // 버림 후보 (버릴 카드가 없는 경우도 포함)
  const discardOptions = cards.length > slotsLeft
    ? cards.map((_, i) => i)
    : [-1]; // -1 = 버림 없음

  for (const discardIdx of discardOptions) {
    const placed = discardIdx >= 0 ? cards.filter((_, i) => i !== discardIdx) : [...cards];
    const discarded = discardIdx >= 0 ? cards[discardIdx] : null;

    // 배치할 카드 수가 슬롯 수에 맞게 조정
    const toPlace = placed.slice(0, slotsLeft);

    // 모든 순열 시도
    const perms = generatePermutations(toPlace);
    for (const perm of perms) {
      const placements = [];
      const testBoard = cloneBoard(board);
      let valid = true;

      for (const card of perm) {
        const avail = availableLines(testBoard);
        if (avail.length === 0) { valid = false; break; }
        // 각 카드를 사용 가능한 첫 번째 라인에 배치하는 모든 조합 대신
        // 간단히: 순열 순서대로 빈 라인에 배치
        const line = avail[0];
        testBoard[line].push(card);
        placements.push({ card, line });
      }
      if (!valid) continue;

      const boardScore = evaluateBoardQuality(testBoard, deadCards, round);
      if (boardScore > bestScore) {
        bestScore = boardScore;
        bestResult = { placements, discard: discarded };
      }
    }

    // 또한 각 카드를 최적 라인에 배치하는 전수 탐색
    enumerateLinePlacements(toPlace, 0, board, [], (finalBoard, finalPlacements) => {
      const boardScore = evaluateBoardQuality(finalBoard, deadCards, round);
      if (boardScore > bestScore) {
        bestScore = boardScore;
        bestResult = { placements: [...finalPlacements], discard: discarded };
      }
    });
  }

  return bestResult || { placements: greedyPlace(cards.slice(0, slotsLeft), board, deadCards, round), discard: cards.length > slotsLeft ? cards[cards.length - 1] : null };
}

/**
 * 카드 배열의 모든 순열 생성 (최대 3장이므로 최대 6개)
 */
function generatePermutations(arr) {
  if (arr.length <= 1) return [arr];
  const result = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const perm of generatePermutations(rest)) {
      result.push([arr[i], ...perm]);
    }
  }
  return result;
}

/**
 * 카드를 라인에 배치하는 모든 조합 열거 (재귀)
 */
function enumerateLinePlacements(cards, idx, board, placements, callback) {
  if (idx >= cards.length) {
    callback(board, placements);
    return;
  }
  const card = cards[idx];
  const lines = availableLines(board);
  for (const line of lines) {
    const newBoard = simulatePlace(board, card, line);
    placements.push({ card, line });
    enumerateLinePlacements(cards, idx + 1, newBoard, placements, callback);
    placements.pop();
  }
}

/**
 * FL: 14장 → 13장 배치 + 1장 버림
 * 역방향 구성: bottom(5) → mid(5) → top(3)
 */
function decideFL(hand, board, options) {
  const deadCards = options.deadCards || [];
  const cards = [...hand];

  let bestScore = -Infinity;
  let bestResult = null;

  // 휴리스틱: 후보 조합 생성 (전수 탐색은 비현실적)
  const candidates = generateFLCandidates(cards);

  for (const candidate of candidates) {
    const { bottom, mid, top, discard } = candidate;
    const testBoard = { top, mid, bottom };

    if (isFoul(testBoard)) continue;

    const royalty = calcTotalRoyalty(testBoard);
    const flStay = checkFantasylandStay(testBoard) ? 10 : 0;
    const score = royalty.total + flStay;

    if (score > bestScore) {
      bestScore = score;
      bestResult = {
        placements: [
          ...bottom.map(c => ({ card: c, line: 'bottom' })),
          ...mid.map(c => ({ card: c, line: 'mid' })),
          ...top.map(c => ({ card: c, line: 'top' }))
        ],
        discard
      };
    }
  }

  if (!bestResult) {
    // fallback: 단순 배치
    const sorted = [...cards].sort((a, b) => b.rank - a.rank);
    bestResult = {
      placements: [
        ...sorted.slice(0, 5).map(c => ({ card: c, line: 'bottom' })),
        ...sorted.slice(5, 10).map(c => ({ card: c, line: 'mid' })),
        ...sorted.slice(10, 13).map(c => ({ card: c, line: 'top' }))
      ],
      discard: sorted[13]
    };
  }

  return bestResult;
}

/**
 * FL 후보 생성 — 휴리스틱 전략
 * bottom: 최강 5장 핸드 (플러시/스트레이트/풀하우스 우선)
 * mid: 차선 5장
 * top: Trips 또는 QQ+ (FL 유지 우선)
 */
function generateFLCandidates(cards) {
  const candidates = [];

  // 전략 1: rank 정렬 기반 (강한 카드 → bottom)
  const sorted = [...cards].sort((a, b) => b.rank - a.rank);
  for (let discardIdx = 0; discardIdx < cards.length; discardIdx++) {
    const remaining = sorted.filter((_, i) => i !== discardIdx);
    candidates.push({
      bottom: remaining.slice(0, 5),
      mid: remaining.slice(5, 10),
      top: remaining.slice(10, 13),
      discard: sorted[discardIdx]
    });
  }

  // 전략 2: suit 기반 (플러시 bottom 우선)
  const suitGroups = {};
  for (const c of cards) {
    if (!suitGroups[c.suit]) suitGroups[c.suit] = [];
    suitGroups[c.suit].push(c);
  }

  for (const [suit, suitCards] of Object.entries(suitGroups)) {
    if (suitCards.length >= 5) {
      const flushCards = suitCards.sort((a, b) => b.rank - a.rank).slice(0, 5);
      const rest = cards.filter(c => !flushCards.includes(c)).sort((a, b) => b.rank - a.rank);

      for (let discardIdx = 0; discardIdx < rest.length; discardIdx++) {
        const remaining = rest.filter((_, i) => i !== discardIdx);
        if (remaining.length >= 8) {
          candidates.push({
            bottom: flushCards,
            mid: remaining.slice(0, 5),
            top: remaining.slice(5, 8),
            discard: rest[discardIdx]
          });
        }
      }
    }
  }

  // 전략 3: pairs를 top에 우선 배치 (FL 유지)
  const rankGroups = {};
  for (const c of cards) {
    if (!rankGroups[c.rank]) rankGroups[c.rank] = [];
    rankGroups[c.rank].push(c);
  }

  // QQ+ pairs를 top 후보로
  for (const [rank, group] of Object.entries(rankGroups)) {
    if (parseInt(rank) >= 12 && group.length >= 2) {
      const topBase = group.slice(0, 2);
      const rest = cards.filter(c => !topBase.includes(c)).sort((a, b) => b.rank - a.rank);

      for (let discardIdx = 0; discardIdx < Math.min(rest.length, 5); discardIdx++) {
        const remaining = rest.filter((_, i) => i !== discardIdx);
        if (remaining.length >= 11) {
          const topCard = remaining.pop();
          candidates.push({
            bottom: remaining.slice(0, 5),
            mid: remaining.slice(5, 10),
            top: [...topBase, topCard],
            discard: rest[discardIdx]
          });
        }
      }
    }
  }

  // trips → top (FL 유지)
  for (const [rank, group] of Object.entries(rankGroups)) {
    if (group.length >= 3) {
      const topCards = group.slice(0, 3);
      const rest = cards.filter(c => !topCards.includes(c)).sort((a, b) => b.rank - a.rank);
      if (rest.length >= 11) {
        candidates.push({
          bottom: rest.slice(0, 5),
          mid: rest.slice(5, 10),
          top: topCards,
          discard: rest[10]
        });
      }
    }
  }

  return candidates;
}

// ─── 헬퍼 ───

/**
 * 부분 보드에서 확정적 또는 높은 확률의 foul 감지
 */
function partialFoulCheck(board) {
  // 완성 보드
  if (board.top.length === 3 && board.mid.length === 5 && board.bottom.length === 5) {
    return isFoul(board);
  }

  // 부분적 확정 foul: top이 완성되고 mid도 완성됐으면 비교 가능
  if (board.top.length === 3 && board.mid.length === 5) {
    const topHand = evaluateHand3(board.top);
    const midHand = evaluateHand5(board.mid);
    if (midHand.handType < topHand.handType) return true;
    if (midHand.handType === topHand.handType && midHand.kickers[0] < topHand.kickers[0]) return true;
  }

  if (board.mid.length === 5 && board.bottom.length === 5) {
    const midHand = evaluateHand5(board.mid);
    const bottomHand = evaluateHand5(board.bottom);
    if (compareHands(bottomHand, midHand) < 0) return true;
  }

  // 준확정 foul 감지: top에 높은 pair가 있고 mid/bottom이 약할 때
  if (board.top.length >= 2) {
    const topPairRank = hasNOfAKind(board.top, 2);
    const topTrips = hasNOfAKind(board.top, 3);

    // top에 trips가 있으면 mid에도 최소 trips 이상 필요
    if (topTrips && board.mid.length >= 4) {
      const midBest = hasNOfAKind(board.mid, 3);
      if (!midBest && board.mid.length === 5) return true; // mid 완성인데 trips 미만
    }

    // mid가 완성되었고 bottom이 미완성일 때 bottom이 mid 이하로 떨어질 위험
    if (board.mid.length === 5 && board.bottom.length >= 3) {
      const midHand = evaluateHand5(board.mid);
      // bottom에 남은 슬롯이 적고 현재 약하면 위험
      const bottomSlotsLeft = 5 - board.bottom.length;
      if (bottomSlotsLeft <= 1) {
        // bottom 거의 완성 — 더미 카드로 채워서 테스트
        // 최악 가정: 남은 카드가 2(가장 약한 rank)
        const dummyBottom = [...board.bottom];
        while (dummyBottom.length < 5) {
          dummyBottom.push({ rank: 2, suit: 1 }); // worst case
        }
        try {
          const bottomHand = evaluateHand5(dummyBottom);
          if (compareHands(bottomHand, midHand) < 0) {
            // 최악의 경우에도 foul은 아닌지 — 실제로는 더 나은 카드 올 수 있음
            // 하지만 현재 bottom이 이미 mid보다 약하면 위험
            const currentBottomRanks = board.bottom.map(c => c.rank).sort((a, b) => b - a);
            const midRanks = board.mid.map(c => c.rank).sort((a, b) => b - a);
            const bottomPair = hasNOfAKind(board.bottom, 2);
            const midPair = hasNOfAKind(board.mid, 2);
            if (midHand.handType >= HAND_TYPE.TWO_PAIR && !bottomPair) {
              return true; // mid가 투페어 이상인데 bottom에 pair도 없으면 위험
            }
          }
        } catch(e) { /* ignore */ }
      }
    }
  }

  return false;
}

/**
 * 보드에 placements 적용
 */
function simulatePlacements(board, placements) {
  let b = cloneBoard(board);
  for (const p of placements) {
    b[p.line].push(p.card);
  }
  return b;
}

/**
 * 탐욕적 배치 — 남은 카드를 하나씩 최적 라인에 배치
 */
function greedyPlace(cards, board, deadCards, round) {
  const placements = [];
  let currentBoard = cloneBoard(board);

  for (const card of cards) {
    const lines = availableLines(currentBoard);
    let bestLine = lines[0];
    let bestScore = -Infinity;

    for (const line of lines) {
      const score = scorePlacement(card, line, currentBoard, deadCards, round);
      if (score > bestScore) {
        bestScore = score;
        bestLine = line;
      }
    }

    placements.push({ card, line: bestLine });
    currentBoard = simulatePlace(currentBoard, card, bestLine);
  }

  return placements;
}

/**
 * 모든 순열로 카드 배치하여 최적 찾기
 */
function bestPermutationPlace(cards, board, round, deadCards, discardCard) {
  const lines = availableLines(board);
  const slotsPerLine = {};
  for (const l of lines) slotsPerLine[l] = LINE_MAX[l] - board[l].length;

  let bestScore = -Infinity;
  let bestPlacements = null;

  function permute(remaining, currentBoard, currentPlacements) {
    if (remaining.length === 0) {
      // 완성 보드 체크
      if (boardComplete(currentBoard) && isFoul(currentBoard)) return;

      let totalScore = 0;
      for (const p of currentPlacements) {
        totalScore += scorePlacement(p.card, p.line, board, deadCards, round);
      }
      if (totalScore > bestScore) {
        bestScore = totalScore;
        bestPlacements = [...currentPlacements];
      }
      return;
    }

    const card = remaining[0];
    const rest = remaining.slice(1);

    for (const line of availableLines(currentBoard)) {
      const newBoard = simulatePlace(currentBoard, card, line);
      permute(rest, newBoard, [...currentPlacements, { card, line }]);
    }
  }

  permute(cards, board, []);

  if (!bestPlacements) {
    // 모든 조합 foul → greedy fallback
    bestPlacements = greedyPlace(cards, board, deadCards, round);
    bestScore = 0;
  }

  return { placements: bestPlacements, discard: discardCard, _score: bestScore };
}

/**
 * Fallback 배치 — 모든 조합이 foul일 때 최소 피해
 */
function fallbackPlace(cards, board, round, deadCards) {
  // 버림 1장 + 나머지 greedy 배치
  let bestResult = null;
  let bestScore = -Infinity;

  for (let i = 0; i < cards.length; i++) {
    const discard = cards[i];
    const placed = cards.filter((_, idx) => idx !== i);
    const placements = greedyPlace(placed, board, deadCards, round);
    let score = 0;
    let b = cloneBoard(board);
    for (const p of placements) {
      score += scorePlacement(p.card, p.line, b, deadCards, round);
      b = simulatePlace(b, p.card, p.line);
    }
    if (score > bestScore) {
      bestScore = score;
      bestResult = { placements, discard };
    }
  }

  return bestResult || { placements: cards.slice(0, cards.length - 1).map(c => ({ card: c, line: 'bottom' })), discard: cards[cards.length - 1] };
}

// ─── 메인 결정 함수 ───

/**
 * 메인 결정 함수
 * @param {Array} hand - 현재 받은 카드들
 * @param {Object} board - {top: [], mid: [], bottom: []} 현재 보드
 * @param {number} round - 현재 라운드 (1~5)
 * @param {Object} options - { deadCards, isFantasyland, is4Plus }
 * @returns {{ placements: [{card, line}], discard: card|null }}
 */
function decide(hand, board, round, options = {}) {
  const { isFantasyland = false } = options;

  // Fantasyland: 14장 한번에 배치
  if (isFantasyland) {
    return decideFL(hand, board, options);
  }

  // R1: 5장 배치
  if (round === 1) {
    return decideR1(hand, board, options);
  }

  // R2-R4: 3장 → 2장 배치 + 1장 버림
  if (round >= 2 && round <= 4) {
    return decideR2R4(hand, board, round, options);
  }

  // R5: 남은 슬롯 채우기
  return decideR5(hand, board, round, options);
}

module.exports = {
  decide,
  scorePlacement,
  evaluateBoardQuality,
  drawProbability,
  countFlushOuts,
  countStraightOuts,
  foulRiskPenalty,
  fantasylandBonus,
  royaltyEV,
  handStrengthBonus,
  drawCompletionEV,
  lineOrderingBonus,
  // 내부 유틸 (테스트용)
  cloneBoard,
  simulatePlace,
  lineHasRoom,
  availableLines,
  boardComplete,
  decideR1,
  decideR2R4,
  decideR5,
  decideFL
};
