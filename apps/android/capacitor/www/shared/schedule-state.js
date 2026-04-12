import { getMonday, toDateKey, todayKey } from './date-utils.js';

export function createEmptyScheduleState() {
  return {
    todos: [],
    scheduleEntries: [],
    scheduleView: 'week',
    scheduleWeekStart: toDateKey(getMonday(new Date())),
    scheduleMonth: todayKey().slice(0, 7),
  };
}

export function mergeScheduleState(docData = {}) {
  const empty = createEmptyScheduleState();
  return {
    ...empty,
    todos: docData.todos || empty.todos,
    scheduleEntries: docData.scheduleEntries || empty.scheduleEntries,
    scheduleView: docData.scheduleView || empty.scheduleView,
    scheduleWeekStart: docData.scheduleWeekStart || empty.scheduleWeekStart,
    scheduleMonth: docData.scheduleMonth || empty.scheduleMonth,
  };
}
