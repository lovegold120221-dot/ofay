import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'client.dart';
import '../audio/provider.dart';
import '../config.dart';
import '../../services/firebase_service.dart';
import '../../services/supabase_service.dart';
import '../../services/http_service.dart';

final firebaseServiceProvider = Provider((ref) => FirebaseService());
final supabaseServiceProvider = Provider((ref) => SupabaseService());
final httpServiceProvider = Provider((ref) => HttpService());

class ActiveWebsiteUrlNotifier extends Notifier<String?> {
  @override
  String? build() => null;
  
  set url(String? val) => state = val;
}

final activeWebsiteUrlProvider = NotifierProvider<ActiveWebsiteUrlNotifier, String?>(ActiveWebsiteUrlNotifier.new);

class GeminiLiveClientState {
  final bool isConnected;
  final bool isSetupComplete;
  final bool isAgentSpeaking;
  final String userTranscript;
  final String modelTranscript;
  final List<Map<String, String>> history;

  GeminiLiveClientState({
    this.isConnected = false,
    this.isSetupComplete = false,
    this.isAgentSpeaking = false,
    this.userTranscript = '',
    this.modelTranscript = '',
    this.history = const [],
  });

  GeminiLiveClientState copyWith({
    bool? isConnected,
    bool? isSetupComplete,
    bool? isAgentSpeaking,
    String? userTranscript,
    String? modelTranscript,
    List<Map<String, String>>? history,
  }) {
    return GeminiLiveClientState(
      isConnected: isConnected ?? this.isConnected,
      isSetupComplete: isSetupComplete ?? this.isSetupComplete,
      isAgentSpeaking: isAgentSpeaking ?? this.isAgentSpeaking,
      userTranscript: userTranscript ?? this.userTranscript,
      modelTranscript: modelTranscript ?? this.modelTranscript,
      history: history ?? this.history,
    );
  }
}

class GeminiLiveClientNotifier extends Notifier<GeminiLiveClientState> implements GeminiLiveClientDelegate {
  late GeminiLiveClient _client;

  @override
  GeminiLiveClientState build() {
    _client = GeminiLiveClient(
      apiKey: AppConfig.geminiApiKey,
      delegate: this,
    );
    _loadHistory();
    return GeminiLiveClientState();
  }

  Future<void> _loadHistory() async {
    final userId = ref.read(firebaseServiceProvider).currentUser?.uid;
    if (userId == null) return;

    try {
      final supabase = ref.read(supabaseServiceProvider).client;
      final response = await supabase
          .from('messages')
          .select('role, text')
          .eq('user_id', userId)
          .order('created_at', ascending: false)
          .limit(50);

      final List<Map<String, String>> loadedHistory = [];
      for (var m in (response as List).reversed) {
        loadedHistory.add({
          'role': m['role'].toString().toUpperCase(),
          'text': m['text'].toString(),
        });
      }

      state = state.copyWith(history: loadedHistory);
    } catch (e) {
      print('Failed to load history in Flutter: $e');
    }
  }

  Future<void> startSession({
    String voiceName = 'Aoede',
    String? systemInstruction,
    List<Map<String, dynamic>>? tools,
  }) async {
    await ref.read(audioStreamerProvider).start();
    await ref.read(audioRecorderProvider).start();
    await ref.read(ambientAudioProvider).start();
    
    String historyContext = "";
    if (state.history.isNotEmpty) {
      historyContext = "\n\nPREVIOUS CONVERSATION CONTEXT:\n" + 
        state.history.map((m) => "${m['role']}: ${m['text']}").join("\n");
    }

    final String cafeInstruction = "Start naturally like the conversation is already happening at a cafe. Do not introduce yourself. Do not mention your name. Do not offer help. Use a small human beat if it fits, like 'Mm...' or 'Yeah...', then begin with a casual observation, small-talk thought, back-to-reality moment, or light current-topic style comment. Keep it calm and normal. Do not overuse fillers.";

    await _client.connect(
      voiceName: voiceName,
      systemInstruction: (systemInstruction ?? cafeInstruction) + historyContext,
      tools: tools,
    );
    
    state = state.copyWith(isConnected: true);
  }

