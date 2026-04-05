export const STORAGE_KEY = 'onenote_mvp_v1';

export const state = {
  tabs: [],
  notes: [],
  selectedTabId: null,
  selectedNoteId: null,
  saveTimer: null,
};

export function uid() {
  return crypto.randomUUID();
}

export function nowISO() {
  return new Date().toISOString();
}

export function createNoteForTab(tabId, title = '새 노트') {
  const now = nowISO();
  return {
    id: uid(),
    tabId,
    title,
    content: '<p><br></p>',
    createdAt: now,
    updatedAt: now,
  };
}

export function getCurrentTabNotes() {
  return state.notes
    .filter((note) => note.tabId === state.selectedTabId)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
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
  const now = nowISO();
  const firstNote = createNoteForTab(firstTabId, '첫 노트');
  firstNote.content = '<p>여기에 회의록/업무 내용을 적어보세요.</p>';

  state.tabs = [
    {
      id: firstTabId,
      name: '기본 탭',
      createdAt: now,
      updatedAt: now,
    },
  ];

  state.notes = [firstNote];

  state.selectedTabId = firstTabId;
  state.selectedNoteId = firstNote.id;

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
    state.selectedTabId = parsed.selectedTabId || state.tabs[0]?.id || null;
    const tabNotes = getCurrentTabNotes();
    state.selectedNoteId = parsed.selectedNoteId || tabNotes[0]?.id || null;

    if (state.tabs.length === 0) {
      createStarterData();
    }
  } catch (error) {
    console.error('Failed to parse storage:', error);
    createStarterData();
  }
}
