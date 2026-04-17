// 비-웹 플랫폼용 no-op stub. 모바일 네이티브에서는 AppLifecycleState로 충분.
// _visibility_web.dart와 조건부 import로 연결됨.

void listenVisibility(void Function(bool visible) onChange) {
  // no-op: native 플랫폼에서는 Flutter AppLifecycleState가 처리
}
