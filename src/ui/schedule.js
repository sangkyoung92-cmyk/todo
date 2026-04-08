/**
 * 스케줄 탭 - 메인 UI 모듈
 * 백로그(업무 목록) + 캘린더(주간/월간) 렌더링 및 드래그앤드롭
 */

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
  formatDateKR,
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

// ── 내부 상태 ─────────────────────────────────────
let _onRender = null;
let _taskFilter = 'all'; // 'all' | 'active' | 'done'
const SCHEDULE_SECTIONS = [
  { key: 'today', label: '오늘 할 일' },
  { key: 'week', label: '이번 주 할 일' },
  { key: 'month', label: '이번 달 할 일' },
  { key: 'other', label: '기타 할 일' },
];

// ── 진행률 계산 ───────────────────────────────────
function getProgress(todoId) {
  const entries = state.scheduleEntries.filter((e) => e.todoId === todoId);
  if (entries.length === 0) return { total: 0, done: 0, percent: 0 };
  const done = entries.filter((e) => e.done).length;
  return { total: entries.length, done, percent: Math.round((done / entries.length) * 100) };
}

// ── 업무 추가 ─────────────────────────────────────
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
    scheduledDates: [], // 하위 호환 (사용 안 함 – scheduleEntries로 관리)
  };
  state.todos.push(todo);
  if (todo.deadline) {
    assignToDate(todo.id, todo.deadline);
  } else {
    save();
    markStateDirty(); scheduleSync();
  }
  return todo.id;
}

// ── 날짜에 업무 배정 ──────────────────────────────
function assignToDate(todoId, dateKey) {
  const exists = state.scheduleEntries.some(
    (e) => e.todoId === todoId && e.date === dateKey,
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
  save();
  markStateDirty(); scheduleSync();
}

export function assignTodoToDate(todoId, dateKey) {
  assignToDate(todoId, dateKey);
}

// ── 날짜에서 업무 제거 ────────────────────────────
function removeFromDate(entryId) {
  state.scheduleEntries = state.scheduleEntries.filter((e) => e.id !== entryId);
  save();
  markStateDirty(); scheduleSync();
}

function moveEntryToDate(entryId, targetDate) {
  const entry = state.scheduleEntries.find((e) => e.id === entryId);
  if (!entry) return;
  if (entry.date === targetDate) return;

  const exists = state.scheduleEntries.some(
    (e) => e.todoId === entry.todoId && e.date === targetDate,
  );
  if (exists) {
    // 이미 같은 할 일이 같은 날짜에 있으면 이동 대신 기존 엔트리 제거
    removeFromDate(entryId);
    return;
  }

  entry.date = targetDate;
  entry.updatedAt = nowISO();
  save();
  markStateDirty(); scheduleSync();
}

function copyEntryToDate(entryId, targetDate) {
  const entry = state.scheduleEntries.find((e) => e.id === entryId);
  if (!entry) return;
  assignToDate(entry.todoId, targetDate);
}

// ── 날짜별 완료 토글 ──────────────────────────────
function toggleEntryDone(entryId) {
  const entry = state.scheduleEntries.find((e) => e.id === entryId);
  if (!entry) return;
  entry.done = !entry.done;
  entry.completedAt = entry.done ? nowISO() : null;
  entry.updatedAt = nowISO();

  // 모든 날짜가 완료되면 todo.done도 true
  const allEntries = state.scheduleEntries.filter((e) => e.todoId === entry.todoId);
  if (allEntries.length > 0 && allEntries.every((e) => e.done)) {
    const todo = state.todos.find((t) => t.id === entry.todoId);
    if (todo) { todo.done = true; todo.completedAt = nowISO(); todo.updatedAt = nowISO(); }
  } else {
    const todo = state.todos.find((t) => t.id === entry.todoId);
    if (todo && todo.done) { todo.done = false; todo.completedAt = null; todo.updatedAt = nowISO(); }
  }
  save();
  markStateDirty(); scheduleSync();
}

// ── 섹션 범위 완료 토글 ───────────────────────
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
  const todo = state.todos.find((t) => t.id === todoId);
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

  save();
  markStateDirty(); scheduleSync();
}

