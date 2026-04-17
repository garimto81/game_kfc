// Flutter Web 전용 visibility API 리스너.
// BUG-24: 모바일 브라우저 tab switch 시 AppLifecycleState가 fire 안 됨 →
// document.visibilitychange 이벤트로 tab 복귀 감지.

import 'dart:html' as html;

void listenVisibility(void Function(bool visible) onChange) {
  html.document.onVisibilityChange.listen((_) {
    final visible = html.document.visibilityState == 'visible';
    onChange(visible);
  });
}
