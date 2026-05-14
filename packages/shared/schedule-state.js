import { getSunday, toDateKey, todayKey } from './date-utils.js';
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_KEY_PATTERN = /^\d{4}-\d{2}$/;

export function createEmptyScheduleState() {
  return {
    todos: [],
    scheduleEntries: [],
    dateNotes: {},
    scheduleView: 'week',
    scheduleWeekStart: toDateKey(getSunday(new Date())),
    scheduleMonth: todayKey().slice(0, 7),
  };
}

export function mergeScheduleState(docData = {}) {
  const empty = createEmptyScheduleState();
  return {
    ...empty,
    todos: docData.todos || empty.todos,
    scheduleEntries: docData.scheduleEntries || empty.scheduleEntries,
    dateNotes: docData.dateNotes || empty.dateNotes,
    scheduleView: docData.scheduleView || empty.scheduleView,
    scheduleWeekStart: DATE_KEY_PATTERN.test(docData.scheduleWeekStart || '')
      ? docData.scheduleWeekStart
      : empty.scheduleWeekStart,
    scheduleMonth: MONTH_KEY_PATTERN.test(docData.scheduleMonth || '')
      ? docData.scheduleMonth
      : empty.scheduleMonth,
  };
}
