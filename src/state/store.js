export const STORAGE_KEY = 'onenote_mvp_v2';

export const SECTION_COLORS = [
  '#7B2FA0', '#1f4db6', '#107c10', '#d83b01',
  '#0078d4', '#b4009e', '#038387', '#c19c00',
];

export const state = {
  tabs: [],
  notes: [],
  selectedTabId: null,
  selectedNoteId: null,
  saveTimer: null,
  searchQuery: '',
};

export function uid() {
  return crypto.randomUUID();
}

export function nowISO() {
  return new Date().toISOString();
}

export function getCurrentTabNotes() {
  return state.notes
    .filter((note) => note.tabId === state.selectedTabId)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export function getNextSectionColor() {
  const used = state.tabs.length;
  return SECTION_COLORS[used % SECTION_COLORS.length];
}

export function save() {
  const payload = {
    tabs: state.tabs,
    notes: state.notes,
    selectedTabId: state.selectedTabId,
    selectedNoteId: state.selectedNoteId,
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function createStarterData() {
  const firstTabId = uid();
  const secondTabId = uid();
  const firstNoteId = uid();
  const secondNoteId = uid();
  const thirdNoteId = uid();
  const now = nowISO();

  state.tabs = [
    { id: firstTabId, name: '업무', color: '#7B2FA0', createdAt: now, updatedAt: now },
    { id: secondTabId, name: '개인', color: '#1f4db6', createdAt: now, updatedAt: now },
  ];

  state.notes = [
    {
      id: firstNoteId,
      tabId: firstTabId,
      title: '오늘 할 일',
      content: '<h2>오늘의 업무</h2><ul><li>이메일 확인</li><li>주간 보고서 작성</li><li>팀 미팅 준비</li></ul><p>메모: 오후 3시 회의 잊지 말기</p>',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: secondNoteId,
      tabId: firstTabId,
      title: '회의록 - 킥오프',
      content: '<h2>프로젝트 킥오프 회의</h2><p><strong>일시:</strong> 2026년 4월 5일</p><p><strong>참석자:</strong> 팀 전원</p><h2>주요 안건</h2><ol><li>프로젝트 범위 확정</li><li>일정 협의</li><li>역할 분담</li></ol>',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: thirdNoteId,
      tabId: secondTabId,
      title: '읽고 싶은 책',
      content: '<h2>독서 목록</h2><ul><li>디자인 씽킹</li><li>린 스타트업</li><li>제로 투 원</li></ul>',
      createdAt: now,
      updatedAt: now,
    },
  ];

  state.selectedTabId = firstTabId;
  state.selectedNoteId = firstNoteId;

  save();
}

export function load() {
  const raw = localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    createStarterData();
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    state.tabs = parsed.tabs || [];
    state.notes = parsed.notes || [];

    // Ensure all tabs have a color
    state.tabs.forEach((tab, i) => {
      if (!tab.color) {
        tab.color = SECTION_COLORS[i % SECTION_COLORS.length];
      }
    });

    state.selectedTabId = parsed.selectedTabId || state.tabs[0]?.id || null;
    const tabNotes = getCurrentTabNotes();
    state.selectedNoteId = parsed.selectedNoteId || tabNotes[0]?.id || null;
  } catch (error) {
    console.error('Failed to parse storage:', error);
    createStarterData();
  }
}
