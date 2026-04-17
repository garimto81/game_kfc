# ML 자동 학습 PRD

**작성일**: 2026-04-17
**버전**: v0.1 (skeleton)
**상태**: Draft — 기존 `prd-qa-automation`에서 ML 섹션 분리
**근거 커밋**: `8ef96d2`, `e4bcada`, `7ce3fd4`, `0ebba78`, `657daae`
**관련 문서**: `docs/01-plan/prd-reinforcement-strategy.md` §D5, `docs/00-prd/prd-qa-automation.prd.md`

---

## 개요

- **목적**: Smart Bot AI 모델의 자동 학습 → 평가 → 배포 파이프라인을 독립 시스템으로 공식화한다. 기존 QA 자동화와 결합된 **Detect → Fix → Learn** 루프를 재현·추적 가능한 형태로 관리한다.
- **배경**: `prd-qa-automation`에 흩어져 있던 ML 관련 내용(학습 데이터 수집, Fine-tune, ONNX 변환, 평가)이 QA 범위를 넘어선 독립 도메인으로 성장함 (`prd-reinforcement-strategy.md` §D5). QA PRD는 검증 체계에 집중하고, 본 PRD는 모델 라이프사이클을 소유한다.
- **범위**: 학습 데이터 스키마 / 모델 학습 / 레지스트리 / 평가 / 배포 / 롤백 / 모니터링.

## 파이프라인 개요

### Detect → Fix → Learn 루프 (커밋 `7ce3fd4`)

```
  QA 실행 (detailed-qa-test.js)
        │
        ├── Detect: 포울/오판/저점수 핸드 감지
        │
        ├── Fix: 로직 수정 (사람 또는 /auto)
        │
        └── Learn: QA 데이터로 자동 Fine-tune
                │
                ▼
        PyTorch model.pt 업데이트
                │
                ▼
        ONNX export (latest.onnx)
                │
                ▼
        다음 QA는 개선된 모델로 실행
```

### 전체 데이터 흐름

```
[smart-bot.js]  ──로그──▶  [training-logger]  ──jsonl──▶  [data/training/latest.jsonl]
                                                                       │
                                                                       ▼
[ml/train.py] ◀───────────────────────────────────────────── (QA 트리거)
      │
      ├── model.pt (PyTorch)
      │
      └── ml/export_onnx.py ──▶ [data/models/latest.onnx]
                                        │
                                        ▼
                           [model-evaluator.js]  ──▶  [registry.json]
                                        │                  [performance-history.json]
                                        ▼
                              benchmark vs baseline
                                        │
                              ┌─────────┴──────────┐
                              ▼                    ▼
                       (pass) 배포           (fail) 롤백
```

## 학습 데이터 수집

- **포맷**: JSONL. 각 라인은 한 결정(placement + discard)의 feature 벡터·action index·reward.
- **생성 스크립트**:
  - `server/test/generate-training.js` — smart-bot으로 N핸드 시뮬레이션해 JSONL 생성 (기본 10,000핸드). 커밋 `8ef96d2`.
  - `server/game/training-logger.js` — QA 실행 중 실시간 수집 (`detailed-qa-test.js` 통합, 커밋 `7ce3fd4`).
- **수집 트리거**:
  - QA 테스트 실행 시마다 자동 (`detailed-qa-test.js` L560~)
  - 수동: `node server/test/generate-training.js --hands 10000`
