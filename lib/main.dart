import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'providers/settings_provider.dart';
import 'ui/screens/home_screen.dart';
import 'ui/screens/login_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  // Semantics 트리 강제 활성화 — CanvasKit에서도 flt-semantics DOM 요소 생성
  SemanticsBinding.instance.ensureSemantics();

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
      initialRoute: '/',
      routes: {
        '/': (context) => const LoginScreen(),
        '/home': (context) => const HomeScreen(),
      },
    );
  }
}
