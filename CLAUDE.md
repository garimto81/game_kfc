# CLAUDE.md - Game KFC Pro

## Build

코드 수정 후 반드시 재빌드를 실행한다.

```bash
# Freezed/Riverpod 코드 생성 (모델/프로바이더 변경 시)
dart run build_runner build --delete-conflicting-outputs

# Flutter 웹 빌드
flutter build web
```

## 서버 배포 (Docker)

이 프로젝트는 Docker 기반으로 실행된다. 코드 수정 후 반드시 이미지를 리빌드해야 반영된다.

```bash
# 서버 코드 수정 시 (server/ 하위)
docker-compose up -d --build game-server

# 웹 클라이언트 수정 시 (flutter build web 후)
docker-compose up -d --build web

# 전체 리빌드
docker-compose up -d --build

# 서버 로그 확인
docker-compose logs game-server --tail 50 -f
```

> **주의**: `docker-compose restart`는 이미지를 리빌드하지 않는다. 반드시 `--build` 옵션 사용.

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

## PRD 규칙 (2026-04-17 도입)

이 프로젝트는 **PRD-first** 정책을 엄격히 따른다. `/check --all` 감사(2026-04-17)에서 PRD 공백이 CRITICAL 보안 이슈로 이어진 선례가 있음.

### PRD 매핑 테이블

| 도메인 | PRD |
|--------|-----|
| 게임 규칙 (OFC Pineapple) | `docs/00-prd/prd-game-rules.prd.md` |
| 실시간 프로토콜 (REST + WS) | `docs/00-prd/prd-realtime-protocol.prd.md` |
| 인증·세션·보안 | `docs/00-prd/prd-auth-security.prd.md` |
| UX 화면 흐름 | `docs/00-prd/prd-ux-flow.prd.md` |
| 이펙트 시스템 | `docs/00-prd/prd-effect-system.prd.md` |
| QA 자동화 | `docs/00-prd/prd-qa-automation.prd.md` |
| 배포/인프라 | `docs/00-prd/prd-deployment.prd.md` |
| ML 자동 학습 | `docs/00-prd/prd-ml-autolearn.prd.md` |

### 필수 규칙

1. **구현 전 PRD 확인 의무**: 신규 기능·변경·버그 수정은 위 테이블에서 관련 PRD 먼저 탐색. 범위 외면 stub PRD(`/prd-update --new`) 작성 후 진행.
2. **커밋 메시지 인용**: feat/fix 커밋은 가능하면 관련 PRD 섹션 인용 — `feat: X (prd-game-rules#Fantasyland)` 형식.
3. **Changelog 갱신 의무**: 기능 변경 PR은 대상 PRD의 `## Changelog` 테이블에 엔트리 1줄 추가. 변경 유형(MARKET/PRODUCT/TECH), 결정 근거 필수.
4. **DoD + 범위 외 필수**: 모든 신규 PRD는 `## DoD`, `## 범위 외` 섹션 포함.
5. **Drift 방지**: PRD Changelog의 최근 엔트리가 30일 초과하면 해당 도메인 PR 전에 Changelog 점검 먼저.
6. **backlog 연동**: `docs/backlog.md`의 각 항목은 `관련 PRD` 필드 필수.

### PRD 전략 문서

- `docs/01-plan/prd-reinforcement-strategy.md` — 전체 8개 PRD 커버리지·Gap 매트릭스·Stage 로드맵 (2026-04-17 작성)
