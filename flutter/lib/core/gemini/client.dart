import 'dart:async';
import 'dart:convert';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'models.dart';

abstract class GeminiLiveClientDelegate {
  void onSetupComplete();
  void onAudioData(String base64);
  void onTranscript(String text);
  void onInterrupted();
  void onTurnComplete();
  void onToolCall(List<Map<String, dynamic>> functionCalls);
  void onError(dynamic error);
  void onDone();
}

class GeminiLiveClient {
  final String apiKey;
  final String model;
  final GeminiLiveClientDelegate delegate;
  
  WebSocketChannel? _channel;
  StreamSubscription? _subscription;
  bool _isConnected = false;

  GeminiLiveClient({
    required this.apiKey,
    this.model = 'models/gemini-2.0-flash-exp',
    required this.delegate,
  });

  Future<void> connect({
    required String voiceName,
    String? systemInstruction,
    List<Map<String, dynamic>>? tools,
  }) async {
    final uri = Uri.parse(
      'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=$apiKey',
    );

    try {
      _channel = WebSocketChannel.connect(uri);
      _isConnected = true;

      _subscription = _channel!.stream.listen(
        (data) => _handleMessage(data),
        onError: (err) => delegate.onError(err),
        onDone: () {
          _isConnected = false;
          delegate.onDone();
        },
      );

      // Send setup message
      send(GeminiLiveMessage.setup(
        model: model,
        voiceName: voiceName,
        systemInstruction: systemInstruction,
        tools: tools,
      ));
    } catch (e) {
      delegate.onError(e);
    }
  }

  void _handleMessage(dynamic data) {
    try {
      final Map<String, dynamic> raw = jsonDecode(data);
      final message = GeminiServerMessage(raw);

      if (message.isSetupComplete) {
        delegate.onSetupComplete();
      }

      if (message.interrupted) {
        delegate.onInterrupted();
      }

      final audio = message.audioData;
      if (audio != null) {
        delegate.onAudioData(audio);
      }

      final transcript = message.transcript;
      if (transcript != null) {
        delegate.onTranscript(transcript);
      }

      if (message.turnComplete) {
        delegate.onTurnComplete();
      }

      final toolCalls = message.functionCalls;
      if (toolCalls != null) {
        delegate.onToolCall(toolCalls);
      }
    } catch (e) {
      print('Error parsing Gemini message: $e');
    }
  }

  void send(GeminiLiveMessage message) {
    if (_isConnected && _channel != null) {
      _channel!.sink.add(message.toJson());
    }
  }

  void sendAudio(String base64) {
    send(GeminiLiveMessage.audio(base64));
  }

  void sendText(String text) {
    send(GeminiLiveMessage.text(text));
  }

  void sendToolResponse(List<Map<String, dynamic>> responses) {
    send(GeminiLiveMessage.toolResponse(responses));
  }

  Future<void> disconnect() async {
    await _subscription?.cancel();
    await _channel?.sink.close();
    _isConnected = false;
  }

  bool get isConnected => _isConnected;
}
