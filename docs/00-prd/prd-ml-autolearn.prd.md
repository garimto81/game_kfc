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
- **데이터 스키마** (실측):
  ```json
  {
    "features": [/* extractFeatures(board, hand, round, deadCards) 결과 벡터 */],
    "action_index": 123,
    "reward": 4.58
  }
  ```
  - feature 차원 / 정확한 필드 타입: `TODO: server/game/feature-extractor.js 상세 확인`
  - action 인코딩: line(top=0, mid=1, bottom=2)을 3진법으로 인코딩 (최대 5장, `generate-training.js` L74~82)
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
- **스키마** (실측):
  ```json
  {
    "versions": [
      {
        "version": "v0-smart-bot",
        "file": null,
        "created": "2026-03-31T00:00:00Z",
        "type": "heuristic" | "ml",
        "training": { "epochs": 50, "data_size": 149990, "val_loss": 103.82, "direction_acc": 62.05 } | null,
        "benchmark": {
          "opponent": "simple-bot",
          "hands": 500,
          "foul_rate": 11.2,
          "avg_royalty": 0.68,
          "fl_entry": 1,
          "avg_score": 4.58,
          "win_rate_vs_simple": 60.6,
          "date": "2026-03-31"
        } | null
      }
    ],
    "latest": "v1",
    "baseline": "v0-smart-bot"
  }
  ```
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
