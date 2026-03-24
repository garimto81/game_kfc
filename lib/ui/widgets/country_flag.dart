import 'package:flutter/material.dart';

/// Displays a country flag emoji from ISO 3166-1 alpha-2 code.
/// Uses regional indicator symbols to render flag emoji.
class CountryFlag extends StatelessWidget {
  final String countryCode;
  final double size;

  const CountryFlag({
    super.key,
    required this.countryCode,
    this.size = 16,
  });

  String _countryCodeToEmoji(String code) {
    if (code.length != 2) return '';
    final upper = code.toUpperCase();
    final first = 0x1F1E6 + upper.codeUnitAt(0) - 0x41;
    final second = 0x1F1E6 + upper.codeUnitAt(1) - 0x41;
    return String.fromCharCodes([first, second]);
  }

  @override
  Widget build(BuildContext context) {
    return Text(
      _countryCodeToEmoji(countryCode),
      style: TextStyle(fontSize: size),
    );
  }
}

/// Common country codes for the flag picker.
const List<({String code, String name})> kCountries = [
  (code: 'KR', name: 'Korea'),
  (code: 'US', name: 'USA'),
  (code: 'JP', name: 'Japan'),
  (code: 'CN', name: 'China'),
  (code: 'GB', name: 'UK'),
  (code: 'DE', name: 'Germany'),
  (code: 'FR', name: 'France'),
  (code: 'BR', name: 'Brazil'),
  (code: 'RU', name: 'Russia'),
  (code: 'CA', name: 'Canada'),
  (code: 'AU', name: 'Australia'),
  (code: 'IN', name: 'India'),
  (code: 'VN', name: 'Vietnam'),
  (code: 'TH', name: 'Thailand'),
  (code: 'PH', name: 'Philippines'),
  (code: 'ID', name: 'Indonesia'),
  (code: 'MY', name: 'Malaysia'),
  (code: 'SG', name: 'Singapore'),
  (code: 'TW', name: 'Taiwan'),
  (code: 'HK', name: 'Hong Kong'),
];
