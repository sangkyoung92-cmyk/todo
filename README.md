# OneNote 스타일 MVP (탭 + 탭별 다중 노트)

초보자 기준으로 바로 구현 가능한 **설계도 + 실행 코드**를 함께 제공합니다.

## 1. 목표
- 사용자가 탭(섹션)을 자유롭게 만든다.
- 각 탭 안에 노트를 여러 개 저장한다.
- 노트를 수정하면 자동 저장된다.
- 문서작성기처럼 기본 서식 기능(폰트/색상/번호/글머리표)을 제공한다.

## 2. 설계도

### 2-1. DB 스키마(개념)
현재 코드는 브라우저 `localStorage`를 사용하지만, 나중에 DB로 옮길 때 동일한 구조를 권장합니다.

#### `tabs`
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | string(uuid) | 탭 고유 ID |
| name | string | 탭 이름 |
| created_at | datetime | 생성 시각 |
| updated_at | datetime | 수정 시각 |

#### `notes`
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | string(uuid) | 노트 고유 ID |
| tab_id | string(uuid) | 소속 탭 ID |
| title | string | 노트 제목 |
| content | text(html) | 노트 내용(서식 포함 HTML) |
| created_at | datetime | 생성 시각 |
| updated_at | datetime | 수정 시각 |

관계: `tabs (1) : notes (N)`

---

### 2-2. API 명세(미래 백엔드 전환용)
- `GET /api/tabs` : 탭 목록 조회
- `POST /api/tabs` : 탭 생성(생성 시 기본 노트 1개 포함)
- `PATCH /api/tabs/:tabId` : 탭 이름 수정
- `DELETE /api/tabs/:tabId` : 탭 삭제

- `GET /api/tabs/:tabId/notes` : 특정 탭 노트 목록
- `POST /api/notes` : 노트 생성
- `PATCH /api/notes/:noteId` : 노트 수정
- `DELETE /api/notes/:noteId` : 노트 삭제

---

### 2-3. 화면 컴포넌트 설계
1. `TopTabBar`
   - 탭을 상단 가로 목록으로 표시
   - 탭 생성/이름변경/삭제
2. `NoteListSidebar`
   - 선택 탭의 노트 목록
   - 노트 생성/삭제
3. `EditorPanel`
   - 제목 입력
   - 리치 텍스트 툴바(폰트/크기/색상/B/I/U/번호/글머리표)
   - 본문 편집 + 자동 저장

## 3. 파일 구조 (모듈화)

```text
.
├── index.html
├── styles.css
└── src
    ├── main.js
    ├── state
    │   └── store.js
    ├── ui
    │   ├── dom.js
    │   ├── render.js
    │   └── toolbar.js
    └── utils
        └── format.js
```

## 4. 실행 방법
```bash
python3 -m http.server 4173
```
브라우저에서 `http://localhost:4173` 접속.

## 5. 테스트 방법 (수동)

### A. 레이아웃 확인
1. 탭이 상단에 보이는지 확인
2. 노트 목록이 왼쪽 사이드에 보이는지 확인

### B. 탭/노트 동작 확인
1. `+ 탭` 클릭
2. 새 탭이 생기고 **기본 노트 1개가 자동 생성**되는지 확인
3. `+ 노트`로 같은 탭에 노트를 추가 생성할 수 있는지 확인

### C. 서식 기능 확인
1. 본문에 텍스트 입력
2. 툴바에서 폰트/크기/글자색 변경
3. 굵게(B), 기울임(I), 밑줄(U), 번호목록(1.), 글머리표(•) 적용 확인

### D. 자동 저장/영속화 확인
1. 제목/본문 수정 후 1초 대기
2. 상태가 `저장 중...` → `저장됨`으로 바뀌는지 확인
3. 새로고침 후 내용(서식 포함)이 유지되는지 확인

## 6. 구현 범위
- [x] 탭 CRUD
- [x] 노트 CRUD
- [x] 새 탭 생성 시 기본 노트 자동 생성
- [x] 자동 저장(디바운스)
- [x] localStorage 영속화
- [x] 최근 수정순 정렬
- [x] 코드 모듈화
- [x] 기본 문서 서식 기능

## 7. 다음 단계
- 링크/이미지/표 삽입
- 계정 로그인 + 서버 DB 저장
- AI 할 일 추출/일정 연동
