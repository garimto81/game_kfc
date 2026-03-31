/**
 * detailed-qa-test.js — 핸드별 상세 결과표 QA 스크립트
 *
 * Room 클래스를 직접 조작하여 100핸드(2~6인 각 20핸드)를 실행하고,
 * 각 핸드의 상세 결과를 Markdown으로 출력한다.
 *
 * 실행: node server/test/detailed-qa-test.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { Room } = require('../game/room');
const { evaluateHand5, evaluateHand3, evaluateLine, isFoul } = require('../game/evaluator');
const { calcTotalRoyalty } = require('../game/royalty');
const { scoreHand } = require('../game/scorer');
const { extractFeatures } = require('../game/feature-extractor');

// ── Smart Bot 로드 (단순 봇 fallback) ──
let smartBot = null;
try {
  smartBot = require('../game/smart-bot');
  console.log('[INFO] smart-bot.js loaded — Foul rate ~12%');
} catch { console.log('[WARN] smart-bot.js not found — using simple bot (Foul ~70%)'); }

// ── ML Bot 로드 (있으면 사용) ──
let mlBot = null;
const modelPath = path.join(__dirname, '..', '..', 'data', 'models', 'v1.onnx');
// ML bot은 async 초기화 필요하므로 나중에 로드

// ── Training Logger ──
let TrainingLogger = null;
let logger = null;
try {
  const mod = require('../game/training-logger');
  TrainingLogger = mod.TrainingLogger || mod;
  logger = new TrainingLogger(path.join(__dirname, '..', '..', 'data', 'training'));
  console.log('[INFO] training-logger loaded — QA 데이터 수집 활성');
} catch { console.log('[WARN] training-logger not found — 데이터 수집 비활성'); }

// ============================================================
// 카드 포맷 유틸
// ============================================================

const RANK = {2:'2',3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'T',11:'J',12:'Q',13:'K',14:'A'};
const SUIT = {1:'♣',2:'♦',3:'♥',4:'♠'};

function fmtCards(cards) {
  return cards.map(c => RANK[c.rank] + SUIT[c.suit]).join(' ');
}

// ============================================================
// 봇 전략 (soak-test.js와 동일)
// ============================================================

function sortByRankDesc(cards) {
  return [...cards].sort((a, b) => b.rank - a.rank || b.suit - a.suit);
}

function remainingSlots(board) {
  return {
    top: 3 - board.top.length,
    mid: 5 - board.mid.length,
    bottom: 5 - board.bottom.length,
  };
}

function decidePlacement(hand, board, round, isFL, activePlayers) {
  if (isFL) return strategyFL(hand, board);
  if (round === 1) return strategyR1(hand, board);
  if (round === 5) return strategyR5(hand, board, activePlayers >= 4);
  return strategyR2to4(hand, board);
}

function strategyR1(hand, board) {
  const sorted = sortByRankDesc(hand);
  const slots = remainingSlots(board);
  const placements = [];
  let idx = 0;
  for (let i = 0; i < 2 && idx < sorted.length && slots.bottom > i; i++, idx++)
    placements.push({ card: sorted[idx], line: 'bottom' });
  for (let i = 0; i < 2 && idx < sorted.length && slots.mid > i; i++, idx++)
    placements.push({ card: sorted[idx], line: 'mid' });
  if (idx < sorted.length && slots.top > 0)
    placements.push({ card: sorted[idx], line: 'top' });
  return { placements, discard: null };
}

function strategyR2to4(hand, board) {
  const sorted = sortByRankDesc(hand);
  const slots = remainingSlots(board);
  const discard = sorted[sorted.length - 1];
  const toPlace = sorted.slice(0, 2);
  const lineOrder = ['bottom', 'mid', 'top']
    .filter((l) => slots[l] > 0)
    .sort((a, b) => slots[b] - slots[a]);
  const placements = [];
  for (let i = 0; i < toPlace.length && i < lineOrder.length; i++)
    placements.push({ card: toPlace[i], line: lineOrder[i] });
  if (placements.length < toPlace.length) {
    for (const card of toPlace) {
      if (placements.find((p) => p.card === card)) continue;
      for (const line of ['bottom', 'mid', 'top']) {
        const used = placements.filter((p) => p.line === line).length;
        if (slots[line] - used > 0) { placements.push({ card, line }); break; }
      }
    }
  }
  return { placements, discard };
}

function strategyR5(hand, board, is4Plus) {
  if (is4Plus) {
    const sorted = sortByRankDesc(hand);
    const slots = remainingSlots(board);
    const lineOrder = ['bottom', 'mid', 'top']
      .filter((l) => slots[l] > 0)
      .sort((a, b) => slots[b] - slots[a]);
    const placements = [];
    for (let i = 0; i < sorted.length && i < lineOrder.length; i++)
      placements.push({ card: sorted[i], line: lineOrder[i] });
    return { placements, discard: null };
  }
  return strategyR2to4(hand, board);
}

function strategyFL(hand, _board) {
  const sorted = sortByRankDesc(hand);
  const discard = sorted[sorted.length - 1];
  const toPlace = sorted.slice(0, 13);
  const placements = [];
  for (let i = 0; i < 5; i++) placements.push({ card: toPlace[i], line: 'bottom' });
  for (let i = 5; i < 10; i++) placements.push({ card: toPlace[i], line: 'mid' });
  for (let i = 10; i < 13; i++) placements.push({ card: toPlace[i], line: 'top' });
  return { placements, discard };
}

// ============================================================
// Mock WebSocket
// ============================================================

class MockWS {
  constructor() {
    this.readyState = 1;
    this.sentMessages = [];
  }
  send(data) {
    this.sentMessages.push(JSON.parse(data));
  }
  close() {
    this.readyState = 3;
  }
}

// ============================================================
// 핸드 시뮬레이션 (soak-test.js 기반)
// ============================================================

function simulateHand(room, playerIds, wsMap) {
  const activePlayers = room.getActivePlayers();
  const numActive = activePlayers.length;

  for (let round = 1; round <= 5; round++) {
    const nonFL = room.getNonFLActivePlayers();

    for (let turnIdx = 0; turnIdx < nonFL.length; turnIdx++) {
      const currentId = room.getCurrentTurnPlayerId();
      if (!currentId) break;

      const player = room.players.get(currentId);
      if (!player || player.confirmed || player.folded) continue;

      const hand = player.hand;
      if (!hand || hand.length === 0) continue;

      const board = player.board;
      const isFL = player.inFantasyland;
      // Smart Bot 우선, fallback 단순 봇 (에러 시 단순 봇 fallback)
      let decision;
      try {
        decision = smartBot
          ? smartBot.decide(hand, board, room.round, { isFantasyland: isFL, is4Plus: numActive >= 4 })
          : decidePlacement(hand, board, room.round, isFL, numActive);
      } catch {
        decision = decidePlacement(hand, board, room.round, isFL, numActive);
      }

      // 학습 데이터 수집 (매 결정마다)
      if (logger) {
        const features = extractFeatures(board, hand, room.round, []);
        logger.logDecision(
          `qa-${Date.now()}`, room.handNumber || 1, room.round, currentId,
          { board, hand, round: room.round, is_fantasyland: isFL },
          { placements: decision.placements, discard: decision.discard },
          { features }
        );
      }

      for (const placement of decision.placements) {
        const result = room.placeCard(currentId, placement.card, placement.line);
        if (result.error) {
          for (const alt of ['bottom', 'mid', 'top']) {
            const altResult = room.placeCard(currentId, placement.card, alt);
            if (!altResult.error) break;
          }
        }
      }

      if (decision.discard) {
        room.discardCard(currentId, decision.discard);
      }

      const confirmResult = room.confirmPlacement(currentId);
      if (confirmResult.error) {
        while (player.hand.length > 0) {
          const card = player.hand[0];
          for (const line of ['bottom', 'mid', 'top']) {
            const r = room.placeCard(currentId, card, line);
            if (!r.error) break;
          }
          if (player.hand.length > 0 && player.discarded.length === 0 && room.round > 1) {
            room.discardCard(currentId, player.hand[0]);
          }
        }
        const retry = room.confirmPlacement(currentId);
        if (retry.error) {
          room.autoFold(currentId);
        }
      }

      if (confirmResult && !confirmResult.error) {
        if (confirmResult.action === 'handScored') return confirmResult;
        if (confirmResult.action === 'newRound') break;
      }
    }

    // FL 플레이어 처리
    const flPlayers = room.getFLActivePlayers();
    for (const flId of flPlayers) {
      const flPlayer = room.players.get(flId);
      if (flPlayer.confirmed) continue;
      if (flPlayer.hand.length === 0) continue;

      const decision = strategyFL(flPlayer.hand, flPlayer.board);
      for (const placement of decision.placements) {
        room.placeCard(flId, placement.card, placement.line);
      }
      if (decision.discard) {
        room.discardCard(flId, decision.discard);
      }
      const result = room.confirmPlacement(flId);
      if (result && result.action === 'handScored') return result;
    }
  }

  return room.endHand();
}

// ============================================================
// 핸드 결과 수집
// ============================================================

function collectHandResult(room, scoreResults, handIdx, numPlayers) {
  const playerData = [];
  const activePlayers = room.getActivePlayers ? room.getActivePlayers() : [...room.players.keys()];

  for (const [id, player] of room.players) {
    if (player.folded) continue;

    const board = player.board;
    const topCards = board.top || [];
    const midCards = board.mid || [];
    const bottomCards = board.bottom || [];

    // 보드 완성 여부 체크
    const complete = topCards.length === 3 && midCards.length === 5 && bottomCards.length === 5;
    const fouled = !complete || isFoul(board);

    // 라인 핸드명
    let topHandName = '-';
    let midHandName = '-';
    let bottomHandName = '-';

    if (topCards.length === 3) {
      try { topHandName = evaluateHand3(topCards).handName; } catch { topHandName = 'Error'; }
    }
    if (midCards.length === 5) {
      try { midHandName = evaluateHand5(midCards).handName; } catch { midHandName = 'Error'; }
    }
    if (bottomCards.length === 5) {
      try { bottomHandName = evaluateHand5(bottomCards).handName; } catch { bottomHandName = 'Error'; }
    }

    // 로열티
    let royalty = { top: 0, mid: 0, bottom: 0, total: 0 };
    if (complete && !fouled) {
      try { royalty = calcTotalRoyalty(board); } catch { /* ignore */ }
    }

    // 점수
    const score = (scoreResults && scoreResults[id]) ? scoreResults[id].score : 0;

    playerData.push({
      id,
      name: player.name,
      topCards: fmtCards(topCards),
      midCards: fmtCards(midCards),
      bottomCards: fmtCards(bottomCards),
      topHandName,
      midHandName,
      bottomHandName,
      fouled,
      royalty,
      score,
    });
  }

  return {
    handIdx: handIdx + 1,
    numPlayers,
    players: playerData,
  };
}

