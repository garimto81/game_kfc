/**
 * OFC Pineapple 스코어링 모듈
 * 각 플레이어 쌍별 라인 비교 + 스쿱 + 로열티
 */

const { evaluateHand5, evaluateHand3, compareHands, isFoul } = require('./evaluator');
const { calcTotalRoyalty } = require('./royalty');

/**
 * 핸드 종료 후 스코어링 수행
 * @param {Object} players - {playerId: {board: {top, mid, bottom}, fouled: boolean}}
 * @returns {Object} 결과 - {playerId: {score, royalties, lineResults, fouled}}
 */
function scoreHand(players) {
  const playerIds = Object.keys(players);
  const results = {};

  // 초기화
  for (const id of playerIds) {
    const player = players[id];
    const fouled = player.fouled || isFoul(player.board);
    const royalties = fouled ? { top: 0, mid: 0, bottom: 0, total: 0 } : calcTotalRoyalty(player.board);

    results[id] = {
      score: 0,
      royalties,
      royaltyTotal: royalties.total,
      lineWins: { top: 0, mid: 0, bottom: 0 },
      lineResults: {},
      fouled,
      scooped: false,
      scoopedBy: []
    };
  }

  // 각 플레이어 쌍별 비교
  for (let i = 0; i < playerIds.length; i++) {
    for (let j = i + 1; j < playerIds.length; j++) {
      const idA = playerIds[i];
      const idB = playerIds[j];
      const playerA = players[idA];
      const playerB = players[idB];
      const foulA = results[idA].fouled;
      const foulB = results[idB].fouled;

      let lineScore = { top: 0, mid: 0, bottom: 0 };
      let winsA = 0;
      let winsB = 0;

      // 라인별 핸드명 저장용
      const handNames = { top: { a: '', b: '' }, mid: { a: '', b: '' }, bottom: { a: '', b: '' } };

      if (foulA && foulB) {
        // 둘 다 Foul이면 무승부
        handNames.top.a = 'Foul'; handNames.top.b = 'Foul';
        handNames.mid.a = 'Foul'; handNames.mid.b = 'Foul';
        handNames.bottom.a = 'Foul'; handNames.bottom.b = 'Foul';
      } else if (foulA) {
        // A가 Foul → B가 모든 라인 승리 + 스쿱
        winsB = 3;
        lineScore = { top: -1, mid: -1, bottom: -1 };
        results[idB].score += 6; // 3라인 + 스쿱 보너스 3
        results[idA].score -= 6;
        results[idA].scooped = true;
        results[idA].scoopedBy.push(idB);
        handNames.top.a = 'Foul'; handNames.mid.a = 'Foul'; handNames.bottom.a = 'Foul';
        // B 핸드명 평가 (불완전 보드 방어)
        handNames.top.b = playerB.board.top.length === 3 ? evaluateHand3(playerB.board.top).handName : 'Foul';
        handNames.mid.b = playerB.board.mid.length === 5 ? evaluateHand5(playerB.board.mid).handName : 'Foul';
        handNames.bottom.b = playerB.board.bottom.length === 5 ? evaluateHand5(playerB.board.bottom).handName : 'Foul';
      } else if (foulB) {
        // B가 Foul → A가 모든 라인 승리 + 스쿱
        winsA = 3;
        lineScore = { top: 1, mid: 1, bottom: 1 };
        results[idA].score += 6;
        results[idB].score -= 6;
        results[idB].scooped = true;
        results[idB].scoopedBy.push(idA);
        // A 핸드명 평가 (불완전 보드 방어)
        handNames.top.a = playerA.board.top.length === 3 ? evaluateHand3(playerA.board.top).handName : 'Foul';
        handNames.mid.a = playerA.board.mid.length === 5 ? evaluateHand5(playerA.board.mid).handName : 'Foul';
        handNames.bottom.a = playerA.board.bottom.length === 5 ? evaluateHand5(playerA.board.bottom).handName : 'Foul';
        handNames.top.b = 'Foul'; handNames.mid.b = 'Foul'; handNames.bottom.b = 'Foul';
      } else {
        // 정상 라인 비교
        const lines = ['top', 'mid', 'bottom'];
        for (const line of lines) {
          const maxCards = line === 'top' ? 3 : 5;
          // 방어 가드: 불완전 라인은 스킵
          if (playerA.board[line].length !== maxCards || playerB.board[line].length !== maxCards) {
            continue;
          }
          let handA, handB;
          if (line === 'top') {
            handA = evaluateHand3(playerA.board.top);
            handB = evaluateHand3(playerB.board.top);
          } else {
            handA = evaluateHand5(playerA.board[line]);
            handB = evaluateHand5(playerB.board[line]);
          }

          handNames[line].a = handA.handName;
          handNames[line].b = handB.handName;

          const cmp = compareHands(handA, handB);
          if (cmp > 0) {
            lineScore[line] = 1;
            winsA++;
            results[idA].lineWins[line]++;
          } else if (cmp < 0) {
            lineScore[line] = -1;
            winsB++;
            results[idB].lineWins[line]++;
          }
          // cmp === 0 → 무승부, 0점
        }

        // 라인 점수 적용
        let totalLine = lineScore.top + lineScore.mid + lineScore.bottom;
        results[idA].score += totalLine;
        results[idB].score -= totalLine;

        // 스쿱 체크 (3라인 모두 승리 = +3 보너스)
        if (winsA === 3) {
          results[idA].score += 3;
          results[idB].score -= 3;
          results[idB].scooped = true;
          results[idB].scoopedBy.push(idA);
        } else if (winsB === 3) {
          results[idB].score += 3;
          results[idA].score -= 3;
          results[idA].scooped = true;
          results[idA].scoopedBy.push(idB);
        }
      }

      // 라인 결과 저장 (클라이언트 기대 구조: nested lines + 보너스)
      const scoopBonusA = (winsA === 3) ? 3 : (winsB === 3 ? -3 : 0);
      const royaltyDiffAB = results[idA].royalties.total - results[idB].royalties.total;
      const lineTotalA = lineScore.top + lineScore.mid + lineScore.bottom;

      // 라인 + 스쿱 + 로열티를 score에 한 번만 가산
      results[idA].score += lineTotalA + scoopBonusA + royaltyDiffAB;
      results[idB].score -= (lineTotalA + scoopBonusA + royaltyDiffAB);

      results[idA].lineResults[idB] = {
        lines: {
          top: { result: lineScore.top, myHand: handNames.top.a, oppHand: handNames.top.b },
          mid: { result: lineScore.mid, myHand: handNames.mid.a, oppHand: handNames.mid.b },
          bottom: { result: lineScore.bottom, myHand: handNames.bottom.a, oppHand: handNames.bottom.b },
        },
        scoopBonus: scoopBonusA,
        royaltyDiff: royaltyDiffAB,
        total: lineTotalA + scoopBonusA + royaltyDiffAB
      };
      results[idB].lineResults[idA] = {
        lines: {
          top: { result: -lineScore.top, myHand: handNames.top.b, oppHand: handNames.top.a },
          mid: { result: -lineScore.mid, myHand: handNames.mid.b, oppHand: handNames.mid.a },
          bottom: { result: -lineScore.bottom, myHand: handNames.bottom.b, oppHand: handNames.bottom.a },
        },
        scoopBonus: -scoopBonusA,
        royaltyDiff: -royaltyDiffAB,
        total: -(lineTotalA + scoopBonusA + royaltyDiffAB)
      };
    }
  }

  // 클라이언트 호환 별칭 추가
  for (const id of playerIds) {
    results[id].totalScore = results[id].score;
    results[id].foul = results[id].fouled;
  }

  return results;
}

module.exports = { scoreHand };
