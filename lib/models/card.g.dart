// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'card.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$CardImpl _$$CardImplFromJson(Map<String, dynamic> json) => _$CardImpl(
  rank: $enumDecode(_$RankEnumMap, json['rank']),
  suit: $enumDecode(_$SuitEnumMap, json['suit']),
);

Map<String, dynamic> _$$CardImplToJson(_$CardImpl instance) =>
    <String, dynamic>{
      'rank': _$RankEnumMap[instance.rank]!,
      'suit': _$SuitEnumMap[instance.suit]!,
    };

const _$RankEnumMap = {
  Rank.two: 'two',
  Rank.three: 'three',
  Rank.four: 'four',
  Rank.five: 'five',
  Rank.six: 'six',
  Rank.seven: 'seven',
  Rank.eight: 'eight',
  Rank.nine: 'nine',
  Rank.ten: 'ten',
  Rank.jack: 'jack',
  Rank.queen: 'queen',
  Rank.king: 'king',
  Rank.ace: 'ace',
};

const _$SuitEnumMap = {
  Suit.club: 'club',
  Suit.diamond: 'diamond',
  Suit.heart: 'heart',
  Suit.spade: 'spade',
};