- **데이터 스키마** (실측 근거: `server/game/training-logger.js` L44~132):
  ```json
  {
    "gameId": "string",
    "handNumber": "integer (>= 1)",
    "round": "integer (1..5)",
    "playerId": "string",
    "timestamp": "integer (epoch ms)",
    "state": {
      "board": {
        "top": "Card[] (max 3)",
        "mid": "Card[] (max 5)",
        "bottom": "Card[] (max 5)"
      },
      "hand": "Card[] (max 14)",
      "dead_cards": "Card[]",
      "remaining_deck_size": "integer (0..52)",
      "current_royalty": {
        "top": "number",
        "mid": "number",
        "bottom": "number"
      },
      "is_fantasyland": "boolean",
      "round": "integer (1..5)",
      "hand_number": "integer"
    },
    "action": {
      "placements": [
        {
          "card": { "rank": "integer (2..14)", "suit": "integer (1..4)" },
          "line": "string ('top'|'mid'|'bottom')"
        }
      ],
      "discard": { "rank": "integer (2..14)", "suit": "integer (1..4)" } 
    },
    "evaluation": {
      "score_function": "number",
      "foul_risk": "number (0..1)",
      "fl_probability": "number (0..1)"
    },
    "result": {
      "final_score": "number",
      "royalties": { "top": "number", "mid": "number", "bottom": "number", "total": "number" },
      "fouled": "boolean",
      "fantasyland_entry": "boolean",
      "opponent_scores": "number[]"
    }
  }
  ```
  **필드 설명**:
  - `gameId`, `handNumber`: 결정 그룹핑 키 (동일 핸드의 여러 decision 연결)
  - `round`: 1 (초기 5장 배치) ~ 5 (3장 중 2장 배치 + 1장 버림)
  - `state.board`: 현재까지 배치된 카드. `top`≤3, `mid`≤5, `bottom`≤5
  - `state.hand`: 현재 손에 든 카드. 일반 라운드 3장, Fantasyland 최대 14장
  - `state.dead_cards`: 버려졌거나 상대 보드에 보이는 공개 카드
  - `action.placements`: 이번 결정에서 각 카드를 어느 라인에 배치했는지
  - `action.discard`: 버린 카드 (round 2~5에서 필수, round 1은 `null`)
  - `evaluation`: smart-bot이 해당 결정 시점에 계산한 내부 점수·리스크
  - `result`: 핸드 종료 후 소급 채워짐 (`logHandResult()`). fine-tune 시 reward로 사용
  - `Card`: `{ rank: 2..14 (J=11,Q=12,K=13,A=14), suit: 1..4 (1=club,2=diamond,3=heart,4=spade) }`
- **action 인코딩** (학습용 변환, `generate-training.js` L74~82): line(top=0, mid=1, bottom=2)을 3진법으로 인코딩하여 단일 `action_index` 생성 (최대 5장). 학습 파이프라인 (`ml/dataset.py`)이 위 JSONL을 읽어 `{features, action_index, reward}` 형태로 변환
- **Feature 벡터 명세** (실측 근거: `server/game/feature-extractor.js` L22~73):
  - **총 차원**: `62` (고정)
  - **함수 시그니처**: `extractFeatures(board, hand, round, deadCards) → number[62]`
  - **구성**:
    ```
    인덱스 [0..25]   : Board cards (13 slots × 2)
                      - top  3슬롯 × (rank/14, suit/4)   → 6 features
                      - mid  5슬롯 × (rank/14, suit/4)   → 10 features
                      - bot  5슬롯 × (rank/14, suit/4)   → 10 features
                      빈 슬롯 = [0, 0]
    인덱스 [26..53]  : Hand cards (14 slots × 2)
                      - 각 슬롯 × (rank/14, suit/4)      → 28 features
                      Fantasyland 최대 14장, 일반은 앞쪽 1~3만 사용
    인덱스 [54..56]  : 라인 채움 비율
                      - top.length / 3
                      - mid.length / 5
                      - bottom.length / 5
    인덱스 [57]      : round / 5
    인덱스 [58..61]  : Dead card 수트별 카운트 / 13
                      - [club, diamond, heart, spade]
    ```
  - **정규화 규칙**:
    - `rank`: 2..14 → `rank/14` (A=14 → 1.0, 2 → 0.143)
    - `suit`: 1..4 → `suit/4` (1=club → 0.25, 4=spade → 1.0)
    - 빈 슬롯은 `[0, 0]` 패딩
  - **입력 조건**:
    - `board`: `{ top: Card[], mid: Card[], bottom: Card[] }` 구조. 누락 라인은 `[]` 또는 `undefined` 허용
    - `hand`: `Card[]` 또는 `undefined`
    - `round`: `1..5` 정수 또는 `undefined` (→ 0)
    - `deadCards`: `Card[]` 또는 `undefined`. suit `1..4` 범위 밖은 카운트 제외
