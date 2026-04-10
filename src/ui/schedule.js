import { state, uid, nowISO, save } from '../state/store.js';
import {
  scheduleTaskListEl,
  scheduleCalendarBodyEl,
  scheduleRangeLabelEl,
  schedulePrevBtn,
  scheduleNextBtn,
} from './dom.js';
import {
  getMonday,
  getWeekDates,
  getMonthGrid,
  toDateKey,
  todayKey,
  isToday,
  getWeekRangeLabel,
  getMonthLabel,
  fromDateKey,
  isSameMonth,
} from '../utils/date-utils.js';
import { getHolidayName, isHoliday, isWeekend } from '../utils/holiday-utils.js';
import { markStateDirty, scheduleSync } from '../sync/cloud.js';
import {
  buildTodoSectionsFromSchedule,
  getMostRecentScheduledDate,
  getTodoSectionCompletion,
  toggleTodoSectionCompletion,
} from '../utils/todo-buckets.js';
import { showScheduleModal } from './schedule-modal.js';

let _onRender = null;
let _taskFilter = 'all';

const DIFFICULTY_CYCLE = ['하', '중', '상'];
const SCHEDULE_SECTIONS = [
  { key: 'today', label: '오늘 할 일' },
  { key: 'week', label: '이번 주 할 일' },
  { key: 'month', label: '이번 달 할 일' },
  { key: 'other', label: '기타 할 일' },
];

function persistAndSync() {
  save();
  markStateDirty();
  scheduleSync();
}

function rerenderSchedule() {
  if (_onRender) _onRender();
}

function syncFilterButtons() {
  document.querySelectorAll('.schedule-filter-btn').forEach((item) => {
    item.classList.toggle('active', item.dataset.filter === _taskFilter);
  });
}

function getProgress(todoId) {
  const entries = state.scheduleEntries.filter((entry) => entry.todoId === todoId);
  if (!entries.length) return { total: 0, done: 0, percent: 0 };
  const done = entries.filter((entry) => entry.done).length;
  return {
    total: entries.length,
    done,
    percent: Math.round((done / entries.length) * 100),
  };
}

export function addScheduleTask(text, deadline, difficulty) {
  const now = nowISO();
  const todo = {
    id: uid(),
    text,
    done: false,
    sourceNoteId: null,
    difficulty: difficulty || '중',
    deadline: deadline || getMostRecentScheduledDate(state.scheduleEntries) || null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    scheduledDates: [],
  };
  state.todos.push(todo);
  if (todo.deadline) {
    assignToDate(todo.id, todo.deadline);
  } else {
    persistAndSync();
  }
  return todo.id;
}

function assignToDate(todoId, dateKey) {
  const exists = state.scheduleEntries.some(
    (entry) => entry.todoId === todoId && entry.date === dateKey,
  );
  if (exists) return;

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
  persistAndSync();
}

export function assignTodoToDate(todoId, dateKey) {
  assignToDate(todoId, dateKey);
}

function removeFromDate(entryId) {
  state.scheduleEntries = state.scheduleEntries.filter((entry) => entry.id !== entryId);
  persistAndSync();
}

function moveEntryToDate(entryId, targetDate) {
  const entry = state.scheduleEntries.find((item) => item.id === entryId);
  if (!entry || entry.date === targetDate) return;

  const exists = state.scheduleEntries.some(
    (item) => item.todoId === entry.todoId && item.date === targetDate,
  );
  if (exists) {
    removeFromDate(entryId);
    return;
  }

  entry.date = targetDate;
  entry.updatedAt = nowISO();
  persistAndSync();
}

function copyEntryToDate(entryId, targetDate) {
  const entry = state.scheduleEntries.find((item) => item.id === entryId);
  if (!entry) return;
  assignToDate(entry.todoId, targetDate);
}

