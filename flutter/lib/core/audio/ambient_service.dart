import 'package:audioplayers/audioplayers.dart';

class AmbientAudioService {
  final AudioPlayer _player = AudioPlayer();
  double _volume = 0.08;

  AmbientAudioService() {
    _player.setReleaseMode(ReleaseMode.loop);
  }

  Future<void> start() async {
    if (_player.state == PlayerState.playing) return;
    await _player.setVolume(_volume);
    await _player.play(AssetSource('office.mp3'));
  }

  Future<void> stop() async {
    if (_player.state != PlayerState.stopped) {
      await _player.stop();
    }
  }

  Future<void> setVolume(double volume) async {
    _volume = volume;
    await _player.setVolume(_volume);
  }

  void dispose() {
    _player.dispose();
  }
}