- **저장 위치**: `data/training/latest.jsonl` + `data/training/training-{timestamp}.jsonl`
- **실측**: 학습 데이터 149,990건 (registry v1 기준)

## 모델 학습

- **프레임워크**: PyTorch (커밋 `e4bcada`)
- **학습 스크립트**: `ml/train.py`
- **주요 파일**:
  - `ml/model.py` — 모델 아키텍처 정의
  - `ml/dataset.py` — JSONL → PyTorch Dataset
  - `ml/train.py` — 학습 루프 (Fine-tune 지원: `--pretrained model.pt`)
  - `ml/export_onnx.py` — PyTorch → ONNX 변환
  - `ml/requirements.txt` — 의존성
- **Fine-tuning 흐름** (`detailed-qa-test.js` L567~600):
  1. 기존 `model.pt` 존재 여부 확인
  2. 있으면 `--pretrained model.pt`로 warm-start, 없으면 from-scratch
  3. `python ml/train.py --data latest.jsonl --pretrained model.pt --epochs 20 --output model.pt`
  4. 성공 시 `ml/export_onnx.py`로 `data/models/latest.onnx` 업데이트
- **하이퍼파라미터**:
  - epochs: 20 (QA 트리거 fine-tune) / 50 (v1 초기 학습)
  - timeout: 300초 (train) / 60초 (ONNX export)
  - 배치 사이즈, learning rate, optimizer: `TODO: ml/train.py 상세 확인`
- **실측 성능** (registry v1):
  - val_loss: 103.82
  - direction_acc: 62.05%

## 모델 레지스트리 (`data/models/registry.json`)

- **파일 경로**: `data/models/registry.json`
- **스키마** (실측 근거: `data/models/registry.json`):
  ```json
  {
    "versions": [
      {
        "version": "string (required, unique — 예: 'v0-smart-bot', 'v1', 'v{timestamp}')",
        "file": "string|null (required — ONNX 파일명, heuristic은 null)",
        "created": "string (required, ISO 8601 datetime)",
        "type": "string (required, enum: 'heuristic'|'ml')",
        "training": {
          "epochs": "integer (>= 1)",
          "data_size": "integer (학습 샘플 수)",
          "val_loss": "number (검증 손실)",
          "direction_acc": "number (0..100, 방향 정확도 %)"
        },
        "benchmark": {
          "opponent": "string (비교 대상 봇 이름)",
          "hands": "integer (평가 핸드 수)",
          "foul_rate": "number (0..100, %)",
          "avg_royalty": "number",
          "fl_entry": "number (Fantasyland 진입률 %)",
          "avg_score": "number",
          "win_rate_vs_simple": "number (0..100, %)",
          "date": "string (YYYY-MM-DD)"
        }
      }
    ],
    "latest": "string (required — versions[].version 중 하나)",
    "baseline": "string (required — versions[].version 중 하나)"
  }
  ```
  **필드 설명**:
  - `versions`: 모든 등록 모델의 이력. 시간순 append-only
  - `version`: 고유 ID. `v0-smart-bot`(휴리스틱), `v1`,`v2`,...(ML 순차), `v{timestamp}`(자동 fine-tune)
  - `file`: `data/models/` 하위 ONNX 파일명. heuristic은 `null` (smart-bot.js 코드 실행)
  - `type`: `heuristic` = 규칙 기반 봇 / `ml` = PyTorch→ONNX 변환 모델
  - `training`: ML 모델만 존재. heuristic은 `null`
  - `benchmark`: `model-evaluator.js` 실행 결과. 미평가 시 `null`
  - `latest`: 현재 서버/클라이언트 추론에 사용되는 버전
  - `baseline`: 롤백 기준점. 통상 `v0-smart-bot` 고정
- **버전 명명 규칙**:
  - `v0-smart-bot` — 휴리스틱 베이스라인 (smart-bot.js 1222줄)
  - `v1`, `v2`, ... — ML 모델 순차 번호
  - `v{timestamp}` — 자동 생성 fine-tune 버전 (예: `v1774937777455.onnx`)