function toggleEntryDone(entryId) {
  const entry = state.scheduleEntries.find((item) => item.id === entryId);
  if (!entry) return;

  entry.done = !entry.done;
  entry.completedAt = entry.done ? nowISO() : null;
  entry.updatedAt = nowISO();

  const allEntries = state.scheduleEntries.filter((item) => item.todoId === entry.todoId);
  const todo = state.todos.find((item) => item.id === entry.todoId);
  if (todo) {
    const done = allEntries.length > 0 && allEntries.every((item) => item.done);
    todo.done = done;
    todo.completedAt = done ? nowISO() : null;
    todo.updatedAt = nowISO();
  }

  persistAndSync();
}

function syncTodoDoneFromEntries(todo) {
  const entries = state.scheduleEntries.filter((entry) => entry.todoId === todo.id);
  if (!entries.length) {
    todo.done = false;
    todo.completedAt = null;
    todo.updatedAt = nowISO();
    return;
  }

  const done = entries.every((entry) => entry.done);
  todo.done = done;
  todo.completedAt = done ? nowISO() : null;
  todo.updatedAt = nowISO();
}

function toggleTaskDone(todoId, sectionKey, checked) {
  const todo = state.todos.find((item) => item.id === todoId);
  if (!todo) return;

  const changedCount = toggleTodoSectionCompletion(
    todoId,
    sectionKey,
    checked,
    state.scheduleEntries,
    nowISO(),
  );

  if (changedCount === 0 && sectionKey === 'other') {
    todo.done = checked;
    todo.completedAt = checked ? nowISO() : null;
    todo.updatedAt = nowISO();
  } else {
    syncTodoDoneFromEntries(todo);
  }

  persistAndSync();
}

function deleteTask(todoId) {
  state.todos = state.todos.filter((todo) => todo.id !== todoId);
  state.scheduleEntries = state.scheduleEntries.filter((entry) => entry.todoId !== todoId);
  persistAndSync();
}

function syncTaskDeadline(todo, nextDeadline) {
  const prevDeadline = todo.deadline || null;
  todo.deadline = nextDeadline || null;
  todo.updatedAt = nowISO();

  if (todo.deadline) {
    const exists = state.scheduleEntries.some(
      (entry) => entry.todoId === todo.id && entry.date === todo.deadline,
    );
    if (!exists) {
      state.scheduleEntries.push({
        id: uid(),
        todoId: todo.id,
        date: todo.deadline,
        done: false,
        completedAt: null,
        createdAt: nowISO(),
        updatedAt: nowISO(),
      });
    }
  } else if (prevDeadline) {
    state.scheduleEntries = state.scheduleEntries.filter((entry) => entry.todoId !== todo.id);
  }
}

async function editTask(todoId) {
  const todo = state.todos.find((item) => item.id === todoId);
  if (!todo) return;

  const result = await showScheduleModal({
    text: todo.text,
    deadline: todo.deadline || '',
    difficulty: todo.difficulty || '중',
  });
  if (!result) return;

  const nextText = (result.text || '').trim();
  if (!nextText) return;

  todo.text = nextText;
  todo.difficulty = result.difficulty || '중';
  syncTaskDeadline(todo, result.deadline || null);
  persistAndSync();
}

function cycleTaskDifficulty(todoId) {
  const todo = state.todos.find((item) => item.id === todoId);
  if (!todo) return;

  const index = DIFFICULTY_CYCLE.indexOf(todo.difficulty);
  todo.difficulty = DIFFICULTY_CYCLE[(index + 1 + DIFFICULTY_CYCLE.length) % DIFFICULTY_CYCLE.length];
  todo.updatedAt = nowISO();
  persistAndSync();
}

function openTaskTextEdit(card, todoId, rerender = rerenderSchedule) {
  const todo = state.todos.find((item) => item.id === todoId);
  if (!todo) return;

  const textEl = card.querySelector('[data-action="edit-text"]');
  if (!textEl) return;

  const input = document.createElement('input');
  input.type = 'text';
  input.value = todo.text;
  input.className = 'schedule-inline-input';
  textEl.replaceWith(input);
  input.focus();
  input.select();

  const commit = () => {
    const nextText = input.value.trim();
    if (nextText && nextText !== todo.text) {
      todo.text = nextText;
      todo.updatedAt = nowISO();
      persistAndSync();
    }
    rerender();
  };

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
    }
    if (event.key === 'Escape') rerender();
  });
}

