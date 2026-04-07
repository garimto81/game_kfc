import 'package:flutter/foundation.dart';
import 'package:game_kfc/models/card.dart';

/// 이펙트 생명주기 중앙 관리자 (timer-based 최소 표시 보장).
///
/// celebration은 최소 표시 시간이 보장된다 (L1=800ms, L2=1200ms, L3=1500ms).
/// softClearAll()은 만료 전 celebration을 보존한다.
/// forceClearAll()은 무조건 전부 삭제한다 (재접속/나가기용).
class EffectManager {
  /// 위젯 리빌드 트리거 콜백
  VoidCallback? onStateChanged;

  /// Early Warning: 미완성 라인 패턴 감지 (콜백 기반 소멸)
  /// key: "h{handNum}_{line}_{rank.value}_{suit.value}"
  final Set<String> _earlyWarnings = {};

  /// Celebration: 라인 완성 시 celebLevel 캐시
  /// key: "h{handNum}_{line}"
  final Map<String, int> _celebrations = {};

  /// Celebration expiry: 최소 표시 시간 보장
  final Map<String, DateTime> _celebrationExpiry = {};

  /// Sound tracking: 축하 소리 중복 방지
  final Set<String> _playedSounds = {};

  /// Level별 최소 표시 시간
  static const _displayDurations = {
    1: Duration(milliseconds: 800),
    2: Duration(milliseconds: 1200),
    3: Duration(milliseconds: 1500),
  };

  // ── Early Warning ──

  void addEarlyWarning(int handNum, String line, List<Card> cards) {
    for (final card in cards) {
      _earlyWarnings.add(_warningKey(handNum, line, card));
    }
  }

  bool isEarlyWarningActive(int handNum, String line, Card card) {
    return _earlyWarnings.contains(_warningKey(handNum, line, card));
  }

  /// 위젯 애니메이션 완료 시 호출 → 해당 라인의 Early Warning 제거
  void completeEarlyWarning(int handNum, String line) {
    final prefix = 'h${handNum}_${line}_';
    _earlyWarnings.removeWhere((k) => k.startsWith(prefix));
    onStateChanged?.call();
  }

  bool get hasActiveWarnings => _earlyWarnings.isNotEmpty;

  // ── Celebration ──

  void setCelebration(int handNum, String line, int level) {
    final key = _celebKey(handNum, line);
    final duration = _displayDurations[level.clamp(1, 3)]!;
    debugPrint('[EFFECT] store: key=$key level=$level expiry=${duration.inMilliseconds}ms');
    _celebrations[key] = level;
    _celebrationExpiry[key] = DateTime.now().add(duration);
    onStateChanged?.call();
  }

  /// 테스트용: expiry를 직접 지정
  @visibleForTesting
  void setCelebrationWithExpiry(int handNum, String line, int level, Duration expiry) {
    final key = _celebKey(handNum, line);
    _celebrations[key] = level;
    _celebrationExpiry[key] = DateTime.now().add(expiry);
    onStateChanged?.call();
  }

  int getCelebration(int handNum, String line) {
    final key = _celebKey(handNum, line);
    final level = _celebrations[key];
    if (level == null) return 0;
    final expiry = _celebrationExpiry[key];
    if (expiry != null && DateTime.now().isAfter(expiry)) {
      _celebrations.remove(key);
      _celebrationExpiry.remove(key);
      return 0;
    }
    return level;
  }

  /// 위젯 애니메이션 완료 시 호출 → 해당 라인의 Celebration 제거
  void completeCelebration(int handNum, String line) {
    final key = _celebKey(handNum, line);
    _celebrations.remove(key);
    _celebrationExpiry.remove(key);
    onStateChanged?.call();
  }

  // ── Sound Tracking ──

  bool markSoundPlayed(int handNum, String line) {
    return _playedSounds.add(_celebKey(handNum, line));
  }

  // ── Lifecycle ──

  /// 라운드 전환 / confirm 시: earlyWarning만 초기화.
  void clearRound() {
    _earlyWarnings.clear();
  }

  /// 소프트 클리어: warning+sounds 즉시 삭제, celebration은 만료된 것만 삭제.
  /// 핸드 전환 시 사용 — 진행 중인 celebration 애니메이션 보존.
  void softClearAll() {
    _earlyWarnings.clear();
    _playedSounds.clear();
    // 만료된 celebration만 제거
    final now = DateTime.now();
    final expiredKeys = <String>[];
    for (final entry in _celebrationExpiry.entries) {
      if (now.isAfter(entry.value)) {
        expiredKeys.add(entry.key);
      }
    }
    for (final key in expiredKeys) {
      _celebrations.remove(key);
      _celebrationExpiry.remove(key);
    }
  }

  /// 강제 클리어: 모든 상태 무조건 초기화. 재접속/나가기 시 사용.
  void forceClearAll() {
    _earlyWarnings.clear();
    _celebrations.clear();
    _celebrationExpiry.clear();
    _playedSounds.clear();
  }

  /// Legacy alias: forceClearAll과 동일.
  void clearAll() => forceClearAll();

  // ── Private helpers ──

  String _warningKey(int handNum, String line, Card card) =>
      'h${handNum}_${line}_${card.rank.value}_${card.suit.value}';

  String _celebKey(int handNum, String line) => 'h${handNum}_$line';
}
