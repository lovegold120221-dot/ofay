import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../../core/audio/provider.dart';
import '../../core/settings_provider.dart';

class SettingsPage extends ConsumerWidget {
  const SettingsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ambientVolume = ref.watch(ambientVolumeProvider);
    final settings = ref.watch(settingsProvider);

    return Scaffold(
      backgroundColor: const Color(0xFF050505),
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        centerTitle: true,
        title: const Text(
          'AGENT SETTINGS',
          style: TextStyle(
            color: Color(0xFFD0A78B),
            letterSpacing: 4,
            fontSize: 12,
            fontWeight: FontWeight.bold,
          ),
        ),
        leading: IconButton(
          icon: const Icon(LucideIcons.chevronLeft, color: Colors.white54),
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
        children: [
          // Audio Section
          _SectionHeader(title: 'Audio Performance'),
          const SizedBox(height: 12),
          _SettingsContainer(
            children: [
              _VolumeSlider(
                label: 'Ambient Background',
                value: ambientVolume,
                onChanged: (val) => ref.read(ambientVolumeProvider.notifier).set(val),
              ),
            ],
          ),
          
          const SizedBox(height: 32),
          
          // WhatsApp Section
          _SectionHeader(title: 'WhatsApp Integration'),
          const SizedBox(height: 12),
          _SettingsContainer(
            children: [
              _SettingTile(
                icon: LucideIcons.clock,
                title: 'View Message History',
                subtitle: 'Read past conversation logs',
                value: settings.whatsapp['view_history'] ?? false,
                onChanged: (_) => ref.read(settingsProvider.notifier).toggleWhatsApp('view_history'),
              ),
              _Divider(),
              _SettingTile(
                icon: LucideIcons.phone,
                title: 'Make Phone Calls',
                subtitle: 'Dial contacts via native dialer',
                value: settings.whatsapp['phone_calls'] ?? false,
                onChanged: (_) => ref.read(settingsProvider.notifier).toggleWhatsApp('phone_calls'),
              ),
              _Divider(),
              _SettingTile(
                icon: LucideIcons.video,
                title: 'WhatsApp Calls',
                subtitle: 'Initiate WhatsApp calls',
                value: settings.whatsapp['whatsapp_calls'] ?? false,
                onChanged: (_) => ref.read(settingsProvider.notifier).toggleWhatsApp('whatsapp_calls'),
              ),
            ],
          ),

          const SizedBox(height: 40),
          _SectionHeader(title: 'Skills & Capabilities'),
          const SizedBox(height: 24),
          
          // Google Services Section
          _SubHeader(title: 'Google Services'),
          const SizedBox(height: 12),
          _SettingsContainer(
            children: [
              _ServiceTile(
                icon: LucideIcons.mail,
                title: 'Gmail',
                subtitle: 'Read and send emails',
                isActive: settings.google['gmail'] ?? false,
                onTap: () => ref.read(settingsProvider.notifier).toggleGoogle('gmail'),
              ),
              _Divider(),
              _ServiceTile(
                icon: LucideIcons.calendar,
                title: 'Calendar',
                subtitle: 'View events and schedules',
                isActive: settings.google['calendar'] ?? false,
                onTap: () => ref.read(settingsProvider.notifier).toggleGoogle('calendar'),
              ),
              _Divider(),
              _ServiceTile(
                icon: LucideIcons.checkSquare,
                title: 'Tasks',
                subtitle: 'Manage to-do lists',
                isActive: settings.google['tasks'] ?? false,
                onTap: () => ref.read(settingsProvider.notifier).toggleGoogle('tasks'),
              ),
              _Divider(),
              _ServiceTile(
                icon: LucideIcons.hardDrive,
                title: 'Drive',
                subtitle: 'List and search files',
                isActive: settings.google['drive'] ?? false,
                onTap: () => ref.read(settingsProvider.notifier).toggleGoogle('drive'),
              ),
              _Divider(),
              _ServiceTile(
                icon: LucideIcons.youtube,
                title: 'YouTube',
                subtitle: 'Search and discover videos',
                isActive: settings.google['youtube'] ?? false,
                onTap: () => ref.read(settingsProvider.notifier).toggleGoogle('youtube'),
              ),
            ],
          ),
          
          const SizedBox(height: 60),
        ],
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  final String title;
  const _SectionHeader({required this.title});

  @override
  Widget build(BuildContext context) {
    return Text(
      title.toUpperCase(),
      style: const TextStyle(
        color: Colors.white24,
        fontSize: 10,
        fontWeight: FontWeight.bold,
        letterSpacing: 2,
      ),
    );
  }
}

class _SubHeader extends StatelessWidget {
  final String title;
  const _SubHeader({required this.title});

  @override
  Widget build(BuildContext context) {
    return Text(
      title.toUpperCase(),
      style: const TextStyle(
        color: Colors.white12,
        fontSize: 9,
        fontWeight: FontWeight.w900,
        letterSpacing: 1.5,
      ),
    );
  }
}

class _SettingsContainer extends StatelessWidget {
  final List<Widget> children;
  const _SettingsContainer({required this.children});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF0D0D0D),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: Colors.white.withOpacity(0.04)),
      ),
      child: Column(children: children),
    );
  }
}

