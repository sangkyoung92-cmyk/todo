import { todayKey, toDateKey, getSunday } from '../utils/date-utils.js';

export const STORAGE_KEY = 'onenote_mvp_v2';

export const SECTION_COLORS = [
  '#5B8DEF', '#37A987', '#F29F67', '#E87EA1',
  '#8A7CF6', '#4FA3B8', '#9D7FEA', '#F3B562',
];
export const TRASH_RETENTION_DAYS = 7;
export const TRASH_RETENTION_MS = TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_KEY_PATTERN = /^\d{4}-\d{2}$/;

function getDefaultWeekStart() {
  const sunday = getSunday(new Date());
  return toDateKey(sunday);
}

function normalizeDateNotes(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  return Object.entries(value).reduce((acc, [dateKey, note]) => {
    if (!DATE_KEY_PATTERN.test(dateKey)) return acc;

    const text = typeof note === 'string' ? note.trim() : String(note?.text || '').trim();
    if (!text) return acc;

    acc[dateKey] = {
      text,
      updatedAt: note?.updatedAt || nowISO(),
    };
    return acc;
  }, {});
}

export const state = {
  tabs: [],
  pageSections: [],
  notes: [],
  deletedNotes: [],
  todos: [],
  behaviorLog: [],
  recordingDrafts: {},
  selectedTabId: null,
  selectedPageSectionId: null,
  selectedNoteId: null,
  selectedDeletedNoteId: null,
  saveTimer: null,
  searchQuery: '',
  noteListMode: 'notes', // 'notes' | 'trash'
  pendingDeleteNoteIds: [], // tracks note IDs to delete from Firestore (not persisted)
  // Schedule state
  scheduleEntries: [],      // { id, todoId, date, done, completedAt, createdAt, updatedAt }
  dateNotes: {},            // { [YYYY-MM-DD]: { text, updatedAt } }
  appMode: 'notes',         // 'notes' | 'schedule'
  scheduleView: 'week',     // 'week' | 'month'
  scheduleWeekStart: null,  // 'YYYY-MM-DD'
  scheduleMonth: null,      // 'YYYY-MM'
  notePaperMode: 'ruled',
  todoSectionCollapsed: {
    today: false,
    week: false,
    month: false,
    other: false,
  },
  pageSectionCollapsed: {},
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

export function getCurrentTabPageSections() {
  return state.pageSections
    .filter((section) => section.tabId === state.selectedTabId)
    .sort((a, b) => {
      const aOrder = Number.isFinite(a.order) ? a.order : 0;
      const bOrder = Number.isFinite(b.order) ? b.order : 0;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return (a.createdAt || '') < (b.createdAt || '') ? -1 : 1;
    });
}

export function getNextSectionColor() {
  const used = state.tabs.length;
  return SECTION_COLORS[used % SECTION_COLORS.length];
}

export function pruneDeletedNotes(referenceTime = Date.now()) {
  if (!Array.isArray(state.deletedNotes) || state.deletedNotes.length === 0) {
    if (state.selectedDeletedNoteId !== null) {
      state.selectedDeletedNoteId = null;
      return true;
    }
    return false;
  }

  const cutoff = referenceTime - TRASH_RETENTION_MS;
  const nextDeletedNotes = state.deletedNotes.filter((note) => {
    const deletedAt = Date.parse(note?.deletedAt || '');
    if (!Number.isFinite(deletedAt)) return true;
    return deletedAt > cutoff;
  });

  let changed = nextDeletedNotes.length !== state.deletedNotes.length;
  if (changed) {
    state.deletedNotes = nextDeletedNotes;
  }

  const hasSelectedDeletedNote = state.deletedNotes.some((note) => note.id === state.selectedDeletedNoteId);
  if (!hasSelectedDeletedNote) {
    const nextSelectedDeletedNoteId = state.deletedNotes[0]?.id || null;
    if (state.selectedDeletedNoteId !== nextSelectedDeletedNoteId) {
      state.selectedDeletedNoteId = nextSelectedDeletedNoteId;
      changed = true;
    }
  }

  return changed;
}

export function save() {
  pruneDeletedNotes();
  const payload = {
    tabs: state.tabs,
    pageSections: state.pageSections,
    notes: state.notes,
    deletedNotes: state.deletedNotes,
    todos: state.todos,
    behaviorLog: state.behaviorLog,
    recordingDrafts: state.recordingDrafts,
    selectedTabId: state.selectedTabId,
    selectedPageSectionId: state.selectedPageSectionId,
    selectedNoteId: state.selectedNoteId,
    selectedDeletedNoteId: state.selectedDeletedNoteId,
    noteListMode: state.noteListMode,
    scheduleEntries: state.scheduleEntries,
    dateNotes: normalizeDateNotes(state.dateNotes),
    appMode: state.appMode,
    scheduleView: state.scheduleView,
    scheduleWeekStart: state.scheduleWeekStart,
    scheduleMonth: state.scheduleMonth,
    notePaperMode: state.notePaperMode,
    todoSectionCollapsed: state.todoSectionCollapsed,
    pageSectionCollapsed: state.pageSectionCollapsed,
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function load() {
  const raw = localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    state.tabs = [];
    state.pageSections = [];
    state.notes = [];
    state.deletedNotes = [];
    state.todos = [];
    state.behaviorLog = [];
    state.recordingDrafts = {};
    state.selectedTabId = null;
    state.selectedPageSectionId = null;
    state.selectedNoteId = null;
    state.selectedDeletedNoteId = null;
    state.scheduleEntries = [];
    state.dateNotes = {};
    state.noteListMode = 'notes';
    state.appMode = 'notes';
    state.scheduleView = 'week';
    state.scheduleWeekStart = getDefaultWeekStart();
    state.scheduleMonth = todayKey().slice(0, 7);
    state.notePaperMode = 'ruled';
    state.todoSectionCollapsed = { today: false, week: false, month: false, other: false };
    state.pageSectionCollapsed = {};
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    state.tabs = parsed.tabs || [];
    state.pageSections = parsed.pageSections || [];
    state.notes = parsed.notes || [];
    state.deletedNotes = parsed.deletedNotes || [];
    state.todos = parsed.todos || [];
    state.behaviorLog = parsed.behaviorLog || [];
    state.recordingDrafts = parsed.recordingDrafts || {};

    // Ensure all tabs have a color
    state.tabs.forEach((tab, i) => {
      if (!tab.color) {
        tab.color = SECTION_COLORS[i % SECTION_COLORS.length];
      }
    });

    state.selectedTabId = parsed.selectedTabId || state.tabs[0]?.id || null;
    const tabNotes = getCurrentTabNotes();
    state.selectedPageSectionId = parsed.selectedPageSectionId || tabNotes[0]?.pageSectionId || null;
    state.selectedNoteId = parsed.selectedNoteId || tabNotes[0]?.id || null;
    state.selectedDeletedNoteId = parsed.selectedDeletedNoteId || state.deletedNotes[0]?.id || null;
    state.noteListMode = parsed.noteListMode === 'trash' ? 'trash' : 'notes';
    pruneDeletedNotes();

    state.scheduleEntries = parsed.scheduleEntries || [];
    state.dateNotes = normalizeDateNotes(parsed.dateNotes);
    state.appMode = parsed.appMode || 'notes';
    state.scheduleView = parsed.scheduleView || 'week';
    state.scheduleWeekStart = DATE_KEY_PATTERN.test(parsed.scheduleWeekStart || '')
      ? parsed.scheduleWeekStart
      : getDefaultWeekStart();
    state.scheduleMonth = MONTH_KEY_PATTERN.test(parsed.scheduleMonth || '')
      ? parsed.scheduleMonth
      : todayKey().slice(0, 7);
    state.notePaperMode = parsed.notePaperMode || 'ruled';
    state.todoSectionCollapsed = {
      today: parsed.todoSectionCollapsed?.today ?? false,
      week: parsed.todoSectionCollapsed?.week ?? false,
      month: parsed.todoSectionCollapsed?.month ?? false,
      other: parsed.todoSectionCollapsed?.other ?? false,
    };
    state.pageSectionCollapsed = parsed.pageSectionCollapsed || {};
  } catch (error) {
    console.error('Failed to parse storage:', error);
    state.tabs = [];
    state.pageSections = [];
    state.notes = [];
    state.deletedNotes = [];
    state.todos = [];
    state.behaviorLog = [];
    state.recordingDrafts = {};
    state.selectedTabId = null;
    state.selectedPageSectionId = null;
    state.selectedNoteId = null;
    state.selectedDeletedNoteId = null;
    state.scheduleEntries = [];
    state.dateNotes = {};
    state.noteListMode = 'notes';
    state.appMode = 'notes';
    state.scheduleView = 'week';
    state.scheduleWeekStart = getDefaultWeekStart();
    state.scheduleMonth = todayKey().slice(0, 7);
    state.notePaperMode = 'ruled';
    state.todoSectionCollapsed = { today: false, week: false, month: false, other: false };
    state.pageSectionCollapsed = {};
  }
}
