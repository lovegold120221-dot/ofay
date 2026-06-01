import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../../core/gemini/provider.dart';
import '../../services/supabase_service.dart';

class WhatsAppChatsPage extends ConsumerStatefulWidget {
  const WhatsAppChatsPage({super.key});

  @override
  ConsumerState<WhatsAppChatsPage> createState() => _WhatsAppChatsPageState();
}

class _WhatsAppChatsPageState extends ConsumerState<WhatsAppChatsPage> {
  bool _loading = false;
  List<dynamic> _chats = [];
  String? _error;
  String _search = '';

  @override
  void initState() {
    super.initState();
    _loadChats();
  }

  Future<void> _loadChats() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final userId = ref.read(firebaseServiceProvider).currentUser?.uid;
      if (userId == null) throw Exception('Not authenticated');

      final supabase = ref.read(supabaseServiceProvider).client;
      // In a real scenario, we'd fetch this from the WhatsApp backend
      // For now, let's assume we fetch from messages table or a dedicated chats view
      final response = await supabase
          .from('messages')
          .select('id, text, created_at, role')
          .eq('user_id', userId)
          .order('created_at', ascending: false)
          .limit(10);
      
      setState(() {
        _chats = response as List;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0B141A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF202C33),
        elevation: 1,
        title: const Text(
          'WhatsApp',
          style: TextStyle(color: Color(0xFFE9EDEF), fontWeight: FontWeight.bold),
        ),
        leading: IconButton(
          icon: const Icon(LucideIcons.arrowLeft, color: Color(0xFF8696A0)),
          onPressed: () => Navigator.pop(context),
        ),
        actions: [
          IconButton(
            icon: Icon(LucideIcons.refreshCw, color: const Color(0xFF8696A0), size: 20),
            onPressed: _loadChats,
          ),
        ],
      ),
      body: Column(
        children: [
          // Search Bar
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: Container(
              height: 40,
              decoration: BoxDecoration(
                color: const Color(0xFF202C33),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Row(
                children: [
                  const SizedBox(width: 12),
                  const Icon(LucideIcons.search, color: Color(0xFF8696A0), size: 16),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextField(
                      onChanged: (val) => setState(() => _search = val),
                      style: const TextStyle(color: Color(0xFFE9EDEF), fontSize: 14),
                      decoration: const InputDecoration(
                        hintText: 'Search chats',
                        hintStyle: TextStyle(color: Color(0xFF8696A0), fontSize: 14),
                        border: InputBorder.none,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          
          Expanded(
            child: _loading 
              ? const Center(child: CircularProgressIndicator(color: Color(0xFF00A884)))
              : _error != null 
                ? Center(child: Text(_error!, style: const TextStyle(color: Colors.red)))
                : _chats.isEmpty
                  ? const Center(child: Text('No conversations found', style: TextStyle(color: Color(0xFF8696A0))))
                  : ListView.separated(
                      itemCount: _chats.length,
                      separatorBuilder: (context, index) => const Divider(height: 1, color: Colors.white10, indent: 70),
                      itemBuilder: (context, index) {
                        final chat = _chats[index];
                        return ListTile(
                          onTap: () {
                            // Open thread view
                          },
                          leading: CircleAvatar(
                            backgroundColor: const Color(0xFF00A884).withOpacity(0.1),
                            child: const Icon(LucideIcons.user, color: Color(0xFF00A884)),
                          ),
                          title: Text(
                            chat['role'] == 'user' ? 'Me' : 'Beatrice',
                            style: const TextStyle(color: Color(0xFFE9EDEF), fontWeight: FontWeight.bold),
                          ),
                          subtitle: Text(
                            chat['text'],
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(color: Color(0xFF8696A0), fontSize: 13),
                          ),
                          trailing: const Text(
                            'Just now',
                            style: TextStyle(color: Color(0xFF8696A0), fontSize: 11),
                          ),
                        );
                      },
                    ),
          ),
        ],
      ),
    );
  }
}