- **필수 메타데이터**:
  - `version`, `file`, `created`, `type`
  - `training`: 학습 조건 (epochs, data_size, val_loss, direction_acc)
  - `benchmark`: 평가 결과 (foul_rate, avg_royalty, fl_entry, avg_score, win_rate_vs_simple)
- **버전 관리 정책**:
  - `latest`: 현재 배포 중인 모델 (클라이언트·서버 추론에 사용)
  - `baseline`: 비교 기준 (휴리스틱 smart-bot)
  - 새 ML 모델은 반드시 baseline 대비 벤치마크 기록 후 등록

## 평가 (Model Evaluator)

- **파일**: `server/test/model-evaluator.js` (커밋 `0ebba78`)
- **실행**: `node server/test/model-evaluator.js --hands 500`
- **평가 방식**:
  - Room 클래스 직접 조작으로 봇 vs 봇 대결 N핸드 실행 (기본 500)
  - BotA: 대상 모델 (ML 또는 smart-bot)
  - BotB: 비교 대상 (기본 simple-bot — `bot-benchmark.js` 재사용 휴리스틱)
- **측정 지표**:
  - `foul_rate` (%)
  - `avg_royalty` (평균 로열티)
  - `fl_entry` (Fantasyland 진입률)
  - `avg_score` (평균 점수)
  - `win_rate_A` (승률)
- **성능 추이**: `data/stats/performance-history.json` (배열, 실행마다 append)
- **performance-history.json 스키마** (실측 근거: `data/stats/performance-history.json`):
  ```json
  [
    {
      "version": "string (required — registry.json의 versions[].version)",
      "date": "string (required, YYYY-MM-DD)",
      "opponent": "string (required — 비교 대상 봇 이름)",
      "hands": "integer (required — 평가 핸드 수)",
      "botA_foul_rate": "number (0..100, %)",
      "botA_avg_royalty": "number",
      "botA_fl_entry": "number (Fantasyland 진입률 %)",
      "botA_avg_score": "number",
      "botB_foul_rate": "number (0..100, %)",
      "botB_avg_royalty": "number",
      "botB_fl_entry": "number",
      "botB_avg_score": "number",
      "win_rate_A": "number (0..100, %)"
    }
  ]
  ```
  **필드 설명**:
  - 최상위: JSON 배열. `model-evaluator.js` 실행마다 1개 항목 append
  - `version`: 대상 모델(BotA) 버전 — `registry.json`과 join 키
  - `botA_*`: 대상 모델 지표 (registry.benchmark와 동일한 스냅샷)
  - `botB_*`: 비교 대상 지표 (기본 `simple-bot`). 기준선 검증용
  - `win_rate_A`: BotA 승률 (%). 롤백 판정의 1차 지표
  - 정렬: 시간순 append-only. 동일 버전 다중 실행 허용 (통계적 유의성 확보)
- **실측 예시** (performance-history.json):
  - v0-smart-bot vs simple-bot: foul 10~11%, avg_score 3.64~4.77, 승률 56~62%

## 배포 (ONNX 추론)

- **변환 절차**: PyTorch `model.pt` → `ml/export_onnx.py` → `data/models/latest.onnx`
- **서버 측 추론**:
  - `server/test/detailed-qa-test.js` L26~29: ONNX 모델 로드 경로 정의 (`data/models/v1.onnx`)
  - Room 시뮬레이션에서 ML bot으로 활용
  - 상세 추론 래퍼: `TODO: 서버용 ONNX 추론 모듈 위치 확인 필요 (ml-bot.js?)`
- **클라이언트 측 (`smart_ai.dart`)**: **미구현**
  - `prd-reinforcement-strategy.md` §B6 및 `prd-qa-automation` B6 참조
  - Flutter 클라이언트에서 ONNX 모델 직접 추론하여 오프라인/싱글플레이 지원 예정
  - `TODO: onnxruntime Flutter 패키지 선정, 모델 asset 번들링 전략`

