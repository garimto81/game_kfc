import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:ofc_pineapple/main.dart';

void main() {
  testWidgets('OFCApp smoke test - HomeScreen 렌더링', (WidgetTester tester) async {
    await tester.pumpWidget(const ProviderScope(child: OFCApp()));
    await tester.pump();
    expect(find.text('OFC Pineapple'), findsOneWidget);
  });
}
