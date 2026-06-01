import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

class WebsiteViewerPage extends StatefulWidget {
  final String url;

  const WebsiteViewerPage({super.key, required this.url});

  @override
  State<WebsiteViewerPage> createState() => _WebsiteViewerPageState();
}

class _WebsiteViewerPageState extends State<WebsiteViewerPage> {
  late final WebViewController _controller;
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageFinished: (_) => setState(() => _isLoading = false),
        ),
      )
      ..loadRequest(Uri.parse(widget.url));
  }

  void _handleCopy() {
    Clipboard.setData(ClipboardData(text: widget.url));
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Link copied to clipboard')),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black87,
        elevation: 0,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'WEB ARCHITECT',
              style: TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 2),
            ),
            Text(
              widget.url,
              style: const TextStyle(color: Colors.white30, fontSize: 8),
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(LucideIcons.clipboard, size: 18, color: Colors.white70),
            onPressed: _handleCopy,
          ),
          IconButton(
            icon: const Icon(LucideIcons.externalLink, size: 18, color: Colors.white70),
            onPressed: () => launchUrl(Uri.parse(widget.url)),
          ),
          IconButton(
            icon: const Icon(LucideIcons.x, size: 18, color: Colors.white70),
            onPressed: () => Navigator.pop(context),
          ),
        ],
      ),
      body: Stack(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
            child: Container(
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(40),
                border: Border.all(color: const Color(0xFF1A1A1A), width: 8),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.5),
                    blurRadius: 30,
                    spreadRadius: 10,
                  ),
                ],
              ),
              clipBehavior: Clip.antiAlias,
              child: WebViewWidget(controller: _controller),
            ),
          ),
          if (_isLoading)
            const Center(
              child: CircularProgressIndicator(color: Color(0xFFD0A78B)),
            ),
        ],
      ),
    );
  }
}