// ============================================================
// Markdown 포맷
// ============================================================

function formatHandMarkdown(handResult) {
  const { handIdx, numPlayers, players } = handResult;
  const lines = [];

  lines.push(`### Hand #${handIdx} (${numPlayers}P)`);
  lines.push('');

  // 보드 테이블
  lines.push('**보드:**');
  lines.push('');
  lines.push('| Player | Top | Mid | Bottom | Foul |');
  lines.push('|--------|-----|-----|--------|:----:|');

  for (const p of players) {
    const foulMark = p.fouled ? 'O' : 'X';
    lines.push(`| ${p.name} | ${p.topCards} (${p.topHandName}) | ${p.midCards} (${p.midHandName}) | ${p.bottomCards} (${p.bottomHandName}) | ${foulMark} |`);
  }

  lines.push('');

  // 점수 테이블
  lines.push('**점수:**');
  lines.push('');
  lines.push('| Player | Score | Royalty (T/M/B) |');
  lines.push('|--------|:-----:|:---------------:|');

  let totalScore = 0;
  for (const p of players) {
    const sign = p.score >= 0 ? '+' : '';
    const royaltyStr = `${p.royalty.top}/${p.royalty.mid}/${p.royalty.bottom}`;
    lines.push(`| ${p.name} | ${sign}${p.score} | ${royaltyStr} |`);
    totalScore += p.score;
  }

  lines.push('');
  const zeroSumOk = totalScore === 0;
  const scoreTerms = players.map(p => {
    const sign = p.score >= 0 ? '' : '';
    return `(${p.score})`;
  }).join('+');
  lines.push(`Zero-sum: ${scoreTerms} = ${totalScore} ${zeroSumOk ? 'OK' : 'FAIL'}`);
  lines.push('');

  return lines.join('\n');
}