// ── 업무 삭제 ─────────────────────────────────────
function deleteTask(todoId) {
  state.todos = state.todos.filter((t) => t.id !== todoId);
  state.scheduleEntries = state.scheduleEntries.filter((e) => e.todoId !== todoId);
  save();
  markStateDirty(); scheduleSync();
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

  const prevDeadline = todo.deadline;
  todo.text = nextText;
  todo.difficulty = result.difficulty || '중';
  todo.deadline = result.deadline || null;
  todo.updatedAt = nowISO();

  if (todo.deadline) {
    assignToDate(todo.id, todo.deadline);
  } else if (prevDeadline) {
    state.scheduleEntries = state.scheduleEntries.filter((entry) => entry.todoId !== todo.id);
  }

  save();
  markStateDirty(); scheduleSync();
}

// ── 난이도 뱃지 HTML ──────────────────────────────
function diffBadge(difficulty) {
  if (!difficulty) return '';
  const cls = difficulty === '상' ? 'high' : difficulty === '중' ? 'mid' : 'low';
  return `<span class="schedule-diff-badge ${cls}">${difficulty}</span>`;
}

function trashIconSvg() {
  return `<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M5.5 5.5A.5.5 0 016 6v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm2.5 0a.5.5 0 01.5.5v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm3 .5a.5.5 0 00-1 0v6a.5.5 0 001 0V6z"/><path fill-rule="evenodd" d="M14.5 3a1 1 0 01-1 1H13v9a2 2 0 01-2 2H5a2 2 0 01-2-2V4h-.5a1 1 0 01-1-1V2a1 1 0 011-1H6a1 1 0 011-1h2a1 1 0 011 1h3.5a1 1 0 011 1v1zM4.118 4L4 4.059V13a1 1 0 001 1h6a1 1 0 001-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z" clip-rule="evenodd"/></svg>`;
}

function editIconSvg() {
  return `<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M12.854 1.646a.5.5 0 0 1 .708 0l.792.792a.5.5 0 0 1 0 .708l-8.5 8.5L4 12l.354-1.854 8.5-8.5zM3.5 13A1.5 1.5 0 0 0 5 14.5h8a.5.5 0 0 0 0-1H5a.5.5 0 0 1-.5-.5V5a.5.5 0 0 0-1 0v8z"/></svg>`;
}

// ── 기한 포맷 ─────────────────────────────────────
function deadlineLabel(deadline) {
  if (!deadline) return '';
  const today = todayKey();
  const cls = deadline < today ? 'schedule-deadline-overdue' : '';
  const [, m, d] = deadline.split('-');
  return `<span class="${cls}">~${parseInt(m)}/${parseInt(d)}</span>`;
}