  Future<void> stopSession() async {
    await _client.disconnect();
    await ref.read(audioRecorderProvider).stop();
    await ref.read(audioStreamerProvider).stop();
    await ref.read(ambientAudioProvider).stop();
    
    // Preserve history but clear transient state
    state = GeminiLiveClientState(history: state.history);
    _loadHistory(); // Refresh from DB
  }

  void sendAudio(String base64) => _client.sendAudio(base64);
  void sendText(String text) {
    _client.sendText(text);
    _saveMessage('user', text);
  }

  Future<void> _saveMessage(String role, String text) async {
    final userId = ref.read(firebaseServiceProvider).currentUser?.uid;
    if (userId == null) return;
    await ref.read(supabaseServiceProvider).saveMessage(userId: userId, role: role, text: text);
  }

  @override
  void onSetupComplete() {
    state = state.copyWith(isSetupComplete: true);
  }

  @override
  void onAudioData(String base64) {
    ref.read(audioStreamerProvider).addPCM16(base64);
    state = state.copyWith(isAgentSpeaking: true);
    
    Future.delayed(const Duration(milliseconds: 400), () {
      if (ref.exists(geminiLiveProvider)) {
        state = state.copyWith(isAgentSpeaking: false);
      }
    });
  }

  @override
  void onTranscript(String text) {
    state = state.copyWith(modelTranscript: text);
  }

  @override
  void onInterrupted() {
    ref.read(audioStreamerProvider).stopWithFade();
    state = state.copyWith(isAgentSpeaking: false);
  }

  @override
  void onTurnComplete() {
    if (state.modelTranscript.isNotEmpty) {
      final text = state.modelTranscript;
      _saveMessage('model', text);
      state = state.copyWith(
        history: [...state.history, {'role': 'MODEL', 'text': text}],
        modelTranscript: '',
      );
    }
  }

  @override
  void onToolCall(List<Map<String, dynamic>> functionCalls) {
    print('Tool Call received: $functionCalls');

    for (var call in functionCalls) {
      if (call['name'] == 'create_website') {
        _handleCreateWebsite(call);
      } else if (call['name'] == 'whatsapp_action') {
        _handleWhatsAppAction(call);
      }
    }

    final responses = functionCalls.map((call) => {
      'id': call['id'],
      'name': call['name'],
      'response': {'result': 'Tool ${call['name']} execution started'}
    }).toList();

    _client.sendToolResponse(responses);
  }

  Future<void> _handleWhatsAppAction(Map<String, dynamic> call) async {
    final args = call['args'];
    final userId = ref.read(firebaseServiceProvider).currentUser?.uid ?? 'anon';

    try {
      await ref.read(httpServiceProvider).post(
        '${AppConfig.backendUrl}/api/whatsapp/tool',
        body: {
          'userId': userId,
          'tool': args['action'],
          'params': args,
          'permissions': {
            'requireUserApproval': true,
            'approvedByUser': true,
            'mode': 'delegated_send'
          },
        },
      );
    } catch (e) {
      print('WhatsApp action error in Flutter: $e');
    }
  }

  Future<void> _handleCreateWebsite(Map<String, dynamic> call) async {
    final args = call['args'];
    final title = args['title'] ?? 'Website';
    final prompt = args['prompt'] ?? '';
    final timestamp = DateTime.now().millisecondsSinceEpoch.toString();
    final userId = ref.read(firebaseServiceProvider).currentUser?.uid ?? 'anon';

    try {
      final response = await ref.read(httpServiceProvider).post(
        '${AppConfig.backendUrl}/api/website/generate',
        body: {
          'userId': userId,
          'title': title,
          'prompt': prompt,
          'timestamp': timestamp,
        },
      );

      if (response['ok'] == true) {
        final url = '${AppConfig.backendUrl}${response['slug']}';
        ref.read(activeWebsiteUrlProvider.notifier).url = url;
      }
    } catch (e) {
      print('Website generation error in Flutter: $e');
    }
  }

  @override
  void onError(dynamic error) {
    print('Gemini Error: $error');
    stopSession();
  }

  @override
  void onDone() {
    stopSession();
  }
}

final geminiLiveProvider = NotifierProvider<GeminiLiveClientNotifier, GeminiLiveClientState>(() {
  return GeminiLiveClientNotifier();
});