function openTaskDeadlineEdit(trigger, todoId, rerender = rerenderSchedule) {
  const todo = state.todos.find((item) => item.id === todoId);
  if (!todo) return;

  const input = document.createElement('input');
  input.type = 'date';
  input.value = todo.deadline || '';
  input.className = 'schedule-inline-date-input';
  trigger.replaceWith(input);
  input.focus();

  const commit = () => {
    const oldDeadline = todo.deadline || '';
    const nextDeadline = input.value || null;
    if (oldDeadline !== (nextDeadline || '')) {
      syncTaskDeadline(todo, nextDeadline);
      persistAndSync();
    }
    rerender();
  };

  input.addEventListener('change', commit);
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
    }
    if (event.key === 'Escape') rerender();
  });
}

function diffBadge(todo) {
  const difficulty = todo.difficulty || '하';
  const cls = difficulty === '상' ? 'high' : difficulty === '중' ? 'mid' : 'low';
  return `<button class="schedule-diff-badge ${cls} schedule-inline-badge" data-action="cycle-difficulty" data-todo-id="${todo.id}" type="button" title="난이도 변경">${difficulty}</button>`;
}

function deadlineLabel(todo) {
  if (!todo.deadline) {
    return `<button class="schedule-inline-badge schedule-inline-badge-empty" data-action="edit-deadline" data-todo-id="${todo.id}" type="button" title="기한 입력">기한 없음</button>`;
  }

  const cls = todo.deadline < todayKey() ? 'schedule-deadline-overdue' : '';
  const [, month, day] = todo.deadline.split('-');
  return `<button class="schedule-inline-badge ${cls}" data-action="edit-deadline" data-todo-id="${todo.id}" type="button" title="기한 변경">~${parseInt(month, 10)}/${parseInt(day, 10)}</button>`;
}

function trashIconSvg() {
  return `<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M5.5 5.5A.5.5 0 016 6v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm2.5 0a.5.5 0 01.5.5v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm3 .5a.5.5 0 00-1 0v6a.5.5 0 001 0V6z"/><path fill-rule="evenodd" d="M14.5 3a1 1 0 01-1 1H13v9a2 2 0 01-2 2H5a2 2 0 01-2-2V4h-.5a1 1 0 01-1-1V2a1 1 0 011-1H6a1 1 0 011-1h2a1 1 0 011 1h3.5a1 1 0 011 1v1zM4.118 4L4 4.059V13a1 1 0 001 1h6a1 1 0 001-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z" clip-rule="evenodd"/></svg>`;
}

function editIconSvg() {
  return `<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M12.854 1.646a.5.5 0 0 1 .708 0l.792.792a.5.5 0 0 1 0 .708l-8.5 8.5L4 12l.354-1.854 8.5-8.5zM3.5 13A1.5 1.5 0 0 0 5 14.5h8a.5.5 0 0 0 0-1H5a.5.5 0 0 1-.5-.5V5a.5.5 0 0 0-1 0v8z"/></svg>`;
}

