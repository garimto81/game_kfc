// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'player.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$PlayerImpl _$$PlayerImplFromJson(Map<String, dynamic> json) => _$PlayerImpl(
  id: json['id'] as String,
  name: json['name'] as String,
  board: const OFCBoardConverter().fromJson(
    json['board'] as Map<String, dynamic>,
  ),
  score: (json['score'] as num?)?.toInt() ?? 0,
  isInFantasyland: json['isInFantasyland'] as bool? ?? false,
  fantasylandCardCount: (json['fantasylandCardCount'] as num?)?.toInt() ?? 0,
  hand:
      (json['hand'] as List<dynamic>?)
          ?.map((e) => Card.fromJson(e as Map<String, dynamic>))
          .toList() ??
      const [],
);

Map<String, dynamic> _$$PlayerImplToJson(_$PlayerImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'name': instance.name,
      'board': const OFCBoardConverter().toJson(instance.board),
      'score': instance.score,
      'isInFantasyland': instance.isInFantasyland,
      'fantasylandCardCount': instance.fantasylandCardCount,
      'hand': instance.hand,
    };
