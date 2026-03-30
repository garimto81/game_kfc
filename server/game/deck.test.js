/**
 * deck.js 단위 테스트 — Node.js assert 기반
 * 실행: node server/game/deck.test.js
 */
const assert = require('assert');
const { createDeck, shuffle, dealCards, createCard, cardsEqual } = require('./deck');

// ── createDeck 테스트 ──

function testDeckSize() {
  const deck = createDeck();
  assert.strictEqual(deck.length, 52, '덱은 52장');
  console.log('  PASS: testDeckSize');
}

function testDeckUniqueness() {
  const deck = createDeck();
  const keys = new Set(deck.map(c => `${c.rank}-${c.suit}`));
  assert.strictEqual(keys.size, 52, '52장 모두 고유');
  console.log('  PASS: testDeckUniqueness');
}

function testDeckRankRange() {
  const deck = createDeck();
  for (const c of deck) {
    assert.ok(c.rank >= 2 && c.rank <= 14, `rank ${c.rank}은 2~14 범위`);
  }
  console.log('  PASS: testDeckRankRange');
}

function testDeckSuitRange() {
  const deck = createDeck();
  for (const c of deck) {
    assert.ok(c.suit >= 1 && c.suit <= 4, `suit ${c.suit}은 1~4 범위`);
  }
  console.log('  PASS: testDeckSuitRange');
}

function testDeckHasRankAndSuitNames() {
  const deck = createDeck();
  for (const c of deck) {
    assert.ok(typeof c.rankName === 'string' && c.rankName.length > 0, 'rankName 존재');
    assert.ok(typeof c.suitName === 'string' && c.suitName.length > 0, 'suitName 존재');
  }
  console.log('  PASS: testDeckHasRankAndSuitNames');
}

// ── dealCards 테스트 ──

function testDealCards() {
  const deck = createDeck();
  const dealt = dealCards(deck, 5);
  assert.strictEqual(dealt.length, 5, '5장 딜');
  assert.strictEqual(deck.length, 47, '덱에 47장 남음');
  console.log('  PASS: testDealCards');
}

function testDealCardsZero() {
  const deck = createDeck();
  const dealt = dealCards(deck, 0);
  assert.strictEqual(dealt.length, 0, '0장 딜 → 빈 배열');
  assert.strictEqual(deck.length, 52, '덱 변화 없음');
  console.log('  PASS: testDealCardsZero');
}

function testDealCardsSequential() {
  const deck = createDeck();
  const first5 = dealCards(deck, 5);
  const next3 = dealCards(deck, 3);
  assert.strictEqual(deck.length, 44, '8장 딜 후 44장 남음');

  // 딜된 카드 간 중복 없음
  const allDealt = [...first5, ...next3];
  const keys = new Set(allDealt.map(c => `${c.rank}-${c.suit}`));
  assert.strictEqual(keys.size, 8, '딜된 8장 모두 고유');
  console.log('  PASS: testDealCardsSequential');
}

// ── cardsEqual 테스트 ──

function testCardsEqualSame() {
  const a = createCard(14, 1);
  const b = createCard(14, 1);
  assert.strictEqual(cardsEqual(a, b), true, '같은 rank+suit → true');
  console.log('  PASS: testCardsEqualSame');
}

function testCardsEqualDifferentRank() {
  const a = createCard(14, 1);
  const b = createCard(13, 1);
  assert.strictEqual(cardsEqual(a, b), false, '다른 rank → false');
  console.log('  PASS: testCardsEqualDifferentRank');
}

function testCardsEqualDifferentSuit() {
  const a = createCard(14, 1);
  const b = createCard(14, 2);
  assert.strictEqual(cardsEqual(a, b), false, '다른 suit → false');
  console.log('  PASS: testCardsEqualDifferentSuit');
}

function testCardsEqualNull() {
  assert.strictEqual(cardsEqual(null, createCard(14, 1)), false, 'null → false');
  assert.strictEqual(cardsEqual(createCard(14, 1), null), false, 'null → false');
  assert.strictEqual(cardsEqual(null, null), false, 'both null → false');
  assert.strictEqual(cardsEqual(undefined, createCard(14, 1)), false, 'undefined → false');
  console.log('  PASS: testCardsEqualNull');
}

// ── shuffle 테스트 ──

function testShufflePreservesSize() {
  const deck = createDeck();
  const shuffled = shuffle(deck);
  assert.strictEqual(shuffled.length, 52, '셔플 후 52장 유지');
  console.log('  PASS: testShufflePreservesSize');
}

function testShufflePreservesCards() {
  const deck = createDeck();
  const shuffled = shuffle(deck);
  const deckKeys = new Set(deck.map(c => `${c.rank}-${c.suit}`));
  const shuffledKeys = new Set(shuffled.map(c => `${c.rank}-${c.suit}`));
  assert.deepStrictEqual(shuffledKeys, deckKeys, '셔플 후 같은 카드 구성');
  console.log('  PASS: testShufflePreservesCards');
}

function testShuffleDoesNotMutateOriginal() {
  const deck = createDeck();
  const original = [...deck];
  shuffle(deck);
  assert.strictEqual(deck.length, 52, '원본 덱 유지');
  // 원본 순서가 유지되는지 (shuffle은 새 배열 반환)
  for (let i = 0; i < 52; i++) {
    assert.strictEqual(deck[i].rank, original[i].rank, '원본 변경 없음');
    assert.strictEqual(deck[i].suit, original[i].suit, '원본 변경 없음');
  }
  console.log('  PASS: testShuffleDoesNotMutateOriginal');
}

function testShuffleChangesOrder() {
  // 확률적 테스트: 10번 셔플하여 최소 1번은 순서가 다른지 확인
  const deck = createDeck();
  let diffFound = false;
  for (let attempt = 0; attempt < 10; attempt++) {
    const shuffled = shuffle(deck);
    for (let i = 0; i < 52; i++) {
      if (shuffled[i].rank !== deck[i].rank || shuffled[i].suit !== deck[i].suit) {
        diffFound = true;
        break;
      }
    }
    if (diffFound) break;
  }
  assert.ok(diffFound, '셔플은 순서를 변경함 (10회 시도 중 최소 1회)');
  console.log('  PASS: testShuffleChangesOrder');
}

// 실행
console.log('deck.js 테스트 시작...');
testDeckSize();
testDeckUniqueness();
testDeckRankRange();
testDeckSuitRange();
testDeckHasRankAndSuitNames();
testDealCards();
testDealCardsZero();
testDealCardsSequential();
testCardsEqualSame();
testCardsEqualDifferentRank();
testCardsEqualDifferentSuit();
testCardsEqualNull();
testShufflePreservesSize();
testShufflePreservesCards();
testShuffleDoesNotMutateOriginal();
testShuffleChangesOrder();
console.log('모든 테스트 통과!');
