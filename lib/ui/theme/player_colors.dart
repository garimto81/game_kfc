import 'package:flutter/material.dart';

class PlayerColorScheme {
  final Color primary;
  final Color background;
  final Color border;

  const PlayerColorScheme({
    required this.primary,
    required this.background,
    required this.border,
  });
}

class PlayerColors {
  static const palette = [
    PlayerColorScheme(
      primary: Color(0xFF26A69A),       // teal
      background: Color(0xFF00695C),    // dark teal
      border: Color(0xFF80CBC4),        // light teal
    ),
    PlayerColorScheme(
      primary: Color(0xFFFF9800),       // orange
      background: Color(0xFFE65100),    // dark orange
      border: Color(0xFFFFCC80),        // light orange
    ),
    PlayerColorScheme(
      primary: Color(0xFFAB47BC),       // purple
      background: Color(0xFF6A1B9A),    // dark purple
      border: Color(0xFFCE93D8),        // light purple
    ),
    PlayerColorScheme(
      primary: Color(0xFFEF5350),       // red
      background: Color(0xFFB71C1C),    // dark red
      border: Color(0xFFEF9A9A),        // light red
    ),
  ];

  static PlayerColorScheme forSeat(int index) => palette[index % palette.length];
}
