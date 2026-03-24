import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'providers/settings_provider.dart';
import 'ui/screens/home_screen.dart';

void main() {
  runApp(const ProviderScope(child: OFCApp()));
}

class OFCApp extends ConsumerWidget {
  const OFCApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final settings = ref.watch(settingsNotifierProvider);
    final seedColor = switch (settings.theme) {
      'green' => Colors.green,
      'blue' => Colors.blue,
      _ => Colors.teal,
    };

    return MaterialApp(
      title: 'OFC Pineapple',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: seedColor,
          brightness: Brightness.dark,
        ),
        useMaterial3: true,
      ),
      home: const HomeScreen(),
    );
  }
}