## 롤백 정책

- **트리거 조건** (제안):
  - 신규 모델 승률이 `baseline` 대비 5%p 이상 하락
  - `foul_rate`가 `baseline` 대비 3%p 이상 상승
  - `avg_score`가 `baseline`보다 낮음
- **롤백 절차**:
  1. `registry.json`의 `latest`를 이전 버전으로 되돌림
  2. `data/models/latest.onnx` 심볼릭 링크 또는 파일 교체
  3. `performance-history.json`에 롤백 사유 기록
- **자동화**: `TODO: model-evaluator.js에 --auto-rollback 플래그 추가 필요`

## 모니터링

- **운영 중 성능 저하 감지**:
  - 실제 유저 대전 로그(`room.js`)에서 포울/오판 비율 수집
  - 임계치 초과 시 재학습 트리거
- **재학습 주기**:
  - QA 실행 시마다 자동 fine-tune (현재 구현)
  - 추가: 주간 정기 재학습, 핸드 누적 수 기반 트리거 `TODO`
- **알림**: `TODO: 성능 하락 감지 시 알림 채널 (Slack?) 정의`

## 구현 맵

| 기능 | 파일 | 상태 |
|------|------|------|
| 휴리스틱 봇 (baseline) | `server/game/smart-bot.js` (1222줄) | 완료 `8ef96d2` |
| Feature 추출 | `server/game/feature-extractor.js` | 완료 |
| 학습 데이터 수집 (오프라인) | `server/test/generate-training.js` | 완료 `8ef96d2` |
| 학습 데이터 수집 (QA 실시간) | `server/game/training-logger.js` | 완료 `7ce3fd4` |
| PyTorch 모델 | `ml/model.py`, `ml/train.py`, `ml/dataset.py` | 완료 `e4bcada` |
| ONNX 변환 | `ml/export_onnx.py` | 완료 `e4bcada` |
| 모델 레지스트리 | `data/models/registry.json` | 완료 `0ebba78` |
| 성능 추이 로그 | `data/stats/performance-history.json` | 완료 `0ebba78` |
| 모델 평가 | `server/test/model-evaluator.js` | 완료 `0ebba78` |
| QA→Fine-tune 자동 트리거 | `server/test/detailed-qa-test.js` L560~ | 완료 `7ce3fd4`, `657daae` |
| 서버 ONNX 추론 래퍼 | `TODO: 위치 확인` | 부분 |
| 클라이언트 `smart_ai.dart` | `lib/services/smart_ai.dart` | **미구현** |
| 자동 롤백 | `TODO` | 미구현 |
| 재학습 스케줄러 | `TODO` | 미구현 |

## 범위 외

- QA 테스트 체계·불변식·커버리지 → `prd-qa-automation.prd.md`
- OFC 게임 규칙 (Foul 판정, 로열티, FL 로직) → `prd-game-rules` (`prd-reinforcement-strategy.md` §D1에서 신규 제안)
- 서버 인프라/배포 (Docker) → `prd-app-deployment.prd.md`

## DoD (Definition of Done)

- [ ] `registry.json` 스키마 확정 및 문서화 (현재 v0/v1 기반)
- [ ] 자동 평가 → 롤백 파이프라인 구현 + 테스트 커버
- [ ] `ml/train.py` 하이퍼파라미터 문서화
- [ ] 서버용 ONNX 추론 래퍼 위치 공식화
- [ ] 클라이언트 `smart_ai.dart` 구현 및 배포 (`prd-reinforcement-strategy.md` §B6)
- [ ] 성능 저하 감지 → 재학습 자동 트리거 구현
- [ ] `data/training/` 데이터 보관 정책 (용량·기간) 정의

## Changelog

| 날짜 | 버전 | 변경 내용 | 변경 유형 | 결정 근거 |
|------|------|-----------|----------|----------|
| 2026-04-17 | v0.1 | 최초 skeleton 작성 — `prd-qa-automation`의 ML 섹션을 독립 PRD로 분리 | - | `prd-reinforcement-strategy.md` §D5 |