// ── 백로그 렌더링 ─────────────────────────────────
export function renderTaskList() {
  if (!scheduleTaskListEl) return;

  let todos = state.todos;

  // 필터 적용
  if (_taskFilter === 'active') todos = todos.filter((t) => !t.done);
  if (_taskFilter === 'done') todos = todos.filter((t) => t.done);

  if (todos.length === 0) {
    scheduleTaskListEl.innerHTML = `<li class="schedule-empty">업무가 없습니다.<br>+ 업무 버튼으로 추가하세요.</li>`;
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
      const prog = getProgress(todo.id);
      const sectionDone = getTodoSectionCompletion(todo.id, section.key, state.scheduleEntries);
      const doneClass = sectionDone ? 'done-task' : '';
      const percent = prog.total > 0 ? prog.percent : (sectionDone ? 100 : 0);
      const label = prog.total > 0
        ? `${prog.done}/${prog.total} (${prog.percent}%)`
        : sectionDone ? '완료' : '미배정';
      html += `
        <li class="schedule-task-card ${doneClass}"
            draggable="true"
            data-todo-id="${todo.id}">
          <div class="schedule-task-card-top">
            <input type="checkbox" class="schedule-task-check"
              data-action="toggle-done" data-todo-id="${todo.id}" data-section="${section.key}"
              ${sectionDone ? 'checked' : ''} />
            <span class="schedule-task-name" title="${escapeHtml(todo.text)}">${escapeHtml(todo.text)}</span>
            <button class="schedule-task-edit" data-action="edit" data-todo-id="${todo.id}" title="수정">${editIconSvg()}</button>
            <button class="schedule-task-delete" data-action="delete" data-todo-id="${todo.id}" title="삭제">${trashIconSvg()}</button>
          </div>
          <div class="schedule-task-meta">
            ${diffBadge(todo.difficulty)}
            ${deadlineLabel(todo.deadline)}
          </div>
          <div class="schedule-task-progress">
            <div class="schedule-progress-label">
              <span>${label}</span>
            </div>
            <div class="schedule-progress-bar-wrap">
              <div class="schedule-progress-bar-fill" style="width:${percent}%"></div>
            </div>
          </div>
        </li>`;
    });
  });

  scheduleTaskListEl.innerHTML = html;
  bindTaskListEvents();
}

function bindTaskListEvents() {
  scheduleTaskListEl.querySelectorAll('[data-action="toggle-section"]').forEach((el) => {
    el.addEventListener('click', () => {
      const key = el.dataset.section;
      state.todoSectionCollapsed[key] = !state.todoSectionCollapsed[key];
      save();
      markStateDirty(); scheduleSync();
      renderTaskList();
    });
  });

  // 완료 체크
  scheduleTaskListEl.querySelectorAll('[data-action="toggle-done"]').forEach((el) => {
    el.addEventListener('change', () => {
      toggleTaskDone(el.dataset.todoId, el.dataset.section, el.checked);
      if (_onRender) _onRender();
    });
  });

  // 삭제
  scheduleTaskListEl.querySelectorAll('[data-action="delete"]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!confirm('이 업무를 삭제할까요?')) return;
      deleteTask(el.dataset.todoId);
      if (_onRender) _onRender();
    });
  });

  // 수정
  scheduleTaskListEl.querySelectorAll('[data-action="edit"]').forEach((el) => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      await editTask(el.dataset.todoId);
      if (_onRender) _onRender();
    });
  });

  // 드래그 시작
  scheduleTaskListEl.querySelectorAll('.schedule-task-card[draggable]').forEach((card) => {
    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('application/x-schedule-drag', JSON.stringify({
        type: 'todo',
        todoId: card.dataset.todoId,
      }));
      e.dataTransfer.effectAllowed = 'copy';
      card.classList.add('dragging');
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
    });
  });
}

// ── 주간 캘린더 렌더링 ────────────────────────────
export function renderWeekView() {
  if (!scheduleCalendarBodyEl || !scheduleRangeLabelEl) return;

  const monday = fromDateKey(state.scheduleWeekStart);
  const weekDates = getWeekDates(monday);
  scheduleRangeLabelEl.textContent = getWeekRangeLabel(weekDates);

  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

  let html = '<div class="week-grid">';
  weekDates.forEach((date, i) => {
    const dateKey = toDateKey(date);
    const todayClass = isToday(dateKey) ? 'today' : '';
    const weekendClass = isWeekend(date) ? 'weekend' : '';
    const holidayClass = isHoliday(date) ? 'holiday' : '';
    const holidayName = getHolidayName(date);
    const entries = state.scheduleEntries.filter((e) => e.date === dateKey);

    let chipsHtml = '';
    if (entries.length === 0) {
      chipsHtml = `<span class="week-drop-hint">여기에 드롭</span>`;
    } else {
      entries.forEach((entry) => {
        const todo = state.todos.find((t) => t.id === entry.todoId);
        if (!todo) return;
        const doneClass = entry.done ? 'chip-done' : '';
        chipsHtml += `
          <div class="cal-chip ${doneClass}" data-entry-id="${entry.id}" draggable="true">
            <input type="checkbox" class="cal-chip-check"
              data-action="toggle-entry" data-entry-id="${entry.id}"
              ${entry.done ? 'checked' : ''} />
            <span class="cal-chip-text" title="${escapeHtml(todo.text)}">${escapeHtml(todo.text)}</span>
            <button class="cal-chip-remove" data-action="remove-entry" data-entry-id="${entry.id}" title="날짜에서 제거">${trashIconSvg()}</button>
          </div>`;
      });
    }

    html += `
      <div class="week-day-col ${todayClass} ${weekendClass} ${holidayClass}"
           data-date="${dateKey}">
        <div class="week-day-header">
          <div class="week-day-name" title="${holidayName || ''}">${dayNames[i]}</div>
          <div class="week-day-num">${date.getDate()}</div>
        </div>
        <div class="week-day-drop-zone" data-date="${dateKey}">
          ${chipsHtml}
        </div>
      </div>`;
  });
  html += '</div>';

  scheduleCalendarBodyEl.innerHTML = html;
  bindCalendarEvents();
}

