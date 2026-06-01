import 'package:supabase_flutter/supabase_flutter.dart';
import '../core/config.dart';

class SupabaseService {
  static final SupabaseService _instance = SupabaseService._internal();
  factory SupabaseService() => _instance;
  SupabaseService._internal();

  Future<void> init() async {
    await Supabase.initialize(
      url: AppConfig.supabaseUrl,
      anonKey: AppConfig.supabaseKey,
    );
  }

  SupabaseClient get client => Supabase.instance.client;

  Future<String?> saveToolResult({
    required String userId,
    required String toolName,
    required dynamic content,
    required String fileType,
  }) async {
    try {
      final response = await client.from('tool_outputs').insert({
        'user_id': userId,
        'tool_name': toolName,
        'content': content is String ? content : content.toString(),
        'file_type': fileType,
      }).select('id').single();

      return response['id'].toString();
    } catch (e) {
      print('Supabase saveToolResult Error: $e');
      return null;
    }
  }

  Future<void> saveMessage({
    required String userId,
    required String role,
    required String text,
    String? sessionId = 'default',
  }) async {
    try {
      await client.from('messages').insert({
        'user_id': userId,
        'role': role,
        'text': text,
        'session_id': sessionId,
      });
    } catch (e) {
      print('Supabase saveMessage Error: $e');
    }
  }
}
