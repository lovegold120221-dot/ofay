import 'dart:convert';

class GeminiLiveMessage {
  final Map<String, dynamic> data;
  GeminiLiveMessage(this.data);

  String toJson() => jsonEncode(data);

  factory GeminiLiveMessage.setup({
    required String model,
    required String voiceName,
    String? systemInstruction,
    List<Map<String, dynamic>>? tools,
  }) {
    return GeminiLiveMessage({
      'setup': {
        'model': model,
        'generationConfig': {
          'responseModalities': ['audio'],
          'speechConfig': {
            'voiceConfig': {
              'prebuiltVoiceConfig': {
                'voiceName': voiceName,
              }
            }
          },
          if (systemInstruction != null)
            'systemInstruction': {
              'parts': [
                {'text': systemInstruction}
              ]
            },
          if (tools != null) 'tools': tools,
        }
      }
    });
  }

  factory GeminiLiveMessage.audio(String base64Audio) {
    return GeminiLiveMessage({
      'realtimeInput': {
        'mediaChunks': [
          {
            'mimeType': 'audio/pcm;rate=16000',
            'data': base64Audio,
          }
        ]
      }
    });
  }

  factory GeminiLiveMessage.text(String text) {
    return GeminiLiveMessage({
      'realtimeInput': {
        'mediaChunks': [
          {
            'mimeType': 'text/plain',
            'data': base64Encode(utf8.encode(text)),
          }
        ]
      }
    });
  }

  factory GeminiLiveMessage.toolResponse(List<Map<String, dynamic>> functionResponses) {
    return GeminiLiveMessage({
      'toolResponse': {
        'functionResponses': functionResponses,
      }
    });
  }
}

class GeminiServerMessage {
  final Map<String, dynamic> raw;

  GeminiServerMessage(this.raw);

  bool get isSetupComplete => raw.containsKey('setupComplete');
  
  Map<String, dynamic>? get serverContent => raw['serverContent'];
  
  bool get interrupted => serverContent?['interrupted'] == true;
  
  List<Map<String, dynamic>>? get modelTurnParts => serverContent?['modelTurn']?['parts'];
  
  Map<String, dynamic>? get toolCall => raw['toolCall'];
  
  List<Map<String, dynamic>>? get functionCalls => toolCall?['functionCalls'];

  String? get audioData {
    final parts = modelTurnParts;
    if (parts == null) return null;
    for (var part in parts) {
      if (part.containsKey('inlineData')) {
        return part['inlineData']['data'];
      }
    }
    return null;
  }

  String? get transcript {
    final parts = modelTurnParts;
    if (parts == null) return null;
    String text = '';
    for (var part in parts) {
      if (part.containsKey('text')) {
        text += part['text'];
      }
    }
    return text.isEmpty ? null : text;
  }

  bool get turnComplete => raw.containsKey('serverContent') && raw['serverContent'].containsKey('turnComplete');
}
