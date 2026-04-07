# Backlog

## PENDING

### [B-002] 이펙트가 호출되지 않거나 계획된 이펙트로 호출되지 않는 문제
- **날짜**: 2026-04-04
- **설명**: 이펙트 SET 명령은 실행되지만 실제 시각 효과가 의도대로 출력되지 않음. 가능한 원인:
  1. LineSlotWidget의 `didUpdateWidget`이 celebLevel 전환을 감지 못하는 경우
  2. `celebLevel` 조건부 전달 (`!isFoul && !isImpact && i < cards.length`)이 0을 강제하는 경우
  3. CelebrationOverlay가 celebLevel >= 2에서만 추가 (L1은 파티클 없음)
  4. 애니메이션 controller 생명주기 문제 (dispose 후 재사용 시도)
- **수락 기준**:
  - [ ] L1: 카드별 glow + bounce가 800ms 동안 표시
  - [ ] L2: 카드별 glow + bounce + CelebrationOverlay 링+스파클 표시
  - [ ] L3: L2 + 스크린 셰이크 + 사운드 재생
  - [ ] Impact: amber glow + slam(2x→0.85→1.0) + 1200ms 표시
  - [ ] 이펙트 완료 후 카드 깜빡임 없이 정상 복귀
  - [ ] 콘솔에서 [EFFECT] set → buildLine → render 로그 체인 확인
- **관련 PRD**: docs/00-prd/prd-effect-system.prd.md

## IN_PROGRESS

### [B-001] 이펙트 미출력 — clearAll 타이밍 레이스 + setCelebration 리빌드 누락
- **날짜**: 2026-04-03
- **설명**: Celebration 이펙트가 화면에 표시되지 않는 반복 장애. 근본 원인 2개:
  1. `clearAll()`이 핸드 전환 시 애니메이션 완료 전 celebration을 즉시 삭제 (서버 round-trip 50-200ms < 애니메이션 800-1500ms)
  2. `setCelebration()`이 `onStateChanged`를 호출하지 않아 리빌드 누락 가능
- **수락 기준**:
  - [ ] celebration이 최소 표시 시간(L1=800ms, L2=1200ms, L3=1500ms) 동안 유지됨
  - [ ] 핸드 전환 시 진행 중인 celebration이 끊기지 않음
  - [ ] setCelebration 호출 즉시 위젯 리빌드 트리거
  - [ ] 단위 테스트 전체 통과
- **관련 PRD**: docs/00-prd/prd-effect-system.prd.md

## DONE

| ID | 제목 | 완료일 | 관련 커밋 |
|----|------|--------|----------|
