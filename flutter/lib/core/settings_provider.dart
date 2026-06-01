import 'package:flutter_riverpod/flutter_riverpod.dart';

class AppSettings {
  final Map<String, bool> whatsapp;
  final Map<String, bool> google;

  AppSettings({
    required this.whatsapp,
    required this.google,
  });

  AppSettings copyWith({
    Map<String, bool>? whatsapp,
    Map<String, bool>? google,
  }) {
    return AppSettings(
      whatsapp: whatsapp ?? this.whatsapp,
      google: google ?? this.google,
    );
  }
}

class SettingsNotifier extends Notifier<AppSettings> {
  @override
  AppSettings build() {
    return AppSettings(
      whatsapp: {
        'view_history': true,
        'phone_calls': true,
        'whatsapp_calls': true,
      },
      google: {
        'gmail': true,
        'calendar': true,
        'tasks': true,
        'drive': true,
        'youtube': true,
      },
    );
  }

  void toggleWhatsApp(String key) {
    final newWa = Map<String, bool>.from(state.whatsapp);
    newWa[key] = !(newWa[key] ?? false);
    state = state.copyWith(whatsapp: newWa);
  }

  void toggleGoogle(String key) {
    final newG = Map<String, bool>.from(state.google);
    newG[key] = !(newG[key] ?? false);
    state = state.copyWith(google: newG);
  }
}

final settingsProvider = NotifierProvider<SettingsNotifier, AppSettings>(SettingsNotifier.new);
