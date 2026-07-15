# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 배포 및 실행

- **플랫폼:** GitHub Pages — `main` 브랜치 루트 정적 파일 자동 배포
- **배포 URL:** https://sangkyoung92-cmyk.github.io/todo/
- **로컬 개발 서버:**
  ```bash
  python3 -m http.server 4173
  # http://localhost:4173 접속
  ```
- 빌드 도구 없음 — 번들러, 트랜스파일러 사용 금지. 브라우저 ES Modules 그대로 동작.
- **테스트:** 자동화 테스트 없음. 수동 테스트 절차는 `README.md` 섹션 5 참조.

## 기술 스택

- Vanilla JS (ES6 Modules), HTML5, CSS3
- Firebase Firestore (클라우드 동기화), Google OAuth (Firebase Auth)
- Gemini 2.5 Flash (Google AI Studio API) — API 키 없으면 로컬 알고리즘 fallback

## 아키텍처

### 레이어 구조

```
src/state/store.js          ← 단일 전역 state, localStorage 자동 저장
src/ui/                     ← 렌더링 (render.js, todo.js, schedule.js, 모달들)
src/sync/cloud.js           ← Firebase Firestore 동기화 (2초 debounce)
src/auth.js                 ← Google OAuth 로그인/로그아웃
src/todo/                   ← 노트 텍스트 → 할 일 추출
src/utils/                  ← date-utils, format, holiday-utils, parse-date-kr, todo-buckets
src/main.js                 ← 진입점, 이벤트 위임, 앱 조율
packages/shared/            ← 웹/Android 공용 유틸 (firebase-config, schedule-repository 등)
packages/schedule-core/     ← 스케줄 핵심 로직 (overview.js, sections.js, tasks.js)
apps/web/                   ← 웹 앱 bootstrap
apps/android/capacitor/     ← Android 앱 (Capacitor 기반, www/ 는 웹 에셋 미러)
```

### 데이터 흐름

1. `src/state/store.js`가 단일 진실 소스 (`state` 객체)
2. UI 이벤트 → state mutation 함수 호출
3. state 변경 → `rerender()` 콜백으로 UI 재렌더링
4. 로그인 상태면 Firebase에 2초 debounce로 업로드
5. 로그인 시 클라우드 데이터가 로컬을 덮어씀 (클라우드 우선)

### 주요 기능 영역

| 기능 | 핵심 파일 |
|------|----------|
| 탭·노트 관리 | `src/state/store.js`, `src/ui/render.js` |
| 할 일 목록 | `src/ui/todo.js`, `src/ui/todo-modal.js`, `src/utils/todo-buckets.js` |
| 스케줄(주·월간) | `src/ui/schedule.js`, `packages/schedule-core/` |
| 클라우드 동기화 | `src/sync/cloud.js`, `packages/shared/firebase-config.js` |

### 스케줄 특이사항

- 주간 뷰: 일요일 시작, 주말/공휴일 강조 (`src/utils/holiday-utils.js` 한국 공휴일)
- 드래그 배정, `Ctrl`(Mac: `Cmd`) + 드래그 = 복사 배정
- 할 일에 기한 지정 시 스케줄 해당 날짜 자동 배정 (양방향 연동)

## 개발 원칙

1. **모듈화 필수:** 기능별로 파일을 분리한다. 하나의 파일에 여러 기능을 몰아넣지 않는다.
2. **역질문 우선:** 요청사항이 모호하면 추론해서 구현하지 말고, 먼저 의도를 확인받는다.
3. **README 동기화:** 기능 변경 시 `README.md`의 실행 방법과 테스트 방법을 함께 업데이트한다.
