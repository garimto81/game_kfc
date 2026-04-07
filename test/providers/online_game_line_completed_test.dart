import 'package:flutter_test/flutter_test.dart';
import 'package:game_kfc/providers/online_game_provider.dart';

void main() {
  group('OnlineState - lineCompleted', () {
    test('기본값은 null', () {
      const state = OnlineState();
      expect(state.lastLineCompleted, isNull);
    });

    test('copyWith으로 lineCompleted 설정', () {
      const state = OnlineState();
      final updated = state.copyWith(
        lastLineCompleted: {'playerId': 'p1', 'line': 'top'},
      );
      expect(updated.lastLineCompleted, isNotNull);
      expect(updated.lastLineCompleted!['playerId'], 'p1');
      expect(updated.lastLineCompleted!['line'], 'top');
    });

    test('clearLineCompleted로 null 복원', () {
      const state = OnlineState();
      final withLC = state.copyWith(
        lastLineCompleted: {'playerId': 'p1', 'line': 'mid'},
      );
      final cleared = withLC.copyWith(clearLineCompleted: true);
      expect(cleared.lastLineCompleted, isNull);
    });
  });
}