export function renderTaskListInto(targetEl, onRender = rerenderSchedule, options = {}) {
  if (!targetEl) return;

  const {
    draggable = true,
    emptyMessage = '업무가 없습니다.<br>+ 업무 버튼으로 추가하세요.',
  } = options;

  let todos = state.todos;
  if (_taskFilter === 'active') todos = todos.filter((todo) => !todo.done);
  if (_taskFilter === 'done') todos = todos.filter((todo) => todo.done);
  syncFilterButtons();

  if (todos.length === 0) {
    targetEl.innerHTML = `<li class="schedule-empty">${emptyMessage}</li>`;
    return;
  }

  const sorted = [...todos].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  const sectionMap = buildTodoSectionsFromSchedule(sorted, state.scheduleEntries);
  let html = '';

  SCHEDULE_SECTIONS.forEach((section) => {
    const items = sectionMap[section.key] || [];
    const collapsed = state.todoSectionCollapsed?.[section.key] ?? false;

    html += `
      <li class="schedule-task-section-header">
        <button class="schedule-task-section-toggle" data-action="toggle-section" data-section="${section.key}" type="button">
          <span class="schedule-task-section-arrow">${collapsed ? '▸' : '▾'}</span>
          <span class="schedule-task-section-title">${section.label}</span>
          <span class="schedule-task-section-count">${items.length}</span>
        </button>
      </li>
    `;

    if (collapsed) return;
    if (!items.length) {
      html += '<li class="schedule-task-section-empty">항목이 없습니다.</li>';
      return;
    }

    items.forEach((todo) => {
      const progress = getProgress(todo.id);
      const sectionDone = getTodoSectionCompletion(todo.id, section.key, state.scheduleEntries);
      const percent = progress.total > 0 ? progress.percent : (sectionDone ? 100 : 0);
      const label = progress.total > 0
        ? `${progress.done}/${progress.total} (${progress.percent}%)`
        : sectionDone ? '완료' : '미배정';

      html += `
        <li class="schedule-task-card ${sectionDone ? 'done-task' : ''}" ${draggable ? 'draggable="true"' : ''} data-todo-id="${todo.id}">
          <div class="schedule-task-card-head">
            <div class="schedule-task-title-row">
              <input
                type="checkbox"
                class="schedule-task-check"
                data-action="toggle-done"
                data-todo-id="${todo.id}"
                data-section="${section.key}"
                ${sectionDone ? 'checked' : ''}
              />
              <span class="schedule-task-name" data-action="edit-text" title="${escapeHtml(todo.text)}">${escapeHtml(todo.text)}</span>
            </div>
            <div class="schedule-task-actions">
              <button class="schedule-task-edit" data-action="edit-inline" data-todo-id="${todo.id}" title="텍스트 수정">${editIconSvg()}</button>
              <button class="schedule-task-delete" data-action="delete" data-todo-id="${todo.id}" title="업무 삭제">${trashIconSvg()}</button>
            </div>
          </div>
          <div class="schedule-task-meta">
            <div class="schedule-task-badges">
              ${deadlineLabel(todo)}
              ${diffBadge(todo)}
            </div>
            <span class="schedule-progress-text">${label}</span>
          </div>
          <div class="schedule-task-progress">
            <div class="schedule-progress-bar-wrap">
              <div class="schedule-progress-bar-fill" style="width:${percent}%"></div>
            </div>
          </div>
        </li>
      `;
    });
  });

  targetEl.innerHTML = html;
  bindTaskListEvents(targetEl, onRender, { draggable });
}

export function renderTaskList() {
  renderTaskListInto(scheduleTaskListEl, rerenderSchedule, { draggable: true });
}

