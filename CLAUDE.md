# CLAUDE.md - Game KFC Pro

## Build

코드 수정 후 반드시 재빌드를 실행한다.

```bash
# Freezed/Riverpod 코드 생성 (모델/프로바이더 변경 시)
dart run build_runner build --delete-conflicting-outputs

# Flutter 웹 빌드
flutter build web
```

## 재빌드 트리거 조건

아래 파일이 수정되면 반드시 `build_runner`를 실행한다:
- `*.freezed.dart` 소스 (`lib/models/`)
- `*.g.dart` 소스 (`lib/providers/`)
- `@freezed`, `@riverpod` 어노테이션이 포함된 모든 `.dart` 파일
