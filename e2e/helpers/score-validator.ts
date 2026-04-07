/**
 * score-validator.ts — handScored payload 자동 검증
 *
 * WS handScored 메시지의 results 객체를 검증하는 assertion 함수 모음.
 * OFC Pineapple 스코어링 불변식(invariants)을 자동으로 확인한다.
 */
import { expect } from '@playwright/test';

interface LineDetail {
  result: number; // +1, -1, 0
  myHand: string;
  oppHand: string;
}

interface MatchupDetail {
  lines: Record<string, LineDetail>;
  scoopBonus: number;
  royaltyDiff: number;
  total: number;
}

interface PlayerResult {
  score: number;
  totalScore?: number;
  foul?: boolean;
  fouled?: boolean;
  royalties?: { top: number; mid: number; bottom: number; total: number };
  royaltyTotal?: number;
  lineResults: Record<string, MatchupDetail>;
}

type ScoreResults = Record<string, PlayerResult>;

/**
 * INV1: 전체 점수 합 === 0 (zero-sum)
 */
export function assertZeroSum(results: ScoreResults): void {
  let total = 0;
  for (const id of Object.keys(results)) {
    total += results[id].score ?? 0;
  }
  expect(total, 'Zero-sum violation: 전체 점수 합이 0이 아님').toBe(0);
}

/**
 * INV2: 모든 매치업 대칭 — A vs B total === -(B vs A total)
 */
export function assertLineResults(results: ScoreResults): void {
  const playerIds = Object.keys(results);
  for (let i = 0; i < playerIds.length; i++) {
    for (let j = i + 1; j < playerIds.length; j++) {
      const a = playerIds[i];
      const b = playerIds[j];
      const aVsB = results[a].lineResults?.[b];
      const bVsA = results[b].lineResults?.[a];

      if (aVsB && bVsA) {
        expect(
          aVsB.total + bVsA.total,
          `Symmetry violation: ${a} vs ${b}: ${aVsB.total} + ${bVsA.total} !== 0`
        ).toBe(0);
      }
    }
  }
}

/**
 * INV3: scoop bonus는 +3, -3, 또는 0만 허용
 */
export function assertScoopBonus(results: ScoreResults): void {
  for (const [pid, pr] of Object.entries(results)) {
    for (const [oppId, matchup] of Object.entries(pr.lineResults ?? {})) {
      expect(
        [3, -3, 0],
        `Invalid scoop bonus: ${pid} vs ${oppId} = ${matchup.scoopBonus}`
      ).toContain(matchup.scoopBonus);
    }
  }
}

/**
 * INV4: royaltyDiff === myRoyaltyTotal - oppRoyaltyTotal
 */
export function assertRoyaltyConsistency(results: ScoreResults): void {
  for (const [pid, pr] of Object.entries(results)) {
    const myRoyaltyTotal = pr.royalties?.total ?? pr.royaltyTotal ?? 0;
    for (const [oppId, matchup] of Object.entries(pr.lineResults ?? {})) {
      const oppRoyaltyTotal = results[oppId]?.royalties?.total ?? results[oppId]?.royaltyTotal ?? 0;
      const expectedDiff = myRoyaltyTotal - oppRoyaltyTotal;
      expect(
        matchup.royaltyDiff,
        `Royalty diff mismatch: ${pid} vs ${oppId}: got ${matchup.royaltyDiff}, expected ${expectedDiff}`
      ).toBe(expectedDiff);
    }
  }
}

/**
 * INV5: foul 플레이어는 royaltyTotal === 0
 */
export function assertFoulPenalty(results: ScoreResults): void {
  for (const [pid, pr] of Object.entries(results)) {
    const isFouled = pr.foul ?? pr.fouled ?? false;
    if (isFouled) {
      const royaltyTotal = pr.royalties?.total ?? pr.royaltyTotal ?? 0;
      expect(
        royaltyTotal,
        `Fouled player ${pid} should have royaltyTotal === 0, got ${royaltyTotal}`
      ).toBe(0);
    }
  }
}

/**
 * INV6: C(n,2) 쌍의 lineResults가 존재 (fold 플레이어 제외)
 */
export function assertPairCompleteness(results: ScoreResults, playerCount: number): void {
  const playerIds = Object.keys(results);
  expect(playerIds.length, `Expected ${playerCount} players in results`).toBe(playerCount);

  // fold되지 않은 active 플레이어만 카운트
  const activeIds = playerIds.filter(id => {
    const pr = results[id];
    return !(pr.foul ?? pr.fouled ?? false) || Object.keys(pr.lineResults ?? {}).length > 0;
  });

  const activePairs = (activeIds.length * (activeIds.length - 1)) / 2;
  let actualPairs = 0;

  for (const pid of playerIds) {
    const lr = results[pid].lineResults ?? {};
    actualPairs += Object.keys(lr).length;
  }

  // fold 플레이어는 lineResults가 없을 수 있으므로 active 쌍만 검증
  // 최소한 active 플레이어 간에는 쌍이 존재해야 함
  if (activePairs > 0) {
    expect(
      actualPairs,
      `Pair completeness: expected at least ${activePairs * 2} directional pairs among active players, got ${actualPairs}`
    ).toBeGreaterThanOrEqual(activePairs * 2);
  }
}

/**
 * 전체 스코어링 검증 (모든 invariant 실행)
 */
export function assertFullScoreValidity(results: ScoreResults, playerCount: number): void {
  assertZeroSum(results);
  assertLineResults(results);
  assertScoopBonus(results);
  assertRoyaltyConsistency(results);
  assertFoulPenalty(results);
  assertPairCompleteness(results, playerCount);
}
