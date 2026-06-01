import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'recorder.dart';
import 'streamer.dart';
import 'ambient_service.dart';
import '../gemini/provider.dart';

final audioRecorderProvider = Provider((ref) {
  final service = AudioRecorderService(
    onData: (base64) {
      ref.read(geminiLiveProvider.notifier).sendAudio(base64);
    },
    onFrequencies: (freqs) {
      ref.read(recorderFrequenciesProvider.notifier).update(freqs);
    },
  );
  ref.onDispose(() => service.dispose());
  return service;
});

final audioStreamerProvider = Provider((ref) {
  final service = AudioStreamerService();
  ref.onDispose(() => service.dispose());
  return service;
});

final ambientAudioProvider = Provider((ref) {
  final service = AmbientAudioService();
  ref.onDispose(() => service.dispose());
  return service;
});

class VolumeNotifier extends Notifier<double> {
  @override
  double build() => 0.08;
  
  void set(double val) {
    state = val;
    ref.read(ambientAudioProvider).setVolume(val);
  }
}

final ambientVolumeProvider = NotifierProvider<VolumeNotifier, double>(VolumeNotifier.new);

class FrequenciesNotifier extends Notifier<List<double>> {
  @override
  List<double> build() => List.filled(11, 0.0);
  
  void update(List<double> freqs) {
    state = freqs;
  }
}

final recorderFrequenciesProvider = NotifierProvider<FrequenciesNotifier, List<double>>(FrequenciesNotifier.new);
final streamerFrequenciesProvider = NotifierProvider<FrequenciesNotifier, List<double>>(FrequenciesNotifier.new);
