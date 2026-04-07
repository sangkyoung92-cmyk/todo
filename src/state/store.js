import { todayKey, toDateKey, getMonday } from '../utils/date-utils.js';

export const STORAGE_KEY = 'onenote_mvp_v2';

export const SECTION_COLORS = [
  '#7B2FA0', '#1f4db6', '#107c10', '#d83b01',
  '#0078d4', '#b4009e', '#038387', '#c19c00',
];

function getDefaultWeekStart() {
  const monday = getMonday(new Date());
  return toDateKey(monday);
}

export const state = {
  tabs: [],
  notes: [],
  todos: [],
  behaviorLog: [],
  selectedTabId: null,
  selectedNoteId: null,
  saveTimer: null,
  searchQuery: '',
  pendingDeleteNoteIds: [], // tracks note IDs to delete from Firestore (not persisted)
  // 스케줄 탭 관련
  scheduleEntries: [],      // { id, todoId, date, done, completedAt, createdAt, updatedAt }
  appMode: 'notes',         // 'notes' | 'schedule'
  scheduleView: 'week',     // 'week' | 'month'
  scheduleWeekStart: null,  // 'YYYY-MM-DD' (현재 보고 있는 주의 월요일)
  scheduleMonth: null,      // 'YYYY-MM' (현재 보고 있는 월)
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
    todos: state.todos,
    behaviorLog: state.behaviorLog,
    selectedTabId: state.selectedTabId,
    selectedNoteId: state.selectedNoteId,
    scheduleEntries: state.scheduleEntries,
    appMode: state.appMode,
    scheduleView: state.scheduleView,
    scheduleWeekStart: state.scheduleWeekStart,
    scheduleMonth: state.scheduleMonth,
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function load() {
  const raw = localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    state.tabs = [];
    state.notes = [];
    state.todos = [];
    state.behaviorLog = [];
    state.selectedTabId = null;
    state.selectedNoteId = null;
    state.scheduleEntries = [];
    state.appMode = 'notes';
    state.scheduleView = 'week';
    state.scheduleWeekStart = getDefaultWeekStart();
    state.scheduleMonth = todayKey().slice(0, 7);
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    state.tabs = parsed.tabs || [];
    state.notes = parsed.notes || [];
    state.todos = parsed.todos || [];
    state.behaviorLog = parsed.behaviorLog || [];

    // Ensure all tabs have a color
    state.tabs.forEach((tab, i) => {
      if (!tab.color) {
        tab.color = SECTION_COLORS[i % SECTION_COLORS.length];
      }
    });

    state.selectedTabId = parsed.selectedTabId || state.tabs[0]?.id || null;
    const tabNotes = getCurrentTabNotes();
    state.selectedNoteId = parsed.selectedNoteId || tabNotes[0]?.id || null;

    state.scheduleEntries = parsed.scheduleEntries || [];
    state.appMode = parsed.appMode || 'notes';
    state.scheduleView = parsed.scheduleView || 'week';
    state.scheduleWeekStart = parsed.scheduleWeekStart || getDefaultWeekStart();
    state.scheduleMonth = parsed.scheduleMonth || todayKey().slice(0, 7);
  } catch (error) {
    console.error('Failed to parse storage:', error);
    state.tabs = [];
    state.notes = [];
    state.todos = [];
    state.behaviorLog = [];
    state.selectedTabId = null;
    state.selectedNoteId = null;
    state.scheduleEntries = [];
    state.appMode = 'notes';
    state.scheduleView = 'week';
    state.scheduleWeekStart = getDefaultWeekStart();
    state.scheduleMonth = todayKey().slice(0, 7);
  }
}
