import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:flutter_svg/flutter_svg.dart';
import '../../services/firebase_service.dart';

class AuthPage extends ConsumerStatefulWidget {
  const AuthPage({super.key});

  @override
  ConsumerState<AuthPage> createState() => _AuthPageState();
}

class _AuthPageState extends ConsumerState<AuthPage> {
  bool _isLoading = false;

  Future<void> _handleLogin() async {
    setState(() => _isLoading = true);
    try {
      final result = await FirebaseService().signInWithGoogle();
      if (result == null) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Login cancelled or failed')),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF050505),
      body: Stack(
        children: [
          // Background Glow
          Positioned.fill(
            child: Container(
              decoration: const BoxDecoration(
                gradient: RadialGradient(
                  center: Alignment.center,
                  radius: 0.8,
                  colors: [
                    Color.fromRGBO(208, 167, 139, 0.05),
                    Colors.transparent,
                  ],
                ),
              ),
            ),
          ),
          
          Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                // Logo
                Hero(
                  tag: 'logo',
                  child: Container(
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(color: const Color(0xFFD0A78B).withOpacity(0.2)),
                      boxShadow: [
                        BoxShadow(
                          color: const Color(0xFFD0A78B).withOpacity(0.1),
                          blurRadius: 40,
                          spreadRadius: 10,
                        ),
                      ],
                    ),
                    child: SvgPicture.asset(
                      'assets/icon-eburon.svg',
                      width: 80,
                      height: 80,
                      colorFilter: const ColorFilter.mode(Color(0xFFD0A78B), BlendMode.srcIn),
                    ),
                  ),
                ).animate().scale(duration: 800.ms, curve: Curves.easeOutBack).fadeIn(),

                const SizedBox(height: 40),
                
                const Text(
                  'BEATRICE',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 32,
                    fontWeight: FontWeight.w200,
                    letterSpacing: 8,
                  ),
                ).animate().fadeIn(delay: 400.ms).moveY(begin: 20, end: 0),

                const SizedBox(height: 10),

                const Text(
                  'EBURON AI ASSISTANT',
                  style: TextStyle(
                    color: Color(0xFFD0A78B),
                    fontSize: 10,
                    fontWeight: FontWeight.bold,
                    letterSpacing: 4,
                  ),
                ).animate().fadeIn(delay: 600.ms),

                const SizedBox(height: 80),

                // Login Button
                if (_isLoading)
                  const CircularProgressIndicator(color: Color(0xFFD0A78B))
                else
                  ElevatedButton.icon(
                    onPressed: _handleLogin,
                    icon: const Icon(LucideIcons.logIn, size: 20),
                    label: const Text('CONTINUE WITH GOOGLE'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.white10,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                        side: BorderSide(color: Colors.white.withOpacity(0.1)),
                      ),
                      elevation: 0,
                    ),
                  ).animate().fadeIn(delay: 800.ms).moveY(begin: 20, end: 0),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
