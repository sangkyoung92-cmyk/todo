import { addTask, assignTaskToDate, moveEntryToDate } from './tasks.js';

const DIFFICULTY_WEIGHT = {
  '상': 30,
  '중': 18,
  '하': 8,
};

export function getPlannerSnapshot(state, now = new Date()) {
  const today = toDateKey(now);
  const weekDates = getCurrentWeekDateKeys(now);
  const scheduledByTodo = groupEntriesByTodo(state.scheduleEntries || []);
  const activeTodos = (state.todos || []).filter((todo) => !todo.done);
  const plannedTodos = activeTodos
    .map((todo) => buildPlanItem(todo, scheduledByTodo.get(todo.id) || [], today, weekDates))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || (a.deadline || '').localeCompare(b.deadline || ''))
    .slice(0, 8);

  return {
    today,
    weekDates,
    planItems: plannedTodos,
    inboxItems: [...(state.todoInbox || [])].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)),
    unscheduledTodos: getUnscheduledTodos(state),
  };
}

export function getUnscheduledTodos(state) {
  const scheduledTodoIds = new Set((state.scheduleEntries || []).map((entry) => entry.todoId));
  return (state.todos || [])
    .filter((todo) => !todo.done && !scheduledTodoIds.has(todo.id))
    .sort((a, b) => {
      const left = a.deadline || '9999-99-99';
      const right = b.deadline || '9999-99-99';
      if (left !== right) return left.localeCompare(right);
      return (b.updatedAt || '').localeCompare(a.updatedAt || '');
    });
}

export function buildAutoSchedulePreview(state, now = new Date(), limit = 8) {
  const candidates = getUnscheduledTodos(state).slice(0, limit);
  const dateKeys = getNextDateKeys(now, 7);
  const loadByDate = getLoadByDate(state.scheduleEntries || [], dateKeys);

  return candidates.map((todo) => {
    const date = chooseBestDate(todo, dateKeys, loadByDate);
    loadByDate.set(date, (loadByDate.get(date) || 0) + 1);
    return {
      todoId: todo.id,
      text: todo.text,
      difficulty: todo.difficulty || '중',
      date,
      reason: buildScheduleReason(todo, date, loadByDate.get(date) || 0),
    };
  });
}

