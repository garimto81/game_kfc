import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../config/app_config.dart';

class AuthService {
  static final AuthService instance = AuthService._();
  AuthService._();

  final _storage = const FlutterSecureStorage();
  String? _jwt;
  Map<String, dynamic>? _user;

  String? get jwt => _jwt;
  Map<String, dynamic>? get user => _user;
  bool get isLoggedIn => _jwt != null;

  Future<void> init() async {
    _jwt = await _storage.read(key: 'jwt');
    final userJson = await _storage.read(key: 'user');
    if (userJson != null) {
      try {
        _user = jsonDecode(userJson);
      } catch (_) {
        _user = null;
      }
    }
  }

  Future<bool> signInWithGoogle() async {
    try {
      final googleUser = await GoogleSignIn().signIn();
      if (googleUser == null) return false;
      final auth = await googleUser.authentication;
      final idToken = auth.idToken;
      if (idToken == null) return false;
      return await _verify('google', idToken);
    } catch (e) {
      debugPrint('[AUTH] Google sign-in error: $e');
      return false;
    }
  }

  Future<bool> signInAsGuest(String name) async {
    return await _verify('guest', 'guest', name: name);
  }

  Future<bool> _verify(String provider, String token, {String? name}) async {
    try {
      final res = await http.post(
        Uri.parse('${AppConfig.apiUrl}/auth/verify'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'provider': provider, 'token': token, 'name': name}),
      );
      if (res.statusCode != 200) return false;
      final body = jsonDecode(res.body);
      _jwt = body['jwt'];
      _user = body['user'];
      await _storage.write(key: 'jwt', value: _jwt);
      await _storage.write(key: 'user', value: jsonEncode(_user));
      return true;
    } catch (e) {
      debugPrint('[AUTH] verify error: $e');
      return false;
    }
  }

  Future<void> signOut() async {
    _jwt = null;
    _user = null;
    await _storage.delete(key: 'jwt');
    await _storage.delete(key: 'user');
  }
}
