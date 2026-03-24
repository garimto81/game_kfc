import 'package:audioplayers/audioplayers.dart';

/// Singleton audio service for game sound effects and BGM.
/// Respects soundEnabled setting from AppSettings.
class AudioService {
  AudioService._();
  static final AudioService instance = AudioService._();

  bool _enabled = true;
  final AudioPlayer _sfxPlayer = AudioPlayer();
  final AudioPlayer _bgmPlayer = AudioPlayer();

  bool get enabled => _enabled;
  set enabled(bool value) => _enabled = value;

  Future<void> init() async {
    await _bgmPlayer.setReleaseMode(ReleaseMode.loop);
    await _bgmPlayer.setVolume(0.3);
    await _sfxPlayer.setVolume(0.7);
  }

  Future<void> dispose() async {
    await _sfxPlayer.dispose();
    await _bgmPlayer.dispose();
  }

  Future<void> _playSfx(String fileName) async {
    if (!_enabled) return;
    try {
      await _sfxPlayer.stop();
      await _sfxPlayer.play(AssetSource('sounds/$fileName'));
    } catch (_) {
      // Silently ignore audio errors (e.g., web restrictions)
    }
  }

  // Game events
  Future<void> playDeal() => _playSfx('SoundDealCard.mp3');
  Future<void> playPlace() => _playSfx('SoundBoard.mp3');
  Future<void> playShow() => _playSfx('SoundShowCard.mp3');
  Future<void> playTurnNotify() => _playSfx('NotificationTimeTurnToAct.mp3');
  Future<void> playTick() => _playSfx('tick.mp3');
  Future<void> playTimeWarning() => _playSfx('NotificationTimeWinding.mp3');
  Future<void> playWin() => _playSfx('SoundWinPot.mp3');
  Future<void> playScoop() => _playSfx('SoundWinCongratulation.mp3');
  Future<void> playFantasyland() => _playSfx('SoundTournamentWin.mp3');
  Future<void> playFoul() => _playSfx('SoundFold.mp3');
  Future<void> playScore() => _playSfx('SoundGatherChips.mp3');
  Future<void> playCoinDrop() => _playSfx('CoinDrop.mp3');

  // BGM
  Future<void> startLobbyBgm() async {
    if (!_enabled) return;
    try {
      await _bgmPlayer.play(AssetSource('sounds/BgmLobby.mp3'));
    } catch (_) {}
  }

  Future<void> stopBgm() async {
    try {
      await _bgmPlayer.stop();
    } catch (_) {}
  }
}
