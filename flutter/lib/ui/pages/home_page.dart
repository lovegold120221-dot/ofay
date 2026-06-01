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
      backgroundColor: const Color(0xFF050505),
      body: Stack(
        children: [
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
          
          // Transcription Overlay
          Positioned(
            top: 100,
            left: 20,
            right: 20,
            child: Column(
              children: [
                if (geminiState.modelTranscript.isNotEmpty)
                  Text(
                    geminiState.modelTranscript,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: Colors.white70,
                      fontSize: 18,
                      fontWeight: FontWeight.w300,
                      fontStyle: FontStyle.italic,
                    ),
                  ).animate().fadeIn(),
              ],
            ),
          ),

          // Bottom Controls
          Positioned(
            bottom: 60,
            left: 0,
            right: 0,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                _IconButton(
                  icon: LucideIcons.messageSquare,
                  onPressed: () {},
                ),
                
                // Main Activation Button with Visualizer Bars
                Row(
                  children: [
                    if (geminiState.isConnected)
                      VisualizerBars(volumes: recorderFreqs.take(5).toList(), isLeft: true, maxHeight: 32),
                    
                    const SizedBox(width: 8),
                    
                    GestureDetector(
                      onTap: () {
                        if (geminiState.isConnected) {
                          ref.read(geminiLiveProvider.notifier).stopSession();
                        } else {
                          ref.read(geminiLiveProvider.notifier).startSession();
                        }
                      },
                      child: Container(
                        width: 80,
                        height: 80,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: geminiState.isConnected ? Colors.red.withOpacity(0.1) : Colors.white.withOpacity(0.05),
                          border: Border.all(
                            color: geminiState.isConnected ? Colors.red.withOpacity(0.5) : Colors.white10,
                            width: 1,
                          ),
                        ),
                        child: Center(
                          child: Icon(
                            geminiState.isConnected ? LucideIcons.square : LucideIcons.mic,
                            color: geminiState.isConnected ? Colors.red : Colors.white,
                            size: 32,
                          ),
                        ),
                      ),
                    ).animate(target: geminiState.isConnected ? 1 : 0)
                     .scale(begin: const Offset(1, 1), end: const Offset(1.1, 1.1), duration: 2.seconds, curve: Curves.easeInOut)
                     .then()
                     .scale(begin: const Offset(1.1, 1.1), end: const Offset(1, 1)),
                    
                    const SizedBox(width: 8),
                    
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
          
          // Top Navigation
          Positioned(
            top: 50,
            left: 20,
            right: 20,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                _IconButton(
                  icon: LucideIcons.user,
                  onPressed: () {},
                ),
                const Text(
                  'BEATRICE',
                  style: TextStyle(
                    color: Color(0xFFD0A78B),
                    letterSpacing: 4,
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                  ),
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
