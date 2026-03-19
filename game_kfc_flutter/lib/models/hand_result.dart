import 'package:freezed_annotation/freezed_annotation.dart';

part 'hand_result.freezed.dart';
part 'hand_result.g.dart';

enum HandType {
  highCard(1),
  onePair(2),
  twoPair(3),
  threeOfAKind(4),
  straight(5),
  flush(6),
  fullHouse(7),
  fourOfAKind(8),
  straightFlush(9),
  royalFlush(10);

  const HandType(this.value);
  final int value;
}

@freezed
class HandResult with _$HandResult {
  const factory HandResult({
    required HandType handType,
    required List<int> kickers,
  }) = _HandResult;

  factory HandResult.fromJson(Map<String, dynamic> json) =>
      _$HandResultFromJson(json);
}
