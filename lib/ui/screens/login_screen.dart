import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/auth_provider.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});
  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _nameController = TextEditingController();

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authProvider);

    return Scaffold(
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 360),
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Text('KFC Poker',
                    style: TextStyle(fontSize: 32, fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                const Text('Open Face Chinese Poker',
                    style: TextStyle(fontSize: 14, color: Colors.grey)),
                const SizedBox(height: 48),

                // Google 로그인
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: auth.isLoading
                        ? null
                        : () async {
                            final ok = await ref.read(authProvider.notifier).signInWithGoogle();
                            if (ok && mounted) Navigator.pushReplacementNamed(context, '/home');
                          },
                    icon: const Icon(Icons.login),
                    label: const Text('Google로 로그인'),
                    style: ElevatedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 14),
                    ),
                  ),
                ),
                const SizedBox(height: 16),

                // 구분선
                const Row(children: [
                  Expanded(child: Divider()),
                  Padding(
                      padding: EdgeInsets.symmetric(horizontal: 12),
                      child: Text('또는')),
                  Expanded(child: Divider()),
                ]),
                const SizedBox(height: 16),

                // 게스트 입장
                TextField(
                  controller: _nameController,
                  decoration: const InputDecoration(
                    labelText: '닉네임',
                    hintText: '게스트 닉네임 입력',
                    border: OutlineInputBorder(),
                  ),
                  maxLength: 20,
                  onSubmitted: (_) => _guestLogin(),
                ),
                const SizedBox(height: 8),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton(
                    onPressed: auth.isLoading ? null : _guestLogin,
                    child: const Text('게스트로 입장'),
                  ),
                ),

                if (auth.isLoading) ...[
                  const SizedBox(height: 16),
                  const CircularProgressIndicator(),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _guestLogin() async {
    final name = _nameController.text.trim();
    if (name.isEmpty) return;
    final ok = await ref.read(authProvider.notifier).signInAsGuest(name);
    if (ok && mounted) Navigator.pushReplacementNamed(context, '/home');
  }
}
