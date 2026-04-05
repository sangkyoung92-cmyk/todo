# OneNote 스타일 MVP (탭 + 탭별 다중 노트)

초보자 기준으로 바로 구현 가능한 **설계도 + 실행 코드**를 함께 제공합니다.

## 1. 목표
- 사용자가 탭(섹션)을 자유롭게 만든다.
- 각 탭 안에 노트를 여러 개 저장한다.
- 노트를 수정하면 자동 저장된다.

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
| content | text | 노트 내용 |
| created_at | datetime | 생성 시각 |
| updated_at | datetime | 수정 시각 |

관계: `tabs (1) : notes (N)`

---

### 2-2. API 명세(미래 백엔드 전환용)
브라우저 저장(localStorage)에서 서버 저장으로 바꿀 때 아래 API를 그대로 쓰면 됩니다.

- `GET /api/tabs` : 탭 목록 조회
- `POST /api/tabs` : 탭 생성
- `PATCH /api/tabs/:tabId` : 탭 이름 수정
- `DELETE /api/tabs/:tabId` : 탭 삭제

- `GET /api/tabs/:tabId/notes` : 특정 탭 노트 목록
- `POST /api/notes` : 노트 생성
- `PATCH /api/notes/:noteId` : 노트 수정
- `DELETE /api/notes/:noteId` : 노트 삭제

---

### 2-3. 화면 컴포넌트 설계
3-패널 구조로 분리합니다.

1. `TabSidebar`
   - 탭 목록 표시
   - 탭 생성/이름변경/삭제
2. `NoteListPanel`
   - 선택 탭의 노트 목록
   - 노트 생성/삭제
   - 최근 수정순 정렬
3. `NoteEditorPanel`
   - 제목 + 본문 편집
   - 1초 디바운스 자동 저장

## 3. 실행 방법
별도 빌드 도구 없이 정적 파일로 동작합니다.

```bash
python3 -m http.server 4173
```

브라우저에서 `http://localhost:4173` 접속.

## 4. 구현 범위
- [x] 탭 CRUD
- [x] 노트 CRUD
- [x] 자동 저장(디바운스)
- [x] localStorage 영속화
- [x] 최근 수정순 정렬

## 5. 다음 단계
- 검색 기능
- 마크다운/리치텍스트 에디터
- 계정 로그인 + 서버 DB 저장
- AI 할 일 추출/일정 연동
