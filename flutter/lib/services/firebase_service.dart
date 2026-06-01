import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:google_sign_in/google_sign_in.dart';
import '../core/config.dart';

class FirebaseService {
  static final FirebaseService _instance = FirebaseService._internal();
  factory FirebaseService() => _instance;
  FirebaseService._internal();

  final FirebaseAuth _auth = FirebaseAuth.instance;
  
  // Try using the standard constructor
  final GoogleSignIn _googleSignIn = GoogleSignIn(
    scopes: [
      'email',
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/tasks',
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/contacts',
    ],
  );

  Future<void> init() async {
    await Firebase.initializeApp(
      options: FirebaseOptions(
        apiKey: AppConfig.firebaseConfig['apiKey']!,
        appId: AppConfig.firebaseConfig['appId']!,
        messagingSenderId: AppConfig.firebaseConfig['messagingSenderId']!,
        projectId: AppConfig.firebaseConfig['projectId']!,
        authDomain: AppConfig.firebaseConfig['authDomain'],
        databaseURL: AppConfig.firebaseConfig['databaseURL'],
        storageBucket: AppConfig.firebaseConfig['storageBucket'],
      ),
    );
  }

  Future<UserCredential?> signInWithGoogle() async {
    try {
      final GoogleSignInAccount? googleUser = await _googleSignIn.signIn();
      if (googleUser == null) return null;

      final GoogleSignInAuthentication googleAuth = await googleUser.authentication;
      final AuthCredential credential = GoogleAuthProvider.credential(
        accessToken: googleAuth.accessToken,
        idToken: googleAuth.idToken,
      );

      return await _auth.signInWithCredential(credential);
    } catch (e) {
      print('Firebase Google Sign-In Error: $e');
      return null;
    }
  }

  Future<void> signOut() async {
    await _googleSignIn.signOut();
    await _auth.signOut();
  }

  User? get currentUser => _auth.currentUser;
  Stream<User?> get authStateChanges => _auth.authStateChanges();
  
  Future<String?> getGoogleAccessToken() async {
    final googleUser = await _googleSignIn.signInSilently();
    if (googleUser == null) return null;
    final googleAuth = await googleUser.authentication;
    return googleAuth.accessToken;
  }
}