function bindTaskListEvents(targetEl, onRender, options = {}) {
  const { draggable = true } = options;

  targetEl.querySelectorAll('[data-action="toggle-section"]').forEach((el) => {
    el.addEventListener('click', () => {
      const key = el.dataset.section;
      state.todoSectionCollapsed[key] = !state.todoSectionCollapsed[key];
      persistAndSync();
      onRender();
    });
  });

  targetEl.querySelectorAll('[data-action="toggle-done"]').forEach((el) => {
    el.addEventListener('change', () => {
      toggleTaskDone(el.dataset.todoId, el.dataset.section, el.checked);
      onRender();
    });
  });

  targetEl.querySelectorAll('[data-action="delete"]').forEach((el) => {
    el.addEventListener('click', (event) => {
      event.stopPropagation();
      if (!confirm('이 업무를 삭제할까요?')) return;
      deleteTask(el.dataset.todoId);
      onRender();
    });
  });

  targetEl.querySelectorAll('[data-action="edit-inline"]').forEach((el) => {
    el.addEventListener('click', (event) => {
      event.stopPropagation();
      const card = el.closest('.schedule-task-card');
      if (!card) return;
      openTaskTextEdit(card, el.dataset.todoId, onRender);
    });
  });

  targetEl.querySelectorAll('[data-action="edit-text"]').forEach((el) => {
    el.addEventListener('dblclick', (event) => {
      event.stopPropagation();
      const card = el.closest('.schedule-task-card');
      if (!card) return;
      openTaskTextEdit(card, card.dataset.todoId, onRender);
    });
  });

  targetEl.querySelectorAll('[data-action="cycle-difficulty"]').forEach((el) => {
    el.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      cycleTaskDifficulty(el.dataset.todoId);
      onRender();
    });
  });

  targetEl.querySelectorAll('[data-action="edit-deadline"]').forEach((el) => {
    el.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openTaskDeadlineEdit(el, el.dataset.todoId, onRender);
    });
  });

  if (!draggable) return;

  targetEl.querySelectorAll('.schedule-task-card[draggable]').forEach((card) => {
    card.addEventListener('dragstart', (event) => {
      event.dataTransfer.setData('application/x-schedule-drag', JSON.stringify({
        type: 'todo',
        todoId: card.dataset.todoId,
      }));
      event.dataTransfer.effectAllowed = 'copy';
      card.classList.add('dragging');
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
    });
  });
}

export function renderWeekView() {
  if (!scheduleCalendarBodyEl || !scheduleRangeLabelEl) return;

  const monday = fromDateKey(state.scheduleWeekStart);
  const weekDates = getWeekDates(monday);
  scheduleRangeLabelEl.textContent = getWeekRangeLabel(weekDates);

  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  let html = '<div class="week-grid">';

  weekDates.forEach((date, index) => {
    const dateKey = toDateKey(date);
    const todayClass = isToday(dateKey) ? 'today' : '';
    const weekendClass = isWeekend(date) ? 'weekend' : '';
    const holidayClass = isHoliday(date) ? 'holiday' : '';
    const weekdayClass = index === 0 ? 'sunday' : index === 6 ? 'saturday' : '';
    const holidayName = getHolidayName(date);
    const entries = state.scheduleEntries.filter((entry) => entry.date === dateKey);

    let chipsHtml = '';
    if (entries.length === 0) {
      chipsHtml = '<span class="week-drop-hint">여기에 드롭</span>';
    } else {
      entries.forEach((entry) => {
        const todo = state.todos.find((item) => item.id === entry.todoId);
        if (!todo) return;
        chipsHtml += `
          <div class="cal-chip ${entry.done ? 'chip-done' : ''}" data-entry-id="${entry.id}" data-todo-id="${todo.id}" draggable="true">
            <input type="checkbox" class="cal-chip-check" data-action="toggle-entry" data-entry-id="${entry.id}" ${entry.done ? 'checked' : ''} />
            <span class="cal-chip-text" title="${escapeHtml(todo.text)}">${escapeHtml(todo.text)}</span>
            <button class="cal-chip-remove" data-action="remove-entry" data-entry-id="${entry.id}" title="날짜에서 제거">${trashIconSvg()}</button>
          </div>
        `;
      });
    }

    html += `
      <div class="week-day-col ${todayClass} ${weekendClass} ${holidayClass} ${weekdayClass}" data-date="${dateKey}">
        <div class="week-day-header ${weekdayClass}" title="${holidayName || ''}">
          <div class="week-day-name">${dayNames[index]}</div>
          <div class="week-day-num">${date.getDate()}</div>
        </div>
        <div class="week-day-drop-zone" data-date="${dateKey}">
          ${chipsHtml}
        </div>
      </div>
    `;
  });

  html += '</div>';
  scheduleCalendarBodyEl.innerHTML = html;
  bindCalendarEvents();
}

