import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'services/firebase_service.dart';
import 'services/supabase_service.dart';
import 'ui/pages/home_page.dart';
import 'ui/pages/auth_page.dart';

void main() {
  // Ensure Flutter is ready
  WidgetsFlutterBinding.ensureInitialized();
  
  runApp(
    const ProviderScope(
      child: BeatriceApp(),
    ),
  );
}

class BeatriceApp extends ConsumerStatefulWidget {
  const BeatriceApp({super.key});

  @override
  ConsumerState<BeatriceApp> createState() => _BeatriceAppState();
}

class _BeatriceAppState extends ConsumerState<BeatriceApp> {
  bool _isInitialized = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _initServices();
  }

  Future<void> _initServices() async {
    try {
      // Initialize Firebase
      await FirebaseService().init();
      
      // Initialize Supabase
      await SupabaseService().init();
      
      if (mounted) {
        setState(() {
          _isInitialized = true;
        });
      }
    } catch (e) {
      debugPrint('Initialization Error: $e');
      if (mounted) {
        setState(() {
          _error = e.toString();
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_error != null) {
      return MaterialApp(
        home: Scaffold(
          backgroundColor: Colors.black,
          body: Center(
            child: Padding(
              padding: const EdgeInsets.all(24.0),
              child: Text(
                'Initialization Failed:\n$_error',
                style: const TextStyle(color: Colors.red, fontSize: 12, fontFamily: 'monospace'),
                textAlign: TextAlign.center,
              ),
            ),
          ),
        ),
      );
    }

    if (!_isInitialized) {
      return const MaterialApp(
        debugShowCheckedModeBanner: false,
        home: Scaffold(
          backgroundColor: Color(0xFF050505),
          body: Center(
            child: CircularProgressIndicator(color: Color(0xFFD0A78B)),
          ),
        ),
      );
    }

    return MaterialApp(
      title: 'Beatrice - Eburon AI',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        primaryColor: const Color(0xFFD0A78B),
        scaffoldBackgroundColor: const Color(0xFF050505),
        useMaterial3: true,
      ),
      home: StreamBuilder(
        stream: FirebaseService().authStateChanges,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Scaffold(
              body: Center(child: CircularProgressIndicator(color: Color(0xFFD0A78B))),
            );
          }
          
          if (snapshot.hasData) {
            return const HomePage();
          }
          
          return const AuthPage();
        },
      ),
    );
  }
}