// ── 월간 캘린더 렌더링 ────────────────────────────
export function renderMonthView() {
  if (!scheduleCalendarBodyEl || !scheduleRangeLabelEl) return;

  const [year, month] = state.scheduleMonth.split('-').map(Number);
  scheduleRangeLabelEl.textContent = getMonthLabel(year, month);

  const grid = getMonthGrid(year, month);
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

  let html = '<div class="month-grid">';

  // 요일 헤더
  html += '<div class="month-day-names">';
  dayNames.forEach((n, i) => {
    const isSun = i === 0;
    const isSat = i === 6;
    const cls = isSun ? 'sun' : isSat ? 'sat' : '';
    html += `<div class="month-day-name-cell ${cls}">${n}</div>`;
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
      const holidayName = getHolidayName(date);
      const entries = state.scheduleEntries.filter((e) => e.date === dateKey);
      const MAX_CHIPS = 3;

      let chipsHtml = '';
      entries.slice(0, MAX_CHIPS).forEach((entry) => {
        const todo = state.todos.find((t) => t.id === entry.todoId);
        if (!todo) return;
        const doneClass = entry.done ? 'chip-done' : '';
        chipsHtml += `
          <div class="month-chip ${doneClass}" data-entry-id="${entry.id}" draggable="true">
            <input type="checkbox" class="month-chip-check"
              data-action="toggle-entry" data-entry-id="${entry.id}"
              ${entry.done ? 'checked' : ''} />
            <span class="month-chip-text" title="${escapeHtml(todo.text)}">${escapeHtml(todo.text)}</span>
            <button class="month-chip-remove" data-action="remove-entry" data-entry-id="${entry.id}" title="날짜에서 제거">${trashIconSvg()}</button>
          </div>`;
      });
      if (entries.length > MAX_CHIPS) {
        chipsHtml += `<div class="month-chip-more">+${entries.length - MAX_CHIPS}개</div>`;
      }

      html += `
        <div class="month-day-cell ${otherClass} ${todayClass} ${weekendClass} ${holidayClass}"
             data-date="${dateKey}">
          <div class="month-day-num" title="${holidayName || ''}">${date.getDate()}</div>
          <div class="month-chips">${chipsHtml}</div>
        </div>`;
    });
    html += '</div>';
  });

  html += '</div>';
  scheduleCalendarBodyEl.innerHTML = html;
  bindCalendarEvents();
}