export function renderMonthView() {
  if (!scheduleCalendarBodyEl || !scheduleRangeLabelEl) return;

  const [year, month] = state.scheduleMonth.split('-').map(Number);
  scheduleRangeLabelEl.textContent = getMonthLabel(year, month);

  const grid = getMonthGrid(year, month);
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  let html = '<div class="month-grid">';

  html += '<div class="month-day-names">';
  dayNames.forEach((name, index) => {
    const weekdayClass = index === 0 ? 'sun' : index === 6 ? 'sat' : '';
    html += `<div class="month-day-name-cell ${weekdayClass}">${name}</div>`;
  });
  html += '</div>';

  grid.forEach((week) => {
    html += '<div class="month-week-row">';

    week.forEach((date) => {
      const dateKey = toDateKey(date);
      const otherClass = !isSameMonth(date, year, month) ? 'other-month' : '';
      const todayClass = isToday(dateKey) ? 'today' : '';
      const weekendClass = isWeekend(date) ? 'weekend' : '';
      const holidayClass = isHoliday(date) ? 'holiday' : '';
      const dayIndex = date.getDay();
      const weekdayClass = dayIndex === 0 ? 'sunday' : dayIndex === 6 ? 'saturday' : '';
      const holidayName = getHolidayName(date);
      const entries = state.scheduleEntries.filter((entry) => entry.date === dateKey);
      const maxChips = 3;

      let chipsHtml = '';
      entries.slice(0, maxChips).forEach((entry) => {
        const todo = state.todos.find((item) => item.id === entry.todoId);
        if (!todo) return;
        chipsHtml += `
          <div class="month-chip ${entry.done ? 'chip-done' : ''}" data-entry-id="${entry.id}" data-todo-id="${todo.id}" draggable="true">
            <input type="checkbox" class="month-chip-check" data-action="toggle-entry" data-entry-id="${entry.id}" ${entry.done ? 'checked' : ''} />
            <span class="month-chip-text" title="${escapeHtml(todo.text)}">${escapeHtml(todo.text)}</span>
            <button class="month-chip-remove" data-action="remove-entry" data-entry-id="${entry.id}" title="날짜에서 제거">${trashIconSvg()}</button>
          </div>
        `;
      });

      if (entries.length > maxChips) {
        chipsHtml += `<div class="month-chip-more">+${entries.length - maxChips}개</div>`;
      }

      html += `
        <div class="month-day-cell ${otherClass} ${todayClass} ${weekendClass} ${holidayClass} ${weekdayClass}" data-date="${dateKey}">
          <div class="month-day-num ${weekdayClass}" title="${holidayName || ''}">${date.getDate()}</div>
          <div class="month-chips">${chipsHtml}</div>
        </div>
      `;
    });

    html += '</div>';
  });

  html += '</div>';
  scheduleCalendarBodyEl.innerHTML = html;
  bindCalendarEvents();
}