export function buildLocalPlannerSuggestions(state, now = new Date(), limit = 10) {
  const today = toDateKey(now);
  const dateKeys = getNextDateKeys(now, 7);
  const weekEnd = dateKeys[dateKeys.length - 1];
  const loadByDate = getLoadByDate(state.scheduleEntries || [], dateKeys);
  const todosById = new Map((state.todos || []).map((todo) => [todo.id, todo]));
  const suggestions = [];
  const usedTodoIds = new Set();

  function pushSuggestion(item) {
    if (!item?.todoId || !item?.date || usedTodoIds.has(item.todoId) || suggestions.length >= limit) return;
    usedTodoIds.add(item.todoId);
    loadByDate.set(item.date, (loadByDate.get(item.date) || 0) + 1);
    suggestions.push({
      id: `local-${item.action || 'assign'}-${item.todoId}-${item.date}`,
      type: 'schedule',
      source: 'local',
      action: item.action || 'assign',
      entryId: item.entryId || null,
      todoId: item.todoId,
      text: item.text,
      difficulty: item.difficulty || '중',
      deadline: item.deadline || null,
      date: item.date,
      reason: item.reason,
    });
  }

  getUnscheduledTodos(state).forEach((todo) => {
    if (suggestions.length >= limit) return;

    let date = null;
    let reason = '';
    if (todo.deadline && todo.deadline < today) {
      date = today;
      reason = '기한이 지났는데 완료처리가 안됐네요. 이번주에 처리하시죠';
    } else if (!todo.deadline) {
      date = chooseBestDate(todo, dateKeys, loadByDate);
      reason = '업무기한이 없어서 적당한 날짜에 올렸습니다';
    } else if (todo.deadline <= weekEnd) {
      const availableDates = dateKeys.filter((dateKey) => dateKey <= todo.deadline);
      date = chooseBestDate(todo, availableDates, loadByDate);
      reason = '기한 전에 여유로운 날로 올렸습니다';
    }

    if (!date) return;
    pushSuggestion({
      action: 'assign',
      todoId: todo.id,
      text: todo.text,
      difficulty: todo.difficulty,
      deadline: todo.deadline,
      date,
      reason,
    });
  });

  const activeEntries = (state.scheduleEntries || [])
    .filter((entry) => !entry.done && (dateKeys.includes(entry.date) || entry.date < today))
    .sort((a, b) => (loadByDate.get(b.date) || 0) - (loadByDate.get(a.date) || 0));
  const averageLoad = dateKeys.reduce((sum, dateKey) => sum + (loadByDate.get(dateKey) || 0), 0) / dateKeys.length;
  const overloadThreshold = Math.max(3, Math.ceil(averageLoad + 1));

  activeEntries.forEach((entry) => {
    if (suggestions.length >= limit) return;
    const todo = todosById.get(entry.todoId);
    if (!todo || todo.done || usedTodoIds.has(todo.id)) return;

    const isOverdue = todo.deadline && todo.deadline < today;
    const isOverloaded = (loadByDate.get(entry.date) || 0) >= overloadThreshold;
    const isFlexible = !todo.deadline || todo.deadline > weekEnd;
    if (!isOverdue && (!isOverloaded || !isFlexible)) return;

    const availableDates = todo.deadline
      ? dateKeys.filter((dateKey) => dateKey <= todo.deadline)
      : dateKeys;
    const date = isOverdue
      ? today
      : chooseBestDate(todo, availableDates, loadByDate, entry.date);

    if (!date || date === entry.date) return;
    loadByDate.set(entry.date, Math.max(0, (loadByDate.get(entry.date) || 0) - 1));
    pushSuggestion({
      action: 'move',
      entryId: entry.id,
      todoId: todo.id,
      text: todo.text,
      difficulty: todo.difficulty,
      deadline: todo.deadline,
      date,
      reason: isOverdue
        ? '기한이 지났는데 완료처리가 안됐네요. 이번주에 처리하시죠'
        : (todo.deadline
          ? '이번주 업무가 몰려서 기한 안쪽 여유로운 날로 옮깁니다'
          : '업무기한이 없어서 과중한 날에서 분산합니다'),
    });
  });

  return suggestions.sort((a, b) => {
    const priorityDiff = getSuggestionPriority(b, today) - getSuggestionPriority(a, today);
    if (priorityDiff) return priorityDiff;
    return (a.date || '').localeCompare(b.date || '');
  });
}

export function applyAutoSchedulePreview(state, previewItems, helpers = {}) {
  let applied = 0;
  (previewItems || []).forEach((item) => {
    if (!item?.todoId || !item?.date) return;
    if (!(state.todos || []).some((todo) => todo.id === item.todoId && !todo.done)) return;
    if (assignTaskToDate(state, item.todoId, item.date, helpers)) applied += 1;
  });
  return applied;
}

export function applyPlannerSuggestions(state, suggestions, helpers = {}) {
  let applied = 0;
  (suggestions || []).forEach((item) => {
    if (!item?.date && item?.type !== 'task') return;

    if (item.type === 'task') {
      const text = (item.text || '').trim();
      if (!text || (state.todos || []).some((todo) => todo.text === text)) return;
      const todoId = addTask(state, {
        text,
        projectName: item.projectName || '',
        sourceNoteId: item.sourceNoteId || null,
        difficulty: item.difficulty || '중',
        deadline: item.deadline || item.date || null,
        skipDeadlineAssignment: true,
      }, helpers);
      if (!todoId) return;
      if (item.date) assignTaskToDate(state, todoId, item.date, helpers);
      if (item.inboxId) {
        state.todoInbox = (state.todoInbox || []).filter((candidate) => candidate.id !== item.inboxId);
      }
      applied += 1;
      return;
    }

    if (!item.todoId || !(state.todos || []).some((todo) => todo.id === item.todoId && !todo.done)) return;
    if (item.action === 'move') {
      const entry = (state.scheduleEntries || []).find((candidate) => candidate.id === item.entryId);
      if (entry && moveEntryToDate(state, entry.id, item.date, helpers)) {
        applied += 1;
        return;
      }
    }

    const movableEntry = (state.scheduleEntries || [])
      .find((entry) => entry.todoId === item.todoId && !entry.done && entry.date !== item.date);
    if (movableEntry && moveEntryToDate(state, movableEntry.id, item.date, helpers)) {
      applied += 1;
      return;
    }

    if (assignTaskToDate(state, item.todoId, item.date, helpers)) applied += 1;
  });
  return applied;
}

