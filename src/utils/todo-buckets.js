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

export function getTodoBucket(deadline, now = new Date()) {
  if (!deadline) return 'other';

  const due = parseLocalDate(deadline);
  if (!due) return 'other';

  const today = getDateAtStart(now);
  const endOfWeek = getEndOfWeek(today);
  const endOfMonth = getEndOfMonth(today);

  if (due.getTime() === today.getTime()) return 'today';
  if (due > today && due <= endOfWeek) return 'week';
  if (due > endOfWeek && due <= endOfMonth) return 'month';
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

function hasDateInRange(dates, start, end) {
  return dates.some((dateKey) => {
    const date = parseLocalDate(dateKey);
    return date && date >= start && date <= end;
  });
}

export function buildTodoSectionsFromSchedule(todos, scheduleEntries, now = new Date()) {
  const sections = {
    today: [],
    week: [],
    month: [],
    other: [],
  };

  const today = getDateAtStart(now);
  const endOfWeek = getEndOfWeek(today);
  const endOfMonth = getEndOfMonth(today);

  const dateMap = new Map();
  scheduleEntries.forEach((entry) => {
    if (!dateMap.has(entry.todoId)) dateMap.set(entry.todoId, []);
    dateMap.get(entry.todoId).push(entry.date);
  });

  todos.forEach((todo) => {
    const dates = dateMap.get(todo.id) || [];

    if (hasDateInRange(dates, today, today)) {
      sections.today.push(todo);
      return;
    }
    if (hasDateInRange(dates, new Date(today.getTime() + 86400000), endOfWeek)) {
      sections.week.push(todo);
      return;
    }
    if (hasDateInRange(dates, new Date(endOfWeek.getTime() + 86400000), endOfMonth)) {
      sections.month.push(todo);
      return;
    }
    sections.other.push(todo);
  });

  return sections;
}
