function parseLocalDate(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function getDateAtStart(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function getEndOfWeek(date) {
  const current = getDateAtStart(date);
  const day = current.getDay();
  const offset = day === 0 ? 0 : 7 - day;
  current.setDate(current.getDate() + offset);
  return current;
}

function getEndOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function getSectionRanges(now = new Date()) {
  const today = getDateAtStart(now);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const endOfWeek = getEndOfWeek(today);
  const nextWeekStart = new Date(endOfWeek);
  nextWeekStart.setDate(endOfWeek.getDate() + 1);

  const endOfMonth = getEndOfMonth(today);

  return {
    today: { start: today, end: today },
    week: { start: tomorrow, end: endOfWeek },
    month: { start: nextWeekStart, end: endOfMonth },
  };
}

function hasDateInRange(dates, start, end) {
  return dates.some((dateKey) => {
    const date = parseLocalDate(dateKey);
    return date && date >= start && date <= end;
  });
}

export function getMostRecentScheduledDate(scheduleEntries) {
  if (!Array.isArray(scheduleEntries) || scheduleEntries.length === 0) return null;

  const sorted = [...scheduleEntries]
    .filter((entry) => entry.date)
    .sort((a, b) => {
      const left = a.createdAt || a.updatedAt || '';
      const right = b.createdAt || b.updatedAt || '';
      return left < right ? 1 : -1;
    });

  return sorted[0]?.date || null;
}

export function getTodoBucket(deadline, now = new Date()) {
  if (!deadline) return 'other';

  const due = parseLocalDate(deadline);
  if (!due) return 'other';

  const { today, week, month } = getSectionRanges(now);

  if (due.getTime() === today.start.getTime()) return 'today';
  if (due >= week.start && due <= week.end) return 'week';
  if (due >= month.start && due <= month.end) return 'month';
  return 'other';
}

export function buildTodoSections(todos, now = new Date()) {
  const sections = {
    today: [],
    week: [],
    month: [],
    other: [],
  };

  todos.forEach((todo) => {
    const key = getTodoBucket(todo.deadline, now);
    sections[key].push(todo);
  });

  return sections;
}

export function buildTodoSectionsFromSchedule(todos, scheduleEntries, now = new Date()) {
  const sections = {
    today: [],
    week: [],
    month: [],
    other: [],
  };

  const ranges = getSectionRanges(now);

  const dateMap = new Map();
  scheduleEntries.forEach((entry) => {
    if (!dateMap.has(entry.todoId)) dateMap.set(entry.todoId, []);
    dateMap.get(entry.todoId).push(entry.date);
  });

  todos.forEach((todo) => {
    const dates = dateMap.get(todo.id) || [];
    let included = false;

    if (hasDateInRange(dates, ranges.today.start, ranges.today.end)) {
      sections.today.push(todo);
      included = true;
    }
    if (hasDateInRange(dates, ranges.week.start, ranges.week.end)) {
      sections.week.push(todo);
      included = true;
    }
    if (hasDateInRange(dates, ranges.month.start, ranges.month.end)) {
      sections.month.push(todo);
      included = true;
    }

    if (!included) {
      sections.other.push(todo);
    }
  });

  return sections;
}

export function getTodoSectionCompletion(todoId, sectionKey, scheduleEntries, now = new Date()) {
  const entries = scheduleEntries.filter((entry) => entry.todoId === todoId);
  if (!entries.length) return false;

  const ranges = getSectionRanges(now);
  if (sectionKey === 'other') {
    const inKnownRange = entries.some((entry) => {
      const date = parseLocalDate(entry.date);
      if (!date) return false;
      return (date >= ranges.today.start && date <= ranges.today.end)
        || (date >= ranges.week.start && date <= ranges.week.end)
        || (date >= ranges.month.start && date <= ranges.month.end);
    });

    if (inKnownRange) return false;
    return entries.every((entry) => entry.done);
  }

  const range = ranges[sectionKey];
  if (!range) return false;

  const targetEntries = entries.filter((entry) => {
    const date = parseLocalDate(entry.date);
    return date && date >= range.start && date <= range.end;
  });

  if (!targetEntries.length) return false;
  return targetEntries.every((entry) => entry.done);
}

export function toggleTodoSectionCompletion(todoId, sectionKey, checked, scheduleEntries, timestamp = null, now = new Date()) {
  const ranges = getSectionRanges(now);
  const nowValue = timestamp || new Date().toISOString();

  const targets = scheduleEntries.filter((entry) => {
    if (entry.todoId !== todoId) return false;
    const date = parseLocalDate(entry.date);
    if (!date) return false;

    if (sectionKey === 'other') {
      const inKnownRange = (date >= ranges.today.start && date <= ranges.today.end)
        || (date >= ranges.week.start && date <= ranges.week.end)
        || (date >= ranges.month.start && date <= ranges.month.end);
      return !inKnownRange;
    }

    const range = ranges[sectionKey];
    if (!range) return false;
    return date >= range.start && date <= range.end;
  });

  targets.forEach((entry) => {
    entry.done = checked;
    entry.completedAt = checked ? nowValue : null;
    entry.updatedAt = nowValue;
  });

  return targets.length;
}
