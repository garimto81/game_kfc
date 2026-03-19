import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/settings_provider.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final settings = ref.watch(settingsNotifierProvider);

    return Scaffold(
      backgroundColor: Colors.teal[900],
      appBar: AppBar(
        title: const Text('Settings'),
        backgroundColor: Colors.teal[800],
        foregroundColor: Colors.white,
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _buildSectionHeader('Audio'),
          SwitchListTile(
            title:
                const Text('Sound Effects', style: TextStyle(color: Colors.white)),
            subtitle: Text('Card sounds and notifications',
                style: TextStyle(color: Colors.teal[300])),
            value: settings.soundEnabled,
            onChanged: (_) =>
                ref.read(settingsNotifierProvider.notifier).toggleSound(),
            activeColor: Colors.teal[400],
          ),
          SwitchListTile(
            title: const Text('Haptic Feedback',
                style: TextStyle(color: Colors.white)),
            subtitle: Text('Vibration on card placement',
                style: TextStyle(color: Colors.teal[300])),
            value: settings.hapticEnabled,
            onChanged: (_) =>
                ref.read(settingsNotifierProvider.notifier).toggleHaptic(),
            activeColor: Colors.teal[400],
          ),
          const SizedBox(height: 16),
          _buildSectionHeader('Player'),
          ListTile(
            title: const Text('Player Name',
                style: TextStyle(color: Colors.white)),
            subtitle:
                Text(settings.playerName, style: TextStyle(color: Colors.teal[300])),
            trailing: Icon(Icons.edit, color: Colors.teal[300]),
            onTap: () => _showNameDialog(context, ref, settings.playerName),
          ),
          const SizedBox(height: 16),
          _buildSectionHeader('Appearance'),
          ...['dark', 'green', 'blue'].map((theme) {
            return RadioListTile<String>(
              title: Text(
                theme == 'dark'
                    ? 'Dark (Default)'
                    : theme == 'green'
                        ? 'Green Table'
                        : 'Blue Table',
                style: const TextStyle(color: Colors.white),
              ),
              value: theme,
              groupValue: settings.theme,
              onChanged: (v) =>
                  ref.read(settingsNotifierProvider.notifier).setTheme(v!),
              activeColor: Colors.teal[400],
            );
          }),
          const SizedBox(height: 32),
          Center(
            child: Text(
              'OFC Pineapple v0.1.0',
              style: TextStyle(color: Colors.teal[600], fontSize: 12),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSectionHeader(String title) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8, top: 8),
      child: Text(
        title,
        style: TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.bold,
          color: Colors.teal[300],
          letterSpacing: 1.2,
        ),
      ),
    );
  }

  void _showNameDialog(BuildContext context, WidgetRef ref, String currentName) {
    final controller = TextEditingController(text: currentName);
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: Colors.teal[800],
        title: const Text('Player Name', style: TextStyle(color: Colors.white)),
        content: TextField(
          controller: controller,
          style: const TextStyle(color: Colors.white),
          decoration: InputDecoration(
            hintText: 'Enter your name',
            hintStyle: TextStyle(color: Colors.teal[400]),
            enabledBorder: UnderlineInputBorder(
              borderSide: BorderSide(color: Colors.teal[400]!),
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text('Cancel', style: TextStyle(color: Colors.teal[300])),
          ),
          TextButton(
            onPressed: () {
              if (controller.text.isNotEmpty) {
                ref
                    .read(settingsNotifierProvider.notifier)
                    .setPlayerName(controller.text);
              }
              Navigator.pop(context);
            },
            child: const Text('Save', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }
}
