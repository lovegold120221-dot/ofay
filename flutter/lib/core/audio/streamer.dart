import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter_sound/flutter_sound.dart';

class AudioStreamerService {
  FlutterSoundPlayer? _player;
  final int sampleRate;
  double _currentVolume = 1.0;
  
  // Sequential Queue management
  final List<Uint8List> _queue = [];
  bool _isProcessing = false;
  bool _isFading = false;

  AudioStreamerService({this.sampleRate = 24000});

  Future<void> init() async {
    _player = FlutterSoundPlayer();
    await _player!.openPlayer();
    await _player!.setSubscriptionDuration(const Duration(milliseconds: 10));
  }

  Future<void> start() async {
    if (_player == null) await init();
    _currentVolume = 1.0;
    await _player!.setVolume(_currentVolume);
    
    // Increased bufferSize to 4096 for mobile stability
    await _player!.startPlayerFromStream(
      codec: Codec.pcm16,
      numChannels: 1,
      sampleRate: sampleRate,
      bufferSize: 4096,
      interleaved: true,
    );
    
    _queue.clear();
    _isProcessing = false;
    _isFading = false;
  }

  /// Adds PCM data to the queue and starts processing if not already running.
  void addPCM16(String base64) {
    if (_player == null || !_player!.isPlaying || _isFading) return;
    
    final bytes = base64Decode(base64);
    _queue.add(Uint8List.fromList(bytes));
    
    if (!_isProcessing) {
      _processQueue();
    }
  }

  /// Process the audio queue sequentially with strict await calls.
  /// This ensures the audio hardware is never overwhelmed.
  Future<void> _processQueue() async {
    if (_isProcessing) return;
    _isProcessing = true;

    try {
      while (_queue.isNotEmpty && _player != null && _player!.isPlaying) {
        // Implement a tiny pre-roll if the queue was empty (jitter buffer)
        if (_queue.length < 2) {
          await Future.delayed(const Duration(milliseconds: 20));
        }

        final chunk = _queue.removeAt(0);
        await _player!.feedUint8FromStream(chunk);
      }
    } catch (e) {
      print('Audio Streamer Queue Error: $e');
    } finally {
      _isProcessing = false;
    }
  }

  Future<void> stop() async {
    _queue.clear();
    if (_player != null) {
      await _player!.stopPlayer();
    }
  }

  /// Implements a robust "soft stop" to handle interruptions gracefully.
  Future<void> stopWithFade() async {
    if (_player == null || !_player!.isPlaying || _isFading) return;
    
    _isFading = true;
    _queue.clear(); // Stop adding new audio immediately

    final int steps = 5;
    final int stepDurationMs = 20;
    final double volumeStep = _currentVolume / steps;

    for (int i = 0; i < steps; i++) {
      _currentVolume = (_currentVolume - volumeStep).clamp(0.0, 1.0);
      await _player!.setVolume(_currentVolume);
      await Future.delayed(Duration(milliseconds: stepDurationMs));
    }

    await stop();
    _isFading = false;
  }

  Future<void> dispose() async {
    await stop();
    if (_player != null) {
      await _player!.closePlayer();
      _player = null;
    }
  }
}
