import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/auth_service.dart';

final authProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  return AuthNotifier();
});

class AuthState {
  final bool isLoggedIn;
  final String? userName;
  final String? provider;
  final bool isLoading;

  const AuthState({
    this.isLoggedIn = false,
    this.userName,
    this.provider,
    this.isLoading = false,
  });

  AuthState copyWith({bool? isLoggedIn, String? userName, String? provider, bool? isLoading}) {
    return AuthState(
      isLoggedIn: isLoggedIn ?? this.isLoggedIn,
      userName: userName ?? this.userName,
      provider: provider ?? this.provider,
      isLoading: isLoading ?? this.isLoading,
    );
  }
}

class AuthNotifier extends StateNotifier<AuthState> {
  AuthNotifier() : super(const AuthState());

  Future<void> init() async {
    await AuthService.instance.init();
    if (AuthService.instance.isLoggedIn) {
      final user = AuthService.instance.user;
      state = AuthState(
        isLoggedIn: true,
        userName: user?['name'],
        provider: user?['provider'],
      );
    }
  }

  Future<bool> signInWithGoogle() async {
    state = state.copyWith(isLoading: true);
    final ok = await AuthService.instance.signInWithGoogle();
    if (ok) {
      final user = AuthService.instance.user;
      state = AuthState(isLoggedIn: true, userName: user?['name'], provider: user?['provider']);
    } else {
      state = state.copyWith(isLoading: false);
    }
    return ok;
  }

  Future<bool> signInAsGuest(String name) async {
    state = state.copyWith(isLoading: true);
    final ok = await AuthService.instance.signInAsGuest(name);
    if (ok) {
      state = AuthState(isLoggedIn: true, userName: name, provider: 'guest');
    } else {
      state = state.copyWith(isLoading: false);
    }
    return ok;
  }

  Future<void> signOut() async {
    await AuthService.instance.signOut();
    state = const AuthState();
  }
}
