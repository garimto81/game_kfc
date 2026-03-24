import 'dart:math';

import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'settings_provider.g.dart';

String generateRandomName() {
  const adjectives = [
    'Lucky', 'Bold', 'Swift', 'Royal', 'Wild',
    'Sharp', 'Cool', 'Brave', 'Sly', 'Ace',
    'Gold', 'Iron', 'Storm', 'Fire', 'Ice',
  ];
  const nouns = [
    'Shark', 'Tiger', 'Eagle', 'Wolf', 'Fox',
    'Panda', 'Lion', 'Hawk', 'Bear', 'Cobra',
    'Whale', 'Raven', 'Lynx', 'Otter', 'Crow',
  ];
  final rng = Random();
  return '${adjectives[rng.nextInt(adjectives.length)]}'
      '${nouns[rng.nextInt(nouns.length)]}'
      '${rng.nextInt(100)}';
}

class AppSettings {
  final bool soundEnabled;
  final bool hapticEnabled;
  final String playerName;
  final String theme;
  final String serverUrl;
  final String country; // ISO 3166-1 alpha-2 country code (e.g., 'KR', 'US')

  const AppSettings({
    this.soundEnabled = true,
    this.hapticEnabled = true,
    this.playerName = 'You',
    this.theme = 'black',
    this.serverUrl = '',
    this.country = 'KR',
  });

  AppSettings copyWith({
    bool? soundEnabled,
    bool? hapticEnabled,
    String? playerName,
    String? theme,
    String? serverUrl,
    String? country,
  }) {
    return AppSettings(
      soundEnabled: soundEnabled ?? this.soundEnabled,
      hapticEnabled: hapticEnabled ?? this.hapticEnabled,
      playerName: playerName ?? this.playerName,
      theme: theme ?? this.theme,
      serverUrl: serverUrl ?? this.serverUrl,
      country: country ?? this.country,
    );
  }
}

@Riverpod(keepAlive: true)
class SettingsNotifier extends _$SettingsNotifier {
  @override
  AppSettings build() {
    return AppSettings(playerName: generateRandomName());
  }

  void toggleSound() {
    state = state.copyWith(soundEnabled: !state.soundEnabled);
  }

  void toggleHaptic() {
    state = state.copyWith(hapticEnabled: !state.hapticEnabled);
  }

  void setPlayerName(String name) {
    state = state.copyWith(playerName: name);
  }

  void setTheme(String theme) {
    state = state.copyWith(theme: theme);
  }

  /// 온라인 서버 URL 설정
  void setServerUrl(String url) {
    state = state.copyWith(serverUrl: url);
  }

  void setCountry(String code) {
    state = state.copyWith(country: code);
  }
}
