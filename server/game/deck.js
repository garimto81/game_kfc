/**
 * 덱 생성 및 셔플 모듈
 */

// 랭크 enum: two=2 ~ ace=14
const RANK_NAMES = {
  2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six',
  7: 'seven', 8: 'eight', 9: 'nine', 10: 'ten',
  11: 'jack', 12: 'queen', 13: 'king', 14: 'ace'
};

// 수트 enum: club=1, diamond=2, heart=3, spade=4
const SUIT_NAMES = {
  1: 'club', 2: 'diamond', 3: 'heart', 4: 'spade'
};

/**
 * 카드 객체 생성
 */
function createCard(rank, suit) {
  return {
    rank,
    suit,
    rankName: RANK_NAMES[rank],
    suitName: SUIT_NAMES[suit]
  };
}

/**
 * 52장 표준 덱 생성
 */
function createDeck() {
  const deck = [];
  for (let suit = 1; suit <= 4; suit++) {
    for (let rank = 2; rank <= 14; rank++) {
      deck.push(createCard(rank, suit));
    }
  }
  return deck;
}

/**
 * Fisher-Yates 셔플 알고리즘
 */
function shuffle(deck) {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * 덱에서 카드 n장 뽑기
 */
function dealCards(deck, n) {
  return deck.splice(0, n);
}

/**
 * 두 카드가 같은지 비교
 */
function cardsEqual(a, b) {
  if (!a || !b) return false;
  return a.rank === b.rank && a.suit === b.suit;
}

module.exports = { createDeck, shuffle, dealCards, createCard, cardsEqual, RANK_NAMES, SUIT_NAMES };
