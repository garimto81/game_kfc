import 'card.dart';

class OFCBoard {
  final List<Card> top;
  final List<Card> mid;
  final List<Card> bottom;

  static const int topMaxCards = 3;
  static const int midMaxCards = 5;
  static const int bottomMaxCards = 5;

  OFCBoard({
    List<Card>? top,
    List<Card>? mid,
    List<Card>? bottom,
  })  : top = top != null ? List.unmodifiable(top) : const [],
        mid = mid != null ? List.unmodifiable(mid) : const [],
        bottom = bottom != null ? List.unmodifiable(bottom) : const [];

  /// 배치 가능 여부 확인
  bool canPlace(String line) {
    switch (line) {
      case 'top':
        return top.length < topMaxCards;
      case 'mid':
        return mid.length < midMaxCards;
      case 'bottom':
        return bottom.length < bottomMaxCards;
      default:
        return false;
    }
  }

  /// 카드 배치: Immutable — 새 OFCBoard 인스턴스 반환
  /// 만석이면 자신 반환 (변경 없음)
  OFCBoard placeCard(String line, Card card) {
    switch (line) {
      case 'top':
        if (top.length < topMaxCards) {
          return copyWith(top: [...top, card]);
        }
        return this;
      case 'mid':
        if (mid.length < midMaxCards) {
          return copyWith(mid: [...mid, card]);
        }
        return this;
      case 'bottom':
        if (bottom.length < bottomMaxCards) {
          return copyWith(bottom: [...bottom, card]);
        }
        return this;
      default:
        return this;
    }
  }

  /// 카드 제거: Immutable — 새 OFCBoard 인스턴스 반환
  /// 주의: GameController 레벨에서는 Committed Rule에 따라 호출 금지 (테스트 전용)
  OFCBoard removeCard(String line, Card card) {
    switch (line) {
      case 'top':
        return copyWith(top: top.where((c) => c != card).toList());
      case 'mid':
        return copyWith(mid: mid.where((c) => c != card).toList());
      case 'bottom':
        return copyWith(bottom: bottom.where((c) => c != card).toList());
      default:
        return this;
    }
  }

  bool isFull() {
    return top.length == topMaxCards &&
        mid.length == midMaxCards &&
        bottom.length == bottomMaxCards;
  }

  int totalCards() {
    return top.length + mid.length + bottom.length;
  }

  OFCBoard copyWith({
    List<Card>? top,
    List<Card>? mid,
    List<Card>? bottom,
  }) {
    return OFCBoard(
      top: top ?? List<Card>.from(this.top),
      mid: mid ?? List<Card>.from(this.mid),
      bottom: bottom ?? List<Card>.from(this.bottom),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'top': top.map((c) => c.toJson()).toList(),
      'mid': mid.map((c) => c.toJson()).toList(),
      'bottom': bottom.map((c) => c.toJson()).toList(),
    };
  }

  factory OFCBoard.fromJson(Map<String, dynamic> json) {
    return OFCBoard(
      top: (json['top'] as List<dynamic>)
          .map((e) => Card.fromJson(e as Map<String, dynamic>))
          .toList(),
      mid: (json['mid'] as List<dynamic>)
          .map((e) => Card.fromJson(e as Map<String, dynamic>))
          .toList(),
      bottom: (json['bottom'] as List<dynamic>)
          .map((e) => Card.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}
