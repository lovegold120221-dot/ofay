class AppConfig {
  static const String geminiApiKey = String.fromEnvironment('GEMINI_API_KEY', defaultValue: 'REPLACE_ME');
  static const String supabaseUrl = 'https://inypxifrayeafrlhkulz.supabase.co';
  static const String supabaseKey = 'sb_publishable_56i_nBVgtiqsK4YebBT7TQ_oUVY3oYT';
  static const String backendUrl = String.fromEnvironment('BACKEND_URL', defaultValue: 'http://localhost:4200');

  static const Map<String, String> firebaseConfig = {
    'apiKey': 'AIzaSyCiPY9UZUpoZsy2AReHkb-HDB0FtxYd_T0',
    'authDomain': 'eburon-ai-beatrice.firebaseapp.com',
    'databaseURL': 'https://eburon-ai-beatrice-default-rtdb.firebaseio.com',
    'projectId': 'eburon-ai-beatrice',
    'storageBucket': 'eburon-ai-beatrice.firebasestorage.app',
    'messagingSenderId': '874569824011',
    'appId': '1:874569824011:web:b5ec70e6e2adced9b0140e',
  };
}
