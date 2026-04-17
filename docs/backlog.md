# Backlog

## PENDING

_없음_

## IN_PROGRESS

_없음_

## DONE

| ID | 제목 | 완료일 | 관련 커밋 | 근거 |
|----|------|--------|-----------|------|
| B-001 | 이펙트 미출력 — clearAll 타이밍 레이스 + setCelebration 리빌드 누락 | 2026-04-12 | `87933c7`, `eafcdef`, `35f9fd0` | effect-system v2.0 BUG A/B/C 해결 확인. `setCelebration` 직후 사운드 재생 및 `BoardWidget`의 effective board 전달로 상태 전이 해결. |
| B-002 | 이펙트가 호출되지 않거나 계획된 이펙트로 호출되지 않는 문제 | 2026-04-12 | `87933c7`, `35f9fd0`, `060a77d` | `_checkFoulAnimation` + `_getExcitedCards` 연동 확인. celebLevel 전달·애니메이션 생명주기 모두 prd-effect-system.prd.md v2.0 `후속 작업` 이관됨 (QA 재검증 필요). |

## 진행 규칙

- **신규 요구사항**: PENDING 섹션에 `[B-NNN]` 추가
- **작업 시작**: IN_PROGRESS로 이동
- **완료**: DONE 테이블로 이동 + 관련 커밋 SHA + 근거 1줄
- **PRD 연계**: `관련 PRD` 필드 필수. PRD 없으면 `/prd-update --new` 먼저
- **수락 기준**: 체크박스 체크 후 DONE 이동
