import {
  buildTodoSectionsFromSchedule,
  getMostRecentScheduledDate,
  getSectionRanges,
  toggleTodoSectionCompletion,
} from './sections.js';

function defaultUid() {
  return crypto.randomUUID();
}

function defaultNowISO() {
  return new Date().toISOString();
}

function getHelpers(helpers = {}) {
  return {
    uid: helpers.uid || defaultUid,
    nowISO: helpers.nowISO || defaultNowISO,
  };
}

export function getTaskProgress(state, todoId) {
  const entries = state.scheduleEntries.filter((entry) => entry.todoId === todoId);
  if (!entries.length) return { total: 0, done: 0, percent: 0 };
  const done = entries.filter((entry) => entry.done).length;
  return {
    total: entries.length,
    done,
    percent: Math.round((done / entries.length) * 100),
  };
}

export function assignTaskToDate(state, todoId, dateKey, helpers = {}) {
  const exists = state.scheduleEntries.some(
    (entry) => entry.todoId === todoId && entry.date === dateKey,
  );
  if (exists) return false;

  const { uid, nowISO } = getHelpers(helpers);
  const now = nowISO();
  state.scheduleEntries.push({
    id: uid(),
    todoId,
    date: dateKey,
    done: false,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  return true;
}

export function addTask(state, payload, helpers = {}) {
  const clean = (payload.text || '').trim();
  if (!clean) return null;

  const { uid, nowISO } = getHelpers(helpers);
  const now = nowISO();
  const todo = {
    id: uid(),
    text: clean,
    projectName: (payload.projectName || '').trim(),
    description: (payload.description || '').trim(),
    done: false,
    sourceNoteId: payload.sourceNoteId || null,
    difficulty: payload.difficulty || '중',
    deadline: payload.deadline || getMostRecentScheduledDate(state.scheduleEntries) || null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    scheduledDates: payload.scheduledDates || [],
  };

  state.todos.push(todo);

  if (todo.deadline && !payload.skipDeadlineAssignment) {
    assignTaskToDate(state, todo.id, todo.deadline, helpers);
  }

  return todo.id;
}

export function removeEntry(state, entryId) {
  const prevLength = state.scheduleEntries.length;
  state.scheduleEntries = state.scheduleEntries.filter((entry) => entry.id !== entryId);
  return prevLength !== state.scheduleEntries.length;
}

export function moveEntryToDate(state, entryId, targetDate, helpers = {}) {
  const entry = state.scheduleEntries.find((item) => item.id === entryId);
  if (!entry || entry.date === targetDate) return false;

  const exists = state.scheduleEntries.some(
    (item) => item.todoId === entry.todoId && item.date === targetDate,
  );
  if (exists) {
    return removeEntry(state, entryId);
  }

  const { nowISO } = getHelpers(helpers);
  entry.date = targetDate;
  entry.updatedAt = nowISO();
  return true;
}

export function copyEntryToDate(state, entryId, targetDate, helpers = {}) {
  const entry = state.scheduleEntries.find((item) => item.id === entryId);
  if (!entry) return false;
  return assignTaskToDate(state, entry.todoId, targetDate, helpers);
}

export function syncTodoDoneFromEntries(state, todoId, helpers = {}) {
  const todo = state.todos.find((item) => item.id === todoId);
  if (!todo) return false;

  const { nowISO } = getHelpers(helpers);
  const entries = state.scheduleEntries.filter((entry) => entry.todoId === todoId);
  if (!entries.length) {
    todo.done = false;
    todo.completedAt = null;
    todo.updatedAt = nowISO();
    return true;
  }

  const done = entries.every((entry) => entry.done);
  todo.done = done;
  todo.completedAt = done ? nowISO() : null;
  todo.updatedAt = nowISO();
  return true;
}

export function toggleEntryDone(state, entryId, helpers = {}) {
  const entry = state.scheduleEntries.find((item) => item.id === entryId);
  if (!entry) return false;

  const { nowISO } = getHelpers(helpers);
  entry.done = !entry.done;
  entry.completedAt = entry.done ? nowISO() : null;
  entry.updatedAt = nowISO();
  syncTodoDoneFromEntries(state, entry.todoId, helpers);
  return true;
}

export function toggleTaskSectionDone(state, todoId, sectionKey, checked, helpers = {}) {
  const todo = state.todos.find((item) => item.id === todoId);
  if (!todo) return false;

  const { nowISO } = getHelpers(helpers);
  const timestamp = nowISO();
  const changedCount = toggleTodoSectionCompletion(
    todoId,
    sectionKey,
    checked,
    state.scheduleEntries,
    timestamp,
  );

  if (changedCount === 0 && sectionKey === 'other') {
    todo.done = checked;
    todo.completedAt = checked ? timestamp : null;
    todo.updatedAt = timestamp;
  } else {
    syncTodoDoneFromEntries(state, todoId, helpers);
  }

  return true;
}

export function setTaskDeadline(state, todoId, nextDeadline, helpers = {}) {
  const todo = state.todos.find((item) => item.id === todoId);
  if (!todo) return false;

  const { uid, nowISO } = getHelpers(helpers);
  const prevDeadline = todo.deadline || null;
  todo.deadline = nextDeadline || null;
  todo.updatedAt = nowISO();

  if (todo.deadline) {
    const exists = state.scheduleEntries.some(
      (entry) => entry.todoId === todo.id && entry.date === todo.deadline,
    );
    if (!exists) {
      const stampedNow = nowISO();
      state.scheduleEntries.push({
        id: uid(),
        todoId: todo.id,
        date: todo.deadline,
        done: false,
        completedAt: null,
        createdAt: stampedNow,
        updatedAt: stampedNow,
      });
    }
  } else if (prevDeadline) {
    state.scheduleEntries = state.scheduleEntries.filter((entry) => entry.todoId !== todo.id);
  }

  return true;
}

export function editTask(state, todoId, patch, helpers = {}) {
  const todo = state.todos.find((item) => item.id === todoId);
  if (!todo) return false;

  const { nowISO } = getHelpers(helpers);
  const nextText = typeof patch.text === 'string' ? patch.text.trim() : todo.text;
  if (!nextText) return false;

  todo.text = nextText;
  if (Object.prototype.hasOwnProperty.call(patch, 'projectName')) {
    todo.projectName = (patch.projectName || '').trim();
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'description')) {
    todo.description = (patch.description || '').trim();
  }
  todo.difficulty = patch.difficulty || todo.difficulty || '중';
  todo.updatedAt = nowISO();

  if (Object.prototype.hasOwnProperty.call(patch, 'deadline')) {
    setTaskDeadline(state, todoId, patch.deadline || null, helpers);
  }

  return true;
}

export function cycleTaskDifficulty(state, todoId, helpers = {}) {
  const todo = state.todos.find((item) => item.id === todoId);
  if (!todo) return false;

  const { nowISO } = getHelpers(helpers);
  const levels = ['하', '중', '상'];
  const index = levels.indexOf(todo.difficulty);
  todo.difficulty = levels[(index + 1 + levels.length) % levels.length];
  todo.updatedAt = nowISO();
  return true;
}

export function deleteTask(state, todoId) {
  const prevLength = state.todos.length;
  state.todos = state.todos.filter((todo) => todo.id !== todoId);
  state.scheduleEntries = state.scheduleEntries.filter((entry) => entry.todoId !== todoId);
  return prevLength !== state.todos.length;
}

export function getScheduleOverview(state, now = new Date()) {
  const sections = buildTodoSectionsFromSchedule(state.todos, state.scheduleEntries, now);
  const ranges = getSectionRanges(now);
  const byDate = new Map();

  state.scheduleEntries.forEach((entry) => {
    if (!byDate.has(entry.date)) byDate.set(entry.date, []);
    byDate.get(entry.date).push(entry);
  });

  return {
    sections,
    ranges,
    entriesByDate: byDate,
    todos: state.todos,
    scheduleEntries: state.scheduleEntries,
  };
}
