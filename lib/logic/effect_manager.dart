import 'package:game_kfc/models/card.dart';

/// 이펙트 생명주기 중앙 관리자.
///
/// Early Warning, Celebration, Sound tracking 3가지 상태를 통합 관리한다.
/// 키에 handNumber를 포함하여 핸드 간 충돌을 방지한다.
class EffectManager {
  /// Early Warning: 미완성 라인 패턴 감지 (자동 만료)
  /// key: "h{handNum}_{line}_{rank.value}_{suit.value}"
  /// value: 만료 시각
  final Map<String, DateTime> _earlyWarnings = {};

  /// Celebration: 라인 완성 시 celebLevel 캐시
  /// key: "h{handNum}_{line}"
  final Map<String, int> _celebrations = {};

  /// Sound tracking: 축하 소리 중복 방지
  final Set<String> _playedSounds = {};

  // ── Early Warning ──

  void addEarlyWarning(
    int handNum,
    String line,
    List<Card> cards, {
    Duration duration = const Duration(milliseconds: 1500),
  }) {
    final expiry = DateTime.now().add(duration);
    for (final card in cards) {
      final key = _warningKey(handNum, line, card);
      _earlyWarnings[key] = expiry;
    }
  }

  bool isEarlyWarningActive(int handNum, String line, Card card) {
    final key = _warningKey(handNum, line, card);
    final expiry = _earlyWarnings[key];
    if (expiry == null) return false;
    if (!DateTime.now().isBefore(expiry)) {
      _earlyWarnings.remove(key);
      return false;
    }
    return true;
  }

  List<Card> earlyWarningCards(int handNum, String line) {
    final prefix = 'h${handNum}_${line}_';
    final now = DateTime.now();
    final result = <Card>[];

    final keysToRemove = <String>[];
    for (final entry in _earlyWarnings.entries) {
      if (!entry.key.startsWith(prefix)) continue;
      if (!now.isBefore(entry.value)) {
        keysToRemove.add(entry.key);
        continue;
      }
      // Parse card from key: "h{handNum}_{line}_{rank}_{suit}"
      final parts = entry.key.split('_');
      // parts: [h1, top, 14, 4] for example
      final rankValue = int.parse(parts[parts.length - 2]);
      final suitValue = int.parse(parts[parts.length - 1]);
      result.add(Card(
        rank: Rank.values.firstWhere((r) => r.value == rankValue),
        suit: Suit.values.firstWhere((s) => s.value == suitValue),
      ));
    }

    for (final key in keysToRemove) {
      _earlyWarnings.remove(key);
    }

    return result;
  }

  bool get hasActiveWarnings {
    if (_earlyWarnings.isEmpty) return false;
    final now = DateTime.now();
    return _earlyWarnings.values.any((expiry) => now.isBefore(expiry));
  }

  // ── Celebration ──

  void setCelebration(int handNum, String line, int level) {
    _celebrations[_celebKey(handNum, line)] = level;
  }

  int getCelebration(int handNum, String line) {
    return _celebrations[_celebKey(handNum, line)] ?? 0;
  }

  // ── Sound Tracking ──

  /// 첫 호출 시 true, 이후 false 반환.
  bool markSoundPlayed(int handNum, String line) {
    return _playedSounds.add(_celebKey(handNum, line));
  }

  // ── Lifecycle ──

  /// 만료된 earlyWarning 항목 제거.
  void tick() {
    final now = DateTime.now();
    _earlyWarnings.removeWhere((_, expiry) => !now.isBefore(expiry));
  }

  /// 모든 상태 초기화. 라운드/핸드 전환, 재접속, FL 전환, confirm 시 호출.
  void clearAll() {
    _earlyWarnings.clear();
    _celebrations.clear();
    _playedSounds.clear();
  }

  // ── Private helpers ──

  String _warningKey(int handNum, String line, Card card) =>
      'h${handNum}_${line}_${card.rank.value}_${card.suit.value}';

  String _celebKey(int handNum, String line) => 'h${handNum}_$line';
}
