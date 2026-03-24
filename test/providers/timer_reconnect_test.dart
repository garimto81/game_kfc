import 'package:flutter_test/flutter_test.dart';
import 'package:game_kfc/providers/online_game_provider.dart';

void main() {
  group('OnlineState timer fields', () {
    test('default state has zero offset and null deadline', () {
      const state = OnlineState();
      expect(state.serverTimeOffset, 0.0);
      expect(state.turnDeadline, isNull);
      expect(state.turnTimeLimit, 0);
    });

    test('copyWith preserves timer fields', () {
      const state = OnlineState(
        turnDeadline: 1745126534.9,
        turnTimeLimit: 30,
        serverTimeOffset: -0.5,
      );
      final copied = state.copyWith(phase: 'placing');
      expect(copied.turnDeadline, 1745126534.9);
      expect(copied.turnTimeLimit, 30);
      expect(copied.serverTimeOffset, -0.5);
    });

    test('copyWith updates timer fields', () {
      const state = OnlineState(
        turnDeadline: 1000.0,
        turnTimeLimit: 30,
        serverTimeOffset: 0.0,
      );
      final updated = state.copyWith(
        turnDeadline: 2000.0,
        turnTimeLimit: 60,
        serverTimeOffset: -1.5,
      );
      expect(updated.turnDeadline, 2000.0);
      expect(updated.turnTimeLimit, 60);
      expect(updated.serverTimeOffset, -1.5);
    });

    test('clearDeadline resets turnDeadline to null', () {
      const state = OnlineState(turnDeadline: 1000.0);
      final cleared = state.copyWith(clearDeadline: true);
      expect(cleared.turnDeadline, isNull);
    });

    test('reconnect scenario preserves deadline from gameState', () {
      // Simulates reconnect: state should carry deadline/offset
      const preReconnect = OnlineState(
        connectionState: OnlineConnectionState.reconnecting,
        turnDeadline: null,
        turnTimeLimit: 0,
      );

      // After reconnect handler processes gameState with timer data
      final postReconnect = preReconnect.copyWith(
        connectionState: OnlineConnectionState.playing,
        turnDeadline: 1745126534.9,
        turnTimeLimit: 30,
        serverTimeOffset: -0.3,
      );

      expect(postReconnect.connectionState, OnlineConnectionState.playing);
      expect(postReconnect.turnDeadline, 1745126534.9);
      expect(postReconnect.turnTimeLimit, 30);
      expect(postReconnect.serverTimeOffset, -0.3);
    });

    test('serverTimeOffset not lost on unrelated copyWith', () {
      const state = OnlineState(serverTimeOffset: -2.5);
      final updated = state.copyWith(phase: 'scoring');
      expect(updated.serverTimeOffset, -2.5);
    });
  });
}
