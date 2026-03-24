import 'package:flutter/material.dart';

class TableTheme {
  final String id;
  final String name;
  final String assetPath;
  final Color accentColor;
  final Color textColor;
  final Color slotColor;
  final Color slotBorderColor;

  const TableTheme({
    required this.id,
    required this.name,
    required this.assetPath,
    required this.accentColor,
    this.textColor = Colors.white,
    required this.slotColor,
    required this.slotBorderColor,
  });
}

class TableThemes {
  static const List<TableTheme> all = [
    TableTheme(
      id: 'black',
      name: 'Dark',
      assetPath: 'assets/themes/SettingPage_ColoredBG_Black.png',
      accentColor: Color(0xFF424242),
      slotColor: Color(0xFF303030),
      slotBorderColor: Color(0xFF616161),
    ),
    TableTheme(
      id: 'green',
      name: 'Classic',
      assetPath: 'assets/themes/SettingPage_ColoredBG_Green.png',
      accentColor: Color(0xFF2E7D32),
      slotColor: Color(0xFF1B5E20),
      slotBorderColor: Color(0xFF4CAF50),
    ),
    TableTheme(
      id: 'navy',
      name: 'Navy',
      assetPath: 'assets/themes/SettingPage_ColoredBG_Navy.png',
      accentColor: Color(0xFF1565C0),
      slotColor: Color(0xFF0D47A1),
      slotBorderColor: Color(0xFF42A5F5),
    ),
    TableTheme(
      id: 'brown',
      name: 'Wood',
      assetPath: 'assets/themes/SettingPage_ColoredBG_Brown.png',
      accentColor: Color(0xFF5D4037),
      slotColor: Color(0xFF3E2723),
      slotBorderColor: Color(0xFF8D6E63),
    ),
    TableTheme(
      id: 'purple',
      name: 'Royal',
      assetPath: 'assets/themes/SettingPage_ColoredBG_Purple.png',
      accentColor: Color(0xFF6A1B9A),
      slotColor: Color(0xFF4A148C),
      slotBorderColor: Color(0xFFAB47BC),
    ),
    TableTheme(
      id: 'red',
      name: 'Red',
      assetPath: 'assets/themes/SettingPage_ColoredBG_Red.png',
      accentColor: Color(0xFFC62828),
      slotColor: Color(0xFF8E0000),
      slotBorderColor: Color(0xFFEF5350),
    ),
    TableTheme(
      id: 'cobalt',
      name: 'Cobalt',
      assetPath: 'assets/themes/SettingPage_ColoredBG_Cobalt.png',
      accentColor: Color(0xFF0277BD),
      slotColor: Color(0xFF01579B),
      slotBorderColor: Color(0xFF29B6F6),
    ),
    TableTheme(
      id: 'gray',
      name: 'Silver',
      assetPath: 'assets/themes/SettingPage_ColoredBG_Gray.png',
      accentColor: Color(0xFF616161),
      slotColor: Color(0xFF424242),
      slotBorderColor: Color(0xFF9E9E9E),
    ),
    TableTheme(
      id: 'ocean',
      name: 'Ocean',
      assetPath: 'assets/themes/SettingPage_Theme_Ocean.png',
      accentColor: Color(0xFF006064),
      slotColor: Color(0xFF004D40),
      slotBorderColor: Color(0xFF26A69A),
    ),
    TableTheme(
      id: 'neotokyo',
      name: 'Neon',
      assetPath: 'assets/themes/SettingPage_Theme_NeoTokyo.png',
      accentColor: Color(0xFFE040FB),
      textColor: Color(0xFF00E5FF),
      slotColor: Color(0xFF1A0033),
      slotBorderColor: Color(0xFFE040FB),
    ),
    TableTheme(
      id: 'spring',
      name: 'Spring',
      assetPath: 'assets/themes/SettingPage_Theme_SpringBlossom.png',
      accentColor: Color(0xFFF48FB1),
      slotColor: Color(0xFF880E4F),
      slotBorderColor: Color(0xFFF48FB1),
    ),
    TableTheme(
      id: 'desert',
      name: 'Desert',
      assetPath: 'assets/themes/SettingPage_Theme_Desert.png',
      accentColor: Color(0xFFFF8F00),
      slotColor: Color(0xFF8D6E63),
      slotBorderColor: Color(0xFFFFB74D),
    ),
    TableTheme(
      id: 'frozen',
      name: 'Frozen',
      assetPath: 'assets/themes/SettingPage_Theme_Frozen.png',
      accentColor: Color(0xFF4FC3F7),
      slotColor: Color(0xFF263238),
      slotBorderColor: Color(0xFF81D4FA),
    ),
  ];

  static TableTheme getById(String id) {
    return all.firstWhere(
      (t) => t.id == id,
      orElse: () => all.first,
    );
  }
}
