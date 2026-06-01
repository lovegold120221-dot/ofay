import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:intl/intl.dart';
import '../../core/gemini/provider.dart';
import '../../core/config.dart';
import '../../services/http_service.dart';

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
    if (!mounted) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final userId = ref.read(firebaseServiceProvider).currentUser?.uid;
      if (userId == null) throw Exception('Not authenticated');

      final response = await ref.read(httpServiceProvider).post(
        '${AppConfig.backendUrl}/api/whatsapp/tool',
        body: {
          'userId': userId,
          'tool': 'readChats',
          'params': {'limit': 50},
        },
      );
      
      if (response['ok'] == true) {
        setState(() {
          _chats = response['chats'] as List;
          _loading = false;
        });
      } else {
        throw Exception(response['error'] ?? 'Failed to load chats');
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e.toString();
          _loading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _search.isEmpty 
      ? _chats 
      : _chats.where((c) => (c['name'] ?? '').toString().toLowerCase().contains(_search.toLowerCase())).toList();

    return Scaffold(
      backgroundColor: const Color(0xFF0B141A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF202C33),
        elevation: 1,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'WhatsApp',
              style: TextStyle(color: Color(0xFFE9EDEF), fontWeight: FontWeight.bold, fontSize: 18),
            ),
            if (!_loading && _chats.isNotEmpty)
              Text(
                '${_chats.length} conversations',
                style: const TextStyle(color: Color(0xFF00A884), fontSize: 11, fontWeight: FontWeight.bold),
              ),
          ],
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
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            child: Container(
              height: 42,
              decoration: BoxDecoration(
                color: const Color(0xFF202C33),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  const SizedBox(width: 14),
                  const Icon(LucideIcons.search, color: Color(0xFF8696A0), size: 16),
                  const SizedBox(width: 14),
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
                ? _renderError()
                : filtered.isEmpty
                  ? _renderEmpty()
                  : ListView.separated(
                      itemCount: filtered.length,
                      separatorBuilder: (context, index) => const Divider(height: 1, color: Colors.white10, indent: 80),
                      itemBuilder: (context, index) {
                        final chat = filtered[index];
                        return _ChatTile(
                          chat: chat,
                          onTap: () => _openChat(chat),
                        );
                      },
                    ),
          ),
        ],
      ),
    );
  }

  Widget _renderError() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(LucideIcons.alertCircle, color: Colors.redAccent, size: 48),
            const SizedBox(height: 16),
            Text(
              _error!,
              textAlign: TextAlign.center,
              style: const TextStyle(color: Color(0xFF8696A0), fontSize: 14),
            ),
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: _loadChats,
              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF00A884)),
              child: const Text('RETRY', style: TextStyle(color: Colors.black, fontWeight: FontWeight.bold)),
            ),
          ],
        ),
      ),
    );
  }

  Widget _renderEmpty() {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(LucideIcons.messageSquare, color: const Color(0xFF8696A0).withOpacity(0.2), size: 64),
          const SizedBox(height: 16),
          const Text(
            'No conversations found',
            style: TextStyle(color: Color(0xFF8696A0), fontSize: 16, fontWeight: FontWeight.w500),
          ),
        ],
      ),
    );
  }

  void _openChat(dynamic chat) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => WhatsAppThreadPage(chatId: chat['id'], name: chat['name'] ?? chat['id']),
      ),
    );
  }
}

class _ChatTile extends StatelessWidget {
  final dynamic chat;
  final VoidCallback onTap;

  const _ChatTile({required this.chat, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final String name = chat['name'] ?? chat['id'];
    final int unread = chat['unreadCount'] ?? 0;
    final String time = _formatTime(chat['timestamp']);

    return ListTile(
      onTap: onTap,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      leading: CircleAvatar(
        radius: 26,
        backgroundColor: const Color(0xFF202C33),
        child: Text(
          name.isNotEmpty ? name[0].toUpperCase() : '?',
          style: const TextStyle(color: Color(0xFF8696A0), fontWeight: FontWeight.bold, fontSize: 20),
        ),
      ),
      title: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Expanded(
            child: Text(
              name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(color: Color(0xFFE9EDEF), fontWeight: FontWeight.bold, fontSize: 16),
            ),
          ),
          Text(
            time,
            style: TextStyle(
              color: unread > 0 ? const Color(0xFF00A884) : const Color(0xFF8696A0),
              fontSize: 12,
            ),
          ),
        ],
      ),
      subtitle: Padding(
        padding: const EdgeInsets.only(top: 4),
        child: Row(
          children: [
            if (chat['isGroup'] == true)
              const Icon(LucideIcons.users, size: 14, color: Color(0xFF8696A0)),
            if (chat['isGroup'] == true) const SizedBox(width: 4),
            Expanded(
              child: Text(
                chat['lastMessage'] ?? '',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(color: Color(0xFF8696A0), fontSize: 13),
              ),
            ),
            if (unread > 0)
              Container(
                padding: const EdgeInsets.all(6),
                decoration: const BoxDecoration(color: Color(0xFF00A884), shape: BoxShape.circle),
                child: Text(
                  unread.toString(),
                  style: const TextStyle(color: Color(0xFF0B141A), fontSize: 10, fontWeight: FontWeight.bold),
                ),
              ),
          ],
        ),
      ),
    );
  }

  String _formatTime(dynamic ts) {
    if (ts == null) return '';
    final date = DateTime.fromMillisecondsSinceEpoch(ts is int ? ts : int.parse(ts.toString()));
    final now = DateTime.now();
    if (date.day == now.day && date.month == now.month && date.year == now.year) {
      return DateFormat('HH:mm').format(date);
    }
    return DateFormat('dd/MM/yy').format(date);
  }
}