export function createInboxItem(payload, helpers = {}) {
  const text = (payload.text || '').trim();
  if (!text) return null;

  const nowISO = helpers.nowISO || (() => new Date().toISOString());
  const uid = helpers.uid || (() => crypto.randomUUID());
  const now = nowISO();

  return {
    id: uid(),
    text,
    projectName: (payload.projectName || '').trim(),
    sourceNoteId: payload.sourceNoteId || null,
    difficulty: payload.difficulty || '중',
    deadline: payload.deadline || null,
    createdAt: now,
    updatedAt: now,
  };
}

function buildPlanItem(todo, entries, today, weekDates) {
  const entryDates = entries.map((entry) => entry.date).filter(Boolean);
  const isTodayScheduled = entryDates.includes(today);
  const isWeekScheduled = entryDates.some((date) => weekDates.includes(date));
  const isOverdue = todo.deadline && todo.deadline < today;
  const isPastScheduled = entryDates.some((date) => date < today);
  const isDueToday = todo.deadline === today;
  const isDueThisWeek = todo.deadline && weekDates.includes(todo.deadline);

  if (!isOverdue && !isPastScheduled && !isTodayScheduled && !isDueToday && !isWeekScheduled && !isDueThisWeek) {
    return null;
  }

  const score = (isOverdue ? 1000 : 0)
    + (isPastScheduled ? 900 : 0)
    + (isTodayScheduled ? 800 : 0)
    + (isDueToday ? 700 : 0)
    + (isWeekScheduled ? 260 : 0)
    + (isDueThisWeek ? 220 : 0)
    + (DIFFICULTY_WEIGHT[todo.difficulty] || DIFFICULTY_WEIGHT['중']);

  return {
    todoId: todo.id,
    text: todo.text,
    difficulty: todo.difficulty || '중',
    deadline: todo.deadline || null,
    score,
    reason: getPlanReason({ isOverdue, isPastScheduled, isTodayScheduled, isDueToday, isWeekScheduled, isDueThisWeek }),
  };
}

function getPlanReason(flags) {
  if (flags.isOverdue || flags.isPastScheduled) return '기한 지남';
  if (flags.isTodayScheduled || flags.isDueToday) return '오늘 처리';
  if (flags.isWeekScheduled || flags.isDueThisWeek) return '이번 주 처리';
  return '확인 필요';
}

function chooseBestDate(todo, dateKeys, loadByDate, excludeDate = null) {
  if (!dateKeys.length) return null;
  if (todo.deadline && dateKeys.includes(todo.deadline) && todo.deadline !== excludeDate) return todo.deadline;

  let bestDate = null;
  let bestScore = Infinity;
  dateKeys.forEach((dateKey, index) => {
    if (dateKey === excludeDate) return;
    const load = loadByDate.get(dateKey) || 0;
    const highDifficultyPenalty = todo.difficulty === '상' && index === 0 ? 2 : 0;
    const score = load * 10 + highDifficultyPenalty + index * 0.2;
    if (score < bestScore) {
      bestDate = dateKey;
      bestScore = score;
    }
  });
  return bestDate;
}

function buildScheduleReason(todo, date, nextLoad) {
  if (todo.deadline === date) return '기한 날짜 우선';
  if (todo.difficulty === '상') return `부담이 낮은 날로 분산 (${nextLoad}개)`;
  return `가장 여유로운 날로 배치 (${nextLoad}개)`;
}

function getSuggestionPriority(item, today) {
  if (item.deadline && item.deadline < today) return 3;
  if (item.action === 'move') return 2;
  return 1;
}

function groupEntriesByTodo(entries) {
  const map = new Map();
  entries.forEach((entry) => {
    if (!map.has(entry.todoId)) map.set(entry.todoId, []);
    map.get(entry.todoId).push(entry);
  });
  return map;
}

function getLoadByDate(entries, dateKeys) {
  const dateSet = new Set(dateKeys);
  const load = new Map(dateKeys.map((dateKey) => [dateKey, 0]));
  entries.forEach((entry) => {
    if (!dateSet.has(entry.date) || entry.done) return;
    load.set(entry.date, (load.get(entry.date) || 0) + 1);
  });
  return load;
}

function getCurrentWeekDateKeys(now) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  return getNextDateKeys(start, 7);
}

function getNextDateKeys(now, count) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return toDateKey(date);
  });
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
