# AI 사용자 맞춤화(개인화) 로직 정리

이 문서는 현재 코드 기준으로 **AI 일정 추가가 사용자 패턴에 어떻게 맞춰지는지**를 빠르게 테스트할 수 있도록 정리한 문서입니다.

## 1) 개인화 데이터 소스

### A. 행동 로그(`state.behaviorLog`)
- 저장 위치: `state.behaviorLog` (로컬 저장 + 클라우드 동기화 대상)
- 생성 시점: 사용자가 할 일을 수정/완료/삭제할 때마다 `logBehavior` 호출
- 기록 항목:
  - `action`: `delete | difficulty_change | deadline_change | name_edit | complete`
  - `before`, `after`: 변경 전/후 값
  - `todoText`, `todoDifficulty`: 해당 시점 할 일 컨텍스트
  - `timestamp`
- 최대 200개까지만 유지 (초과 시 오래된 로그 제거)

관련 코드:
- `src/tracking/behavior.js`
- `src/state/store.js`
- `src/sync/cloud.js`

### B. 기존 할 일 분포(`state.todos`)
- 미완료 + 기한이 있는 할 일을 기준으로, 오늘부터 7일 범위의 날짜별 건수 계산
- AI 프롬프트에 “특정 날짜로 몰리지 않게” 분산 배치 힌트로 삽입

관련 코드:
- `src/ai/deadline.js`
- `src/ai/extract.js`

### C. 개인화 설정값(`schedule_ai_preferences_v1`)
- 설정 화면의 체크박스로 아래 항목 ON/OFF 가능
  - `useBehaviorSummary`
  - `useDeadlineDistribution`
  - `useExistingTodoTexts`
- 로컬 스토리지에 저장

관련 코드:
- `src/ai/schedule-preferences.js`
- `src/main.js`

---

## 2) 개인화 적용 흐름 (AI 일정 추가 버튼 기준)

1. 사용자가 `AI 일정 추가` 클릭
2. `main.js`에서 설정값 로드
3. 설정에 따라 아래 컨텍스트를 준비
   - 행동 요약 문자열(`buildBehaviorSummary`)
   - 기존 할 일(기한 분포/중복 방지용)
4. `extractTodosWithAI` 호출
5. `buildPrompt`에서 프롬프트 생성 시 개인화 정보 포함
6. Gemini 응답(JSON) 파싱 후, 기한 보정(`validateDeadline`) 적용
7. 중복 텍스트는 옵션이 켜져 있으면 제외하고 실제 일정 추가

---

## 3) buildBehaviorSummary 규칙 요약

행동 로그를 분석해 아래 패턴을 문장으로 생성합니다.

- 난이도 변경 패턴
  - 상향/하향 횟수 비교해 성향 문장 생성
- 마감일 변경 패턴
  - 평균 며칠 미루는지/앞당기는지 계산
- 삭제 패턴
  - 삭제 횟수 3회 이상이면 “AI 추출 불필요 항목 가능성” 힌트
- 완료 패턴
  - 난이도별 평균 완료 소요일 추정
- 이름 수정 패턴
  - 3회 이상이면 “더 구체적 표현 필요” 힌트

---

## 4) 빠른 테스트 시나리오

### 시나리오 A: 행동 요약 반영 확인
1. 설정에서 `행동 요약` ON
2. 같은 할 일의 마감일을 여러 번 뒤로 미루기
3. `AI 일정 추가` 실행
4. 생성 결과가 비교적 뒤쪽 날짜로 배치되는지 확인

### 시나리오 B: 기한 분포 반영 확인
1. 특정 하루에 기존 할 일을 여러 개 몰아두기
2. 설정에서 `기한 분포` ON
3. `AI 일정 추가` 실행
4. 새 할 일이 상대적으로 덜 붐비는 날짜로 분산되는지 확인

### 시나리오 C: 중복 방지 확인
1. 기존에 `보고서 제출` 같은 할 일을 하나 생성
2. 설정에서 `기존 할 일 텍스트` ON
3. `AI 일정 추가` 실행
4. 동일 텍스트 일정이 새로 추가되지 않는지 확인

---

## 5) 디버깅 포인트

- 행동 로그가 안 쌓이면: `logBehavior` 호출 지점(완료/삭제/수정 이벤트) 확인
- 요약이 비어 있으면: 로그 개수와 액션 종류가 규칙 임계치(예: 3회) 충족하는지 확인
- 기한 분포가 이상하면: 기존 할 일의 `done`, `deadline` 값 유효성 확인
- 중복 방지가 안 되면: 텍스트 완전 일치 비교(`t.text === todoItem.text`) 규칙 확인
