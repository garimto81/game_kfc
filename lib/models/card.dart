import 'package:freezed_annotation/freezed_annotation.dart';

part 'card.freezed.dart';
part 'card.g.dart';

enum Rank {
  two(2),
  three(3),
  four(4),
  five(5),
  six(6),
  seven(7),
  eight(8),
  nine(9),
  ten(10),
  jack(11),
  queen(12),
  king(13),
  ace(14);

  const Rank(this.value);
  final int value;

  String get rankName {
    switch (this) {
      case Rank.two:
        return '2';
      case Rank.three:
        return '3';
      case Rank.four:
        return '4';
      case Rank.five:
        return '5';
      case Rank.six:
        return '6';
      case Rank.seven:
        return '7';
      case Rank.eight:
        return '8';
      case Rank.nine:
        return '9';
      case Rank.ten:
        return '10';
      case Rank.jack:
        return 'J';
      case Rank.queen:
        return 'Q';
      case Rank.king:
        return 'K';
      case Rank.ace:
        return 'A';
    }
  }
}

enum Suit {
  club(1),
  diamond(2),
  heart(3),
  spade(4);

  const Suit(this.value);
  final int value;

  String get suitSymbol {
    switch (this) {
      case Suit.club:
        return '♣';
      case Suit.diamond:
        return '♦';
      case Suit.heart:
        return '♥';
      case Suit.spade:
        return '♠';
    }
  }
}

@freezed
class Card with _$Card {
  const factory Card({
    required Rank rank,
    required Suit suit,
  }) = _Card;

  factory Card.fromJson(Map<String, dynamic> json) => _$CardFromJson(json);
}
