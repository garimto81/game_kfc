import 'package:freezed_annotation/freezed_annotation.dart';
import 'board.dart';
import 'card.dart';

part 'player.freezed.dart';
part 'player.g.dart';

class OFCBoardConverter implements JsonConverter<OFCBoard, Map<String, dynamic>> {
  const OFCBoardConverter();

  @override
  OFCBoard fromJson(Map<String, dynamic> json) => OFCBoard.fromJson(json);

  @override
  Map<String, dynamic> toJson(OFCBoard board) => board.toJson();
}

@freezed
class Player with _$Player {
  const factory Player({
    required String id,
    required String name,
    @OFCBoardConverter() required OFCBoard board,
    @Default(0) int score,
    @Default(false) bool isInFantasyland,
    @Default(0) int fantasylandCardCount,
    @Default([]) List<Card> hand,
  }) = _Player;

  factory Player.fromJson(Map<String, dynamic> json) => _$PlayerFromJson(json);
}