// ============================================================
// 메인 실행
// ============================================================

async function main() {
  const configs = [
    { players: 2, hands: 20 },
    { players: 3, hands: 20 },
    { players: 4, hands: 20 },
    { players: 5, hands: 20 },
    { players: 6, hands: 20 },
  ];

  const allResults = [];
  let totalErrors = 0;
  let zeroSumFails = 0;

  console.log('========================================');
  console.log('Detailed QA Test: 100 hands (2~6P x 20)');
  console.log('========================================');

  for (const config of configs) {
    console.log(`\n--- ${config.players}P x ${config.hands} hands ---`);

    for (let h = 0; h < config.hands; h++) {
      const globalIdx = allResults.length;

      try {
        // Room 생성
        const room = new Room({
          name: `QA-${config.players}P-${h + 1}`,
          maxPlayers: config.players,
          turnTimeLimit: 0,
        });

        // 플레이어 추가
        const wsMap = {};
        const playerIds = [];
        for (let i = 0; i < config.players; i++) {
          const ws = new MockWS();
          const result = room.addPlayer(`P${i + 1}`, ws);
          if (result.error) throw new Error(result.error);
          playerIds.push(result.playerId);
          wsMap[result.playerId] = ws;
        }

        // 게임 시작
        const startResult = room.startGame(playerIds[0]);
        if (startResult.error) throw new Error(startResult.error);

        // 5~6인: Play/Fold
        if (config.players >= 5) {
          room.phase = 'playOrFold';
          room.initPlayOrFold();

          for (let i = 0; i < room.playOrFoldOrder.length; i++) {
            const pid = room.playOrFoldOrder[i];
            const choice = i < 4 ? 'play' : 'fold';
            room.playOrFoldResponse(pid, choice);
          }

          for (const [id, choice] of room.playOrFoldChoices) {
            if (choice === 'fold') {
              const p = room.players.get(id);
              if (p) p.folded = true;
            }
          }
        }

        // 핸드 시작
        room.phase = 'playing';
        room.handNumber = 1;
        room.startNewHand();

        // 핸드 시뮬레이션
        const result = simulateHand(room, playerIds, wsMap);

        // scoreResults 추출
        const scoreResults = (result && result.results) ? result.results : {};

        // 상세 결과 수집
        const handResult = collectHandResult(room, scoreResults, globalIdx, config.players);
        allResults.push(handResult);

        // Zero-sum 검증
        const totalScore = handResult.players.reduce((sum, p) => sum + p.score, 0);
        if (totalScore !== 0) {
          zeroSumFails++;
          console.log(`  [WARN] Hand #${globalIdx + 1} zero-sum FAIL: ${totalScore}`);
        }

        room.clearTurnTimer();

      } catch (err) {
        totalErrors++;
        console.error(`  [ERROR] ${config.players}P Hand ${h + 1}: ${err.message}`);
        // 에러 핸드도 기록
        allResults.push({
          handIdx: globalIdx + 1,
          numPlayers: config.players,
          players: [],
          error: err.message,
        });
      }
    }

    console.log(`  ${config.players}P done.`);
  }

  // ============================================================
  // Markdown 파일 생성
  // ============================================================

  const mdLines = [];
  mdLines.push('# QA Hands Detail Report');
  mdLines.push('');
  mdLines.push(`**날짜**: 2026-03-31`);
  mdLines.push(`**총 핸드**: ${allResults.length}`);
  mdLines.push(`**에러**: ${totalErrors}`);
  mdLines.push(`**Zero-sum 실패**: ${zeroSumFails}`);
  mdLines.push('');

  // 요약 통계
  let totalFouls = 0;
  let totalPlayers = 0;
  for (const hr of allResults) {
    for (const p of hr.players) {
      totalPlayers++;
      if (p.fouled) totalFouls++;
    }
  }
  mdLines.push(`**총 플레이어-핸드**: ${totalPlayers}`);
  mdLines.push(`**총 Foul**: ${totalFouls} (${(totalFouls / totalPlayers * 100).toFixed(1)}%)`);
  mdLines.push('');
  mdLines.push('---');
  mdLines.push('');

  // 인원수별 섹션
  const grouped = {};
  for (const hr of allResults) {
    const key = hr.numPlayers;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(hr);
  }

  for (const np of [2, 3, 4, 5, 6]) {
    if (!grouped[np]) continue;
    mdLines.push(`## ${np}인 게임`);
    mdLines.push('');

    for (const hr of grouped[np]) {
      if (hr.error) {
        mdLines.push(`### Hand #${hr.handIdx} (${hr.numPlayers}P) - ERROR`);
        mdLines.push('');
        mdLines.push(`> ${hr.error}`);
        mdLines.push('');
      } else {
        mdLines.push(formatHandMarkdown(hr));
      }
    }
  }

  // 파일 저장
  const outDir = path.resolve(__dirname, '../../docs/04-report');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  const today = new Date().toISOString().slice(0, 10);
  const outPath = path.join(outDir, `qa-hands-detail-${today}.md`);
  const mdContent = mdLines.join('\n');
  const lineCount = mdContent.split('\n').length;
  fs.writeFileSync(outPath, mdContent, 'utf8');

  console.log('\n========================================');
  console.log('Detailed QA Test Results');
  console.log('========================================');
  console.log(`Total hands:      ${allResults.length}`);
  console.log(`Errors:           ${totalErrors}`);
  console.log(`Zero-sum fails:   ${zeroSumFails}`);
  console.log(`Fouls:            ${totalFouls}/${totalPlayers} (${(totalFouls / totalPlayers * 100).toFixed(1)}%)`);
  console.log(`Output:           ${outPath}`);
  console.log(`Output lines:     ${lineCount}`);
  console.log('========================================');

  // ── QA 데이터로 ML 모델 Fine-tune ──
  if (logger) {
    logger.flush();
    console.log('\n[ML] 학습 데이터 저장 완료');

    // Python 학습 자동 트리거
    const mlDir = path.resolve(__dirname, '../../ml');
    const trainScript = path.join(mlDir, 'train.py');
    const dataDir = path.resolve(__dirname, '../../data/training');
    const modelsDir = path.resolve(__dirname, '../../data/models');

    if (fs.existsSync(trainScript)) {
      console.log('[ML] Fine-tune 시작...');
      try {
        // 최신 JSONL 파일 찾기
        const jsonlFiles = fs.readdirSync(dataDir).filter(f => f.endsWith('.jsonl'));
        if (jsonlFiles.length > 0) {
          const latestData = path.join(dataDir, jsonlFiles[jsonlFiles.length - 1]);
          const pretrained = path.join(mlDir, 'model.pt');
          const pretrainedFlag = fs.existsSync(pretrained) ? `--pretrained "${pretrained}"` : '';

          const cmd = `python "${trainScript}" --data "${latestData}" ${pretrainedFlag} --epochs 20 --output "${path.join(mlDir, 'model.pt')}"`;
          console.log(`[ML] ${cmd}`);

          const trainOutput = execSync(cmd, { encoding: 'utf8', timeout: 300000, cwd: mlDir });
          console.log(trainOutput.split('\n').filter(l => l.includes('Epoch') || l.includes('Best') || l.includes('saved')).join('\n'));

          // ONNX 변환
          const exportScript = path.join(mlDir, 'export_onnx.py');
          if (fs.existsSync(exportScript)) {
            const onnxOut = path.join(modelsDir, `v${Date.now()}.onnx`);
            const latestOnnx = path.join(modelsDir, 'latest.onnx');
            execSync(`python "${exportScript}" --model "${pretrained}" --output "${onnxOut}"`, { encoding: 'utf8', timeout: 60000, cwd: mlDir });
            // latest 심볼릭 링크 (또는 복사)
            if (fs.existsSync(latestOnnx)) fs.unlinkSync(latestOnnx);
            fs.copyFileSync(onnxOut, latestOnnx);
            console.log(`[ML] ONNX 모델 저장: ${onnxOut}`);
            console.log(`[ML] latest.onnx 업데이트 완료`);
          }

          console.log('[ML] Fine-tune 완료 — 다음 QA는 개선된 모델로 실행됩니다');
        }
      } catch (err) {
        console.log(`[ML] Fine-tune 실패 (다음 실행 시 재시도): ${err.message}`);
      }
    } else {
      console.log('[ML] ml/train.py 미발견 — Fine-tune 건너뜀');
    }
  }

  if (totalErrors > 0 || zeroSumFails > 0) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
