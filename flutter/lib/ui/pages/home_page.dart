import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../../core/gemini/provider.dart';
import '../../core/audio/provider.dart';
import '../widgets/cloud_visualizer.dart';
import '../widgets/visualizer_bars.dart';
import 'settings_page.dart';
import 'website_viewer_page.dart';
import 'whatsapp_chats_page.dart';

class HomePage extends ConsumerWidget {
  const HomePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final geminiState = ref.watch(geminiLiveProvider);
    final recorderFreqs = ref.watch(recorderFrequenciesProvider);
    
    // Listen for website generation
    ref.listen(activeWebsiteUrlProvider, (previous, next) {
      if (next != null) {
        Navigator.push(
          context,
          MaterialPageRoute(builder: (context) => WebsiteViewerPage(url: next)),
        );
        // Reset provider so it doesn't trigger again on back
        ref.read(activeWebsiteUrlProvider.notifier).url = null;
      }
    });

    // Calculate average and peak for visualizer
    final avg = recorderFreqs.reduce((a, b) => a + b) / recorderFreqs.length;
    final peak = recorderFreqs.isNotEmpty ? recorderFreqs.reduce((a, b) => a > b ? a : b) : 0.0;

    return Scaffold(
      backgroundColor: const Color(0xFF0B141A),
      body: Column(
        children: [
          // Top Navigation (Sticky)
          Container(
            padding: const EdgeInsets.fromLTRB(20, 50, 20, 15),
            color: const Color(0xFF202C33),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                _IconButton(
                  icon: LucideIcons.menu,
                  onPressed: () {},
                ),
                const Column(
                  children: [
                    Text(
                      'BEATRICE',
                      style: TextStyle(
                        color: Color(0xFFE9EDEF),
                        letterSpacing: 2,
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    Text(
                      'online',
                      style: TextStyle(
                        color: Color(0xFF00A884),
                        fontSize: 10,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 1.5,
                      ),
                    ),
                  ],
                ),
                _IconButton(
                  icon: LucideIcons.settings,
                  onPressed: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(builder: (context) => const SettingsPage()),
                    );
                  },
                ),
              ],
            ),
          ),

          // Scrollable Content Area
          Expanded(
            child: Stack(
              children: [
                // WhatsApp Pattern-like Background (Subtle)
                Positioned.fill(
                  child: Opacity(
                    opacity: 0.05,
                    child: Image.network(
                      'https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png',
                      repeat: ImageRepeat.repeat,
                    ),
                  ),
                ),

                // The Cloud Visualizer
                Center(
                  child: SizedBox(
                    width: 300,
                    height: 300,
                    child: CloudVisualizer(
                      avg: avg,
                      peak: peak,
                      isActive: geminiState.isConnected,
                    ),
                  ),
                ),
                
                // Transcription Overlay (WhatsApp Bubbles)
                Positioned(
                  bottom: 40,
                  left: 20,
                  right: 20,
                  child: Column(
                    children: [
                      if (geminiState.modelTranscript.isNotEmpty)
                        Align(
                          alignment: Alignment.centerLeft,
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                            decoration: BoxDecoration(
                              color: const Color(0xFF202C33),
                              borderRadius: BorderRadius.circular(16).copyWith(topLeft: Radius.zero),
                            ),
                            child: Text(
                              geminiState.modelTranscript,
                              style: const TextStyle(color: Color(0xFFE9EDEF), fontSize: 16),
                            ),
                          ).animate().fadeIn().moveY(begin: 10, end: 0),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),

          // Bottom Controls (Sticky)
          Container(
            height: 100,
            padding: const EdgeInsets.only(bottom: 20),
            decoration: const BoxDecoration(
              color: Color(0xFF202C33),
              border: Border(top: BorderSide(color: Colors.black26)),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                _IconButton(
                  icon: LucideIcons.messageCircle,
                  onPressed: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(builder: (context) => const WhatsAppChatsPage()),
                    );
                  },
                ),
                
                // Main Activation Button with Visualizer Bars
                Row(
                  children: [
                    if (geminiState.isConnected)
                      VisualizerBars(volumes: recorderFreqs.take(5).toList(), isLeft: true, maxHeight: 32),
                    
                    const SizedBox(width: 12),
                    
                    GestureDetector(
                      onTap: () {
                        if (geminiState.isConnected) {
                          ref.read(geminiLiveProvider.notifier).stopSession();
                        } else {
                          ref.read(geminiLiveProvider.notifier).startSession();
                        }
                      },
                      child: Container(
                        width: 68,
                        height: 68,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: const Color(0xFF00A884),
                          boxShadow: [
                            BoxShadow(
                              color: const Color(0xFF00A884).withOpacity(0.3),
                              blurRadius: 15,
                              spreadRadius: 2,
                            )
                          ],
                        ),
                        child: Center(
                          child: Icon(
                            geminiState.isConnected ? LucideIcons.square : LucideIcons.mic,
                            color: const Color(0xFF0B141A),
                            size: 28,
                          ),
                        ),
                      ),
                    ).animate(target: geminiState.isConnected ? 1 : 0)
                     .scale(begin: const Offset(1, 1), end: const Offset(1.1, 1.1), duration: 1.seconds, curve: Curves.easeInOut),
                    
                    const SizedBox(width: 12),
                    
                    if (geminiState.isConnected)
                      VisualizerBars(volumes: recorderFreqs.skip(5).take(5).toList(), maxHeight: 32),
                  ],
                ),

                _IconButton(
                  icon: LucideIcons.video,
                  onPressed: () {},
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _IconButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback onPressed;

  const _IconButton({required this.icon, required this.onPressed});

  @override
  Widget build(BuildContext context) {
    return IconButton(
      icon: Icon(icon, color: Colors.white54, size: 24),
      onPressed: onPressed,
      style: IconButton.styleFrom(
        backgroundColor: Colors.white.withOpacity(0.03),
        padding: const EdgeInsets.all(12),
      ),
    );
  }
}