// ── 캘린더 이벤트 바인딩 ─────────────────────────
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

  // 드롭 존
  scheduleCalendarBodyEl.querySelectorAll('[data-date]').forEach((zone) => {
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      zone.closest('[data-date]')?.classList.add('drag-over');
    });
    zone.addEventListener('dragleave', (e) => {
      if (!zone.contains(e.relatedTarget)) {
        zone.closest('[data-date]')?.classList.remove('drag-over');
      }
    });
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.closest('[data-date]')?.classList.remove('drag-over');
      const dragData = getDragData(e.dataTransfer);
      const dateKey = zone.dataset.date || zone.closest('[data-date]')?.dataset.date;
      if (dragData && dateKey) {
        if (dragData.type === 'todo' && dragData.todoId) {
          assignToDate(dragData.todoId, dateKey);
        }
        if (dragData.type === 'entry' && dragData.entryId) {
          if (e.ctrlKey || e.metaKey) copyEntryToDate(dragData.entryId, dateKey);
          else moveEntryToDate(dragData.entryId, dateKey);
        }
        if (_onRender) _onRender();
      }
    });
  });

  scheduleCalendarBodyEl.querySelectorAll('.week-day-col, .month-day-cell').forEach((cell) => {
    cell.addEventListener('dblclick', async (e) => {
      if (e.target.closest('.cal-chip, .month-chip, [data-action]')) return;
      const dateKey = cell.dataset.date;
      if (!dateKey) return;

      const result = await showScheduleModal({ deadline: dateKey, difficulty: '중' });
      if (!result) return;

      addScheduleTask(
        result.text,
        result.deadline || dateKey,
        result.difficulty || '중',
      );
      if (_onRender) _onRender();
    });
  });

  scheduleCalendarBodyEl.querySelectorAll('.cal-chip[draggable], .month-chip[draggable]').forEach((chip) => {
    chip.addEventListener('dragstart', (e) => {
      e.stopPropagation();
      e.dataTransfer.setData('application/x-schedule-drag', JSON.stringify({
        type: 'entry',
        entryId: chip.dataset.entryId,
      }));
      e.dataTransfer.effectAllowed = 'copyMove';
      chip.classList.add('dragging');
    });
    chip.addEventListener('dragend', () => {
      chip.classList.remove('dragging');
    });
  });

  // 칩 체크(주간 뷰)
  scheduleCalendarBodyEl.querySelectorAll('[data-action="toggle-entry"]').forEach((el) => {
    el.addEventListener('change', () => {
      toggleEntryDone(el.dataset.entryId);
      if (_onRender) _onRender();
    });
  });

  // 칩 제거(주간 뷰)
  scheduleCalendarBodyEl.querySelectorAll('[data-action="remove-entry"]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      removeFromDate(el.dataset.entryId);
      if (_onRender) _onRender();
    });
  });
}

// ── 주/월 네비게이션 ──────────────────────────────
function prevWeek() {
  const d = fromDateKey(state.scheduleWeekStart);
  d.setDate(d.getDate() - 7);
  state.scheduleWeekStart = toDateKey(d);
  save();
}

function nextWeek() {
  const d = fromDateKey(state.scheduleWeekStart);
  d.setDate(d.getDate() + 7);
  state.scheduleWeekStart = toDateKey(d);
  save();
}

function prevMonth() {
  const [y, m] = state.scheduleMonth.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  state.scheduleMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  save();
}

function nextMonth() {
  const [y, m] = state.scheduleMonth.split('-').map(Number);
  const d = new Date(y, m, 1);
  state.scheduleMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  save();
}

// ── 전체 렌더링 ───────────────────────────────────
export function renderSchedule(onRender) {
  _onRender = onRender;

  // 초기값 보정
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

  // 뷰 토글 버튼 동기화
  document.querySelectorAll('.schedule-view-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === state.scheduleView);
  });
}

// ── 네비게이션 버튼 이벤트 초기화 ────────────────
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

  // 뷰 전환 버튼
  document.querySelectorAll('.schedule-view-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.scheduleView = btn.dataset.view;
      save();
      renderSchedule(onRender);
    });
  });

  // 필터 버튼
  document.querySelectorAll('.schedule-filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      _taskFilter = btn.dataset.filter;
      document.querySelectorAll('.schedule-filter-btn').forEach((b) => {
        b.classList.toggle('active', b.dataset.filter === _taskFilter);
      });
      renderTaskList();
    });
  });
}

// ── 유틸 ──────────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
