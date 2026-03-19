// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'hand_result.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$HandResultImpl _$$HandResultImplFromJson(Map<String, dynamic> json) =>
    _$HandResultImpl(
      handType: $enumDecode(_$HandTypeEnumMap, json['handType']),
      kickers: (json['kickers'] as List<dynamic>)
          .map((e) => (e as num).toInt())
          .toList(),
    );

Map<String, dynamic> _$$HandResultImplToJson(_$HandResultImpl instance) =>
    <String, dynamic>{
      'handType': _$HandTypeEnumMap[instance.handType]!,
      'kickers': instance.kickers,
    };

const _$HandTypeEnumMap = {
  HandType.highCard: 'highCard',
  HandType.onePair: 'onePair',
  HandType.twoPair: 'twoPair',
  HandType.threeOfAKind: 'threeOfAKind',
  HandType.straight: 'straight',
  HandType.flush: 'flush',
  HandType.fullHouse: 'fullHouse',
  HandType.fourOfAKind: 'fourOfAKind',
  HandType.straightFlush: 'straightFlush',
  HandType.royalFlush: 'royalFlush',
};