class _SettingTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final bool value;
  final ValueChanged<bool> onChanged;

  const _SettingTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.value,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(20),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(color: Colors.white.withOpacity(0.05)),
              color: Colors.white.withOpacity(0.02),
            ),
            child: Icon(icon, color: Colors.white38, size: 18),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  style: const TextStyle(color: Colors.white24, fontSize: 11),
                ),
              ],
            ),
          ),
          Switch(
            value: value,
            onChanged: onChanged,
            activeColor: const Color(0xFFD0A78B),
            activeTrackColor: const Color(0xFFD0A78B).withOpacity(0.3),
            inactiveThumbColor: Colors.white24,
            inactiveTrackColor: Colors.white.withOpacity(0.05),
          ),
        ],
      ),
    );
  }
}

class _ServiceTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final bool isActive;
  final VoidCallback onTap;

  const _ServiceTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.isActive,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(24),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: Colors.white.withOpacity(0.05)),
                color: Colors.white.withOpacity(0.02),
              ),
              child: Icon(icon, color: Colors.white38, size: 18),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    style: const TextStyle(color: Colors.white24, fontSize: 11),
                  ),
                ],
              ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: isActive ? Colors.white.withOpacity(0.05) : Colors.transparent,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: isActive ? Colors.white.withOpacity(0.1) : Colors.white10),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 6,
                    height: 6,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: isActive ? const Color(0xFF4CAF50) : Colors.white10,
                    ),
                  ),
                  const SizedBox(width: 6),
                  Text(
                    isActive ? 'ON' : 'OFF',
                    style: TextStyle(
                      color: isActive ? Colors.white : Colors.white24,
                      fontSize: 9,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _VolumeSlider extends StatelessWidget {
  final String label;
  final double value;
  final ValueChanged<double> onChanged;

  const _VolumeSlider({required this.label, required this.value, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(label, style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w600)),
              Text('${(value * 100).round()}%', style: const TextStyle(color: Color(0xFFD0A78B), fontSize: 14, fontWeight: FontWeight.bold)),
            ],
          ),
          SliderTheme(
            data: SliderTheme.of(context).copyWith(
              activeTrackColor: const Color(0xFFD0A78B),
              inactiveTrackColor: Colors.white.withOpacity(0.05),
              thumbColor: const Color(0xFFD0A78B),
              overlayColor: const Color(0xFFD0A78B).withOpacity(0.1),
              trackHeight: 2,
            ),
            child: Slider(
              value: value,
              min: 0,
              max: 0.5,
              onChanged: onChanged,
            ),
          ),
        ],
      ),
    );
  }
}

class _Divider extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Divider(height: 1, color: Colors.white.withOpacity(0.03), indent: 70);
  }
}
