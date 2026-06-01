import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'dart:math' as math;
import 'package:record/record.dart';
import 'package:permission_handler/permission_handler.dart';

class AudioRecorderService {
  final AudioRecorder _recorder = AudioRecorder();
  StreamSubscription? _subscription;
  final Function(String base64) onData;
  final Function(List<double> frequencies) onFrequencies;

  // Internal state for smoothing
  List<double> _previousBins = List.filled(11, 0.0);

  AudioRecorderService({required this.onData, required this.onFrequencies});

  Future<void> start() async {
    try {
      // Explicitly request microphone permission using permission_handler for Android reliability
      final status = await Permission.microphone.request();
      if (!status.isGranted) {
        print('Microphone permission denied');
        return;
      }

      // Final check with record package
      if (await _recorder.hasPermission()) {
        final config = const RecordConfig(
          encoder: AudioEncoder.pcm16bits,
          sampleRate: 16000,
          numChannels: 1,
          autoGain: true,
          echoCancel: true,
          noiseSuppress: true,
        );

        final stream = await _recorder.startStream(config);
        
        _subscription = stream.listen((data) {
          // Robust Mic: Apply strong software gain boost (x2.5) and lowered noise floor (30)
          final enhancedData = _applyRobustGain(data, 2.5);
          
          onData(base64Encode(enhancedData));
          
          // Realtime Visualization: Improved bin calculation
          final currentBins = _calculateFrequencies(enhancedData);
          _previousBins = List.generate(11, (i) => _previousBins[i] * 0.4 + currentBins[i] * 0.6);
          onFrequencies(_previousBins);
        }, onError: (err) {
          print('Audio Stream Error: $err');
        });
      } else {
        print('Recorder hasPermission returned false after system prompt');
      }
    } catch (e) {
      print('Failed to start recording: $e');
    }
  }

  Uint8List _applyRobustGain(Uint8List data, double gain) {
    final Int16List samples = Int16List.view(data.buffer);
    final Int16List result = Int16List(samples.length);
    
    // Lowered noise floor to 30 to catch faint voices
    const int noiseFloor = 30;

    for (int i = 0; i < samples.length; i++) {
      int raw = samples[i];
      
      // Basic noise gate
      if (raw.abs() < noiseFloor) {
        result[i] = 0;
        continue;
      }

      int value = (raw * gain).round();
      // Clamp to Int16 limits
      if (value > 32767) value = 32767;
      if (value < -32768) value = -32768;
      result[i] = value;
    }
    
    return Uint8List.view(result.buffer);
  }

  List<double> _calculateFrequencies(Uint8List data) {
    final List<double> bins = List.filled(11, 0.0);
    if (data.isEmpty) return bins;

    final int samplesPerBin = (data.length / 2 / 11).floor();
    if (samplesPerBin == 0) return bins;

    final view = ByteData.view(data.buffer);
    
    for (int i = 0; i < 11; i++) {
      double sumOfSquares = 0;
      for (int j = 0; j < samplesPerBin; j++) {
        final index = (i * samplesPerBin + j) * 2;
        if (index + 1 < data.length) {
          final double sample = view.getInt16(index, Endian.little) / 32768.0;
          sumOfSquares += sample * sample;
        }
      }
      
      double rms = math.sqrt(sumOfSquares / samplesPerBin);
      
      // Dynamic Range Compression: boost lower signals for visualizer energy
      bins[i] = math.pow(rms, 0.4).toDouble().clamp(0.0, 1.0);
    }
    return bins;
  }

  Future<void> stop() async {
    await _subscription?.cancel();
    await _recorder.stop();
    _previousBins = List.filled(11, 0.0);
  }

  void dispose() {
    _recorder.dispose();
  }
}
