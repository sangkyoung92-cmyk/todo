# 프로젝트 컨텍스트

## 배포
- **플랫폼**: Netlify
- **URL**: https://gregarious-eclair-bcce20.netlify.app/
- **배포 브랜치**: `main` (main에 push하면 자동 배포)
- feature 브랜치 작업 후 반드시 main에 머지해야 Netlify에 반영됨

## 기술 스택
- Vanilla JS (ES Modules), HTML, CSS — 빌드 도구 없음
- Firebase Firestore (클라우드 동기화), Google OAuth
- AI: Gemini 2.5 Flash (Google AI Studio API)

## 프로젝트 구조
```
/
├── index.html
├── styles.css
└── src/
    ├── main.js          # 엔트리포인트, 이벤트 핸들러
    ├── ai/extract.js    # Gemini API 연동 (노트→할 일 추출)
    ├── state/store.js   # 상태 관리 + localStorage
    ├── ui/
    │   ├── dom.js       # DOM 참조
    │   ├── render.js    # 렌더링 함수
    │   └── todo.js      # 할 일 렌더링 (프로젝트별 그룹)
    ├── todo/extract.js  # 텍스트 추출 유틸
    ├── sync/cloud.js    # Firestore 동기화
    └── auth.js          # Firebase Auth
```

## 개발 브랜치 규칙
- 작업 브랜치: `claude/...` 형태로 생성
- 완료 후 `main`에 머지 + push → Netlify 자동 배포

## 주요 기능 & 단축키
- `Ctrl+Q`: 선택 텍스트 → 할 일 추가
- 툴바 마지막 버튼: 할 일 추가 (드래그 선택 후 클릭)
- 설정 버튼(⚙): Gemini API 키 설정, 앱 정보
- 노트에서 할 일 추출: Gemini AI로 섹션별 프로젝트 분류