class WhatsAppThreadPage extends ConsumerStatefulWidget {
  final String chatId;
  final String name;

  const WhatsAppThreadPage({super.key, required this.chatId, required this.name});

  @override
  ConsumerState<WhatsAppThreadPage> createState() => _WhatsAppThreadPageState();
}

class _WhatsAppThreadPageState extends ConsumerState<WhatsAppThreadPage> {
  bool _loading = false;
  List<dynamic> _messages = [];
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadMessages();
  }

  Future<void> _loadMessages() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final userId = ref.read(firebaseServiceProvider).currentUser?.uid;
      if (userId == null) throw Exception('Not authenticated');

      final response = await ref.read(httpServiceProvider).post(
        '${AppConfig.backendUrl}/api/whatsapp/tool',
        body: {
          'userId': userId,
          'tool': 'getMessageHistory',
          'params': {'chatId': widget.chatId, 'limit': 100},
        },
      );
      
      if (response['ok'] == true) {
        setState(() {
          _messages = (response['messages'] as List).reversed.toList();
          _loading = false;
        });
      } else {
        throw Exception(response['error'] ?? 'Failed to load messages');
      }
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
        leadingWidth: 80,
        leading: Row(
          children: [
            IconButton(
              icon: const Icon(LucideIcons.arrowLeft, color: Color(0xFF8696A0), size: 20),
              onPressed: () => Navigator.pop(context),
            ),
            CircleAvatar(
              radius: 16,
              backgroundColor: const Color(0xFF00A884).withOpacity(0.1),
              child: Text(widget.name[0].toUpperCase(), style: const TextStyle(fontSize: 12, color: Color(0xFF00A884))),
            ),
          ],
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              widget.name,
              style: const TextStyle(color: Color(0xFFE9EDEF), fontSize: 16, fontWeight: FontWeight.bold),
            ),
            const Text(
              'online',
              style: TextStyle(color: Color(0xFF00A884), fontSize: 10, fontWeight: FontWeight.bold),
            ),
          ],
        ),
      ),
      body: Stack(
        children: [
          // Pattern Background
          Positioned.fill(
            child: Opacity(
              opacity: 0.05,
              child: Image.network(
                'https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png',
                repeat: ImageRepeat.repeat,
              ),
            ),
          ),
          
          _loading 
            ? const Center(child: CircularProgressIndicator(color: Color(0xFF00A884)))
            : ListView.builder(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 20),
                itemCount: _messages.length,
                itemBuilder: (context, index) {
                  final msg = _messages[index];
                  final bool isMe = msg['fromMe'] == true;
                  return _MessageBubble(
                    text: msg['body'],
                    isMe: isMe,
                    timestamp: msg['timestamp'],
                  );
                },
              ),
        ],
      ),
      bottomNavigationBar: Container(
        padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom + 10, left: 10, right: 10, top: 10),
        color: const Color(0xFF202C33),
        child: Row(
          children: [
            Expanded(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                decoration: BoxDecoration(
                  color: const Color(0xFF2B3942),
                  borderRadius: BorderRadius.circular(24),
                ),
                child: const TextField(
                  readOnly: true,
                  style: TextStyle(color: Colors.white, fontSize: 15),
                  decoration: InputDecoration(
                    hintText: 'Use Beatrice to reply via voice',
                    hintStyle: TextStyle(color: Color(0xFF8696A0), fontSize: 14),
                    border: InputBorder.none,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: const BoxDecoration(color: Color(0xFF00A884), shape: BoxShape.circle),
              child: const Icon(LucideIcons.mic, color: Color(0xFF0B141A), size: 20),
            ),
          ],
        ),
      ),
    );
  }
}

class _MessageBubble extends StatelessWidget {
  final String text;
  final bool isMe;
  final dynamic timestamp;

  const _MessageBubble({required this.text, required this.isMe, required this.timestamp});

  @override
  Widget build(BuildContext context) {
    final date = DateTime.fromMillisecondsSinceEpoch(timestamp is int ? timestamp : int.parse(timestamp.toString()));
    final time = DateFormat('HH:mm').format(date);

    return Align(
      alignment: isMe ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 2),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.75),
        decoration: BoxDecoration(
          color: isMe ? const Color(0xFF005C4B) : const Color(0xFF202C33),
          borderRadius: BorderRadius.circular(12).copyWith(
            topRight: isMe ? Radius.zero : const Radius.circular(12),
            topLeft: !isMe ? Radius.zero : const Radius.circular(12),
          ),
          boxShadow: [
            BoxShadow(color: Colors.black.withOpacity(0.1), blurRadius: 1, offset: const Offset(0, 1))
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(
              text,
              style: const TextStyle(color: Color(0xFFE9EDEF), fontSize: 14.5, height: 1.4),
            ),
            const SizedBox(height: 4),
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  time,
                  style: const TextStyle(color: Color(0x80FFFFFF), fontSize: 10),
                ),
                if (isMe) const SizedBox(width: 4),
                if (isMe) const Icon(LucideIcons.checkCheck, size: 14, color: Color(0xFF53BDEB)),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
