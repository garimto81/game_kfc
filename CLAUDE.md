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

## QA 결과 보고 규칙

QA 결과를 보고할 때 **반드시** 아래 문서 링크를 첨부한다:

| 문서 | 경로 | 내용 |
|------|------|------|
| QA 체크리스트 리포트 | `docs/04-report/qa-report-{날짜}-{시간}.md` | 전체 PASS/FAIL 요약 + 체크리스트 + 소요 시간 |
| 핸드별 상세 결과 | `docs/04-report/qa-hands-detail-{날짜}-{시간}.md` | 100핸드 카드/점수/로열티 상세 + 테스트별 시간 |
| QA 자동화 PRD | `docs/00-prd/prd-qa-automation.prd.md` | 7-Level QA 계층 + 불변식 12개 정의 |
| ML 성능 추이 | `data/stats/performance-history.json` | 모델 버전별 성능 시계열 |
| 모델 레지스트리 | `data/models/registry.json` | 모델 버전 + 학습 조건 + 벤치마크 |

**리포트 생성 명령:**
```bash
node server/test/generate-qa-report.js    # 체크리스트 리포트
node server/test/detailed-qa-test.js      # 핸드별 상세 + ML fine-tune
node server/test/model-evaluator.js       # 모델 평가 + 추이 기록
```