function bindCalendarEvents() {
  function getDragData(dataTransfer) {
    const raw = dataTransfer.getData('application/x-schedule-drag');
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    }
    const todoId = dataTransfer.getData('text/plain');
    return todoId ? { type: 'todo', todoId } : null;
  }

  scheduleCalendarBodyEl.querySelectorAll('[data-date]').forEach((zone) => {
    zone.addEventListener('dragover', (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      zone.closest('[data-date]')?.classList.add('drag-over');
    });

    zone.addEventListener('dragleave', (event) => {
      if (!zone.contains(event.relatedTarget)) {
        zone.closest('[data-date]')?.classList.remove('drag-over');
      }
    });

    zone.addEventListener('drop', (event) => {
      event.preventDefault();
      zone.closest('[data-date]')?.classList.remove('drag-over');
      const dragData = getDragData(event.dataTransfer);
      const dateKey = zone.dataset.date || zone.closest('[data-date]')?.dataset.date;
      if (!dragData || !dateKey) return;

      if (dragData.type === 'todo' && dragData.todoId) {
        assignToDate(dragData.todoId, dateKey);
      }
      if (dragData.type === 'entry' && dragData.entryId) {
        if (event.ctrlKey || event.metaKey) copyEntryToDate(dragData.entryId, dateKey);
        else moveEntryToDate(dragData.entryId, dateKey);
      }

      rerenderSchedule();
    });
  });

  scheduleCalendarBodyEl.querySelectorAll('.week-day-col, .month-day-cell').forEach((cell) => {
    cell.addEventListener('dblclick', async (event) => {
      if (event.target.closest('.cal-chip, .month-chip, [data-action]')) return;
      const dateKey = cell.dataset.date;
      if (!dateKey) return;

      const result = await showScheduleModal({ deadline: dateKey, difficulty: '중' });
      if (!result) return;

      addScheduleTask(
        result.text,
        result.deadline || dateKey,
        result.difficulty || '중',
      );
      rerenderSchedule();
    });
  });

  scheduleCalendarBodyEl.querySelectorAll('.cal-chip, .month-chip').forEach((chip) => {
    chip.addEventListener('dblclick', async (event) => {
      if (event.target.closest('[data-action="toggle-entry"], [data-action="remove-entry"]')) return;
      event.stopPropagation();
      await editTask(chip.dataset.todoId);
      rerenderSchedule();
    });
  });

  scheduleCalendarBodyEl.querySelectorAll('.cal-chip[draggable], .month-chip[draggable]').forEach((chip) => {
    chip.addEventListener('dragstart', (event) => {
      event.stopPropagation();
      event.dataTransfer.setData('application/x-schedule-drag', JSON.stringify({
        type: 'entry',
        entryId: chip.dataset.entryId,
      }));
      event.dataTransfer.effectAllowed = 'copyMove';
      chip.classList.add('dragging');
    });

    chip.addEventListener('dragend', () => {
      chip.classList.remove('dragging');
    });
  });

  scheduleCalendarBodyEl.querySelectorAll('[data-action="toggle-entry"]').forEach((el) => {
    el.addEventListener('change', () => {
      toggleEntryDone(el.dataset.entryId);
      rerenderSchedule();
    });
  });

  scheduleCalendarBodyEl.querySelectorAll('[data-action="remove-entry"]').forEach((el) => {
    el.addEventListener('click', (event) => {
      event.stopPropagation();
      removeFromDate(el.dataset.entryId);
      rerenderSchedule();
    });
  });
}

function prevWeek() {
  const date = fromDateKey(state.scheduleWeekStart);
  date.setDate(date.getDate() - 7);
  state.scheduleWeekStart = toDateKey(date);
  save();
}

function nextWeek() {
  const date = fromDateKey(state.scheduleWeekStart);
  date.setDate(date.getDate() + 7);
  state.scheduleWeekStart = toDateKey(date);
  save();
}

function prevMonth() {
  const [year, month] = state.scheduleMonth.split('-').map(Number);
  const date = new Date(year, month - 2, 1);
  state.scheduleMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  save();
}

function nextMonth() {
  const [year, month] = state.scheduleMonth.split('-').map(Number);
  const date = new Date(year, month, 1);
  state.scheduleMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  save();
}

export function renderSchedule(onRender) {
  _onRender = onRender;

  if (!state.scheduleWeekStart) {
    state.scheduleWeekStart = toDateKey(getMonday(new Date()));
  }
  if (!state.scheduleMonth) {
    state.scheduleMonth = todayKey().slice(0, 7);
  }

  renderTaskList();

  if (state.scheduleView === 'month') {
    renderMonthView();
  } else {
    renderWeekView();
  }

  document.querySelectorAll('.schedule-view-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === state.scheduleView);
  });
}

export function initScheduleNav(onRender) {
  schedulePrevBtn?.addEventListener('click', () => {
    if (state.scheduleView === 'week') prevWeek();
    else prevMonth();
    renderSchedule(onRender);
  });

  scheduleNextBtn?.addEventListener('click', () => {
    if (state.scheduleView === 'week') nextWeek();
    else nextMonth();
    renderSchedule(onRender);
  });

  document.querySelectorAll('.schedule-view-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.scheduleView = btn.dataset.view;
      save();
      renderSchedule(onRender);
    });
  });

  document.querySelectorAll('.schedule-filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      _taskFilter = btn.dataset.filter;
      syncFilterButtons();
      onRender();
    });
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
