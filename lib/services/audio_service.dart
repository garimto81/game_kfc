import 'package:audioplayers/audioplayers.dart';

/// Singleton audio service for game sound effects and BGM.
/// Respects soundEnabled setting from AppSettings.
class AudioService {
  AudioService._();
  static final AudioService instance = AudioService._();

  bool _enabled = true;
  final AudioPlayer _sfxPlayer = AudioPlayer();
  final AudioPlayer _layerPlayer = AudioPlayer();
  final AudioPlayer _bgmPlayer = AudioPlayer();

  bool get enabled => _enabled;
  set enabled(bool value) => _enabled = value;

  Future<void> init() async {
    await _bgmPlayer.setReleaseMode(ReleaseMode.loop);
    await _bgmPlayer.setVolume(0.3);
    await _sfxPlayer.setVolume(0.7);
    await _layerPlayer.setVolume(0.6);
  }

  Future<void> dispose() async {
    await _sfxPlayer.dispose();
    await _layerPlayer.dispose();
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

  /// Layered SFX — plays on a separate channel so it doesn't cut off the main SFX.
  /// Used to stack a bass/impact sound on top of celebrations (e.g., L3 + shake).
  Future<void> _playLayer(String fileName) async {
    if (!_enabled) return;
    try {
      await _layerPlayer.stop();
      await _layerPlayer.play(AssetSource('sounds/$fileName'));
    } catch (_) {}
  }

  // Game events
  Future<void> playDeal() => _playSfx('SoundDealCard.mp3');
  Future<void> playPlace() => _playSfx('SoundBoard.mp3');
  Future<void> playShow() => _playSfx('SoundShowCard.mp3');
  Future<void> playTurnNotify() => _playSfx('NotificationTimeTurnToAct.mp3');
  Future<void> playTick() => _playSfx('tick.mp3');
  Future<void> playTimeWarning() => _playSfx('NotificationTimeWinding.mp3');

  // Celebration tier-specific SFX (L1/L2/L3 + Impact)
  Future<void> playWinSmall() => _playSfx('CoinDrop.mp3');           // L1: 가벼운 성공
  Future<void> playWinMedium() => _playSfx('MissionReward.mp3');     // L2: 보상 jingle
  Future<void> playScoop() => _playSfx('SoundWinCongratulation.mp3'); // L3: 환호
  Future<void> playL3Bass() => _playLayer('SoundCashdropBig.mp3');   // L3 layered bass (shake 동기)
  Future<void> playImpact() => _playSfx('SoundJackPotToast.mp3');    // Impact Slam: 긴장 toast
  Future<void> playFantasyland() => _playSfx('FishWheelCelebration.mp3');
  Future<void> playFoul() => _playSfx('SoundAofDynamiteBomb.mp3');
  Future<void> playDiscard() => _playSfx('SoundFold.mp3');
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
