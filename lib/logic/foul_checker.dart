import '../models/board.dart';
import 'hand_evaluator.dart';

/// OFC Foul 검사: Bottom >= Mid >= Top 규칙 위반 여부 반환
/// 보드가 가득 차지 않으면(13장 미만) false 반환
bool checkFoul(OFCBoard board) {
  if (!board.isFull()) return false;

  final topResult = evaluateHand(board.top);
  final midResult = evaluateHand(board.mid);
  final bottomResult = evaluateHand(board.bottom);

  // Bottom < Mid 이면 Foul
  if (compareHands(bottomResult, midResult) < 0) return true;

  // Mid < Top 이면 Foul
  if (compareHands(midResult, topResult) < 0) return true;

  return false;
}
