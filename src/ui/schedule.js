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
import { markStateDirty, scheduleSync } from '../sync/cloud.js';

// ── 내부 상태 ─────────────────────────────────────
let _onRender = null;
let _taskFilter = 'all'; // 'all' | 'active' | 'done'

// ── 진행률 계산 ───────────────────────────────────
function getProgress(todoId) {
  const entries = state.scheduleEntries.filter((e) => e.todoId === todoId);
  if (entries.length === 0) return { total: 0, done: 0, percent: 0 };
  const done = entries.filter((e) => e.done).length;
  return { total: entries.length, done, percent: Math.round((done / entries.length) * 100) };
}

// ── 업무 추가 ─────────────────────────────────────
export function addScheduleTask(text, project, deadline, difficulty) {
  const now = nowISO();
  const todo = {
    id: uid(),
    text,
    done: false,
    project: project || null,
    sourceNoteId: null,
    difficulty: difficulty || '중',
    deadline: deadline || null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    scheduledDates: [], // 하위 호환 (사용 안 함 – scheduleEntries로 관리)
  };
  state.todos.push(todo);
  save();
  markStateDirty(); scheduleSync();
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

// ── 날짜에서 업무 제거 ────────────────────────────
function removeFromDate(entryId) {
  state.scheduleEntries = state.scheduleEntries.filter((e) => e.id !== entryId);
  save();
  markStateDirty(); scheduleSync();
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

// ── 업무 전체 완료 토글 ───────────────────────────
function toggleTaskDone(todoId) {
  const todo = state.todos.find((t) => t.id === todoId);
  if (!todo) return;
  todo.done = !todo.done;
  todo.completedAt = todo.done ? nowISO() : null;
  todo.updatedAt = nowISO();

  // 연관 entries도 동기화
  state.scheduleEntries
    .filter((e) => e.todoId === todoId)
    .forEach((e) => {
      e.done = todo.done;
      e.completedAt = todo.done ? nowISO() : null;
      e.updatedAt = nowISO();
    });
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

// ── 난이도 뱃지 HTML ──────────────────────────────
function diffBadge(difficulty) {
  if (!difficulty) return '';
  const cls = difficulty === '상' ? 'high' : difficulty === '중' ? 'mid' : 'low';
  return `<span class="schedule-diff-badge ${cls}">${difficulty}</span>`;
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

  let todos = state.todos.filter((t) => !t.sourceNoteId || t.project); // 스케줄용 업무
  // 모든 todos를 스케줄에서도 사용
  todos = state.todos;

  // 필터 적용
  if (_taskFilter === 'active') todos = todos.filter((t) => !t.done);
  if (_taskFilter === 'done') todos = todos.filter((t) => t.done);

  if (todos.length === 0) {
    scheduleTaskListEl.innerHTML = `<li class="schedule-empty">업무가 없습니다.<br>+ 업무 버튼으로 추가하세요.</li>`;
    return;
  }

  // 프로젝트별 그룹
  const groups = {};
  todos.forEach((t) => {
    const key = t.project || '';
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  });

  let html = '';
  Object.entries(groups).forEach(([project, items]) => {
    if (project) {
      html += `<li class="schedule-task-group-label">${project}</li>`;
    }
    items.forEach((todo) => {
      const prog = getProgress(todo.id);
      const doneClass = todo.done ? 'done-task' : '';
      const percent = prog.total > 0 ? prog.percent : (todo.done ? 100 : 0);
      const label = prog.total > 0
        ? `${prog.done}/${prog.total} (${prog.percent}%)`
        : todo.done ? '완료' : '미배정';
      html += `
        <li class="schedule-task-card ${doneClass}"
            draggable="true"
            data-todo-id="${todo.id}">
          <div class="schedule-task-card-top">
            <input type="checkbox" class="schedule-task-check"
              data-action="toggle-done" data-todo-id="${todo.id}"
              ${todo.done ? 'checked' : ''} />
            <span class="schedule-task-name">${escapeHtml(todo.text)}</span>
            <button class="schedule-task-delete" data-action="delete" data-todo-id="${todo.id}" title="삭제">✕</button>
          </div>
          <div class="schedule-task-meta">
            ${diffBadge(todo.difficulty)}
            ${deadlineLabel(todo.deadline)}
            ${todo.project ? `<span class="schedule-task-project">${escapeHtml(todo.project)}</span>` : ''}
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
  // 완료 체크
  scheduleTaskListEl.querySelectorAll('[data-action="toggle-done"]').forEach((el) => {
    el.addEventListener('change', () => {
      toggleTaskDone(el.dataset.todoId);
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

  // 드래그 시작
  scheduleTaskListEl.querySelectorAll('.schedule-task-card[draggable]').forEach((card) => {
    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', card.dataset.todoId);
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

  const dayNames = ['월', '화', '수', '목', '금', '토', '일'];

  let html = '<div class="week-grid">';
  weekDates.forEach((date, i) => {
    const dateKey = toDateKey(date);
    const todayClass = isToday(dateKey) ? 'today' : '';
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
          <div class="cal-chip ${doneClass}" data-entry-id="${entry.id}">
            <input type="checkbox" class="cal-chip-check"
              data-action="toggle-entry" data-entry-id="${entry.id}"
              ${entry.done ? 'checked' : ''} />
            <span class="cal-chip-text" title="${escapeHtml(todo.text)}">${escapeHtml(todo.text)}</span>
            <button class="cal-chip-remove" data-action="remove-entry" data-entry-id="${entry.id}" title="날짜에서 제거">✕</button>
          </div>`;
      });
    }

    html += `
      <div class="week-day-col ${todayClass}"
           data-date="${dateKey}">
        <div class="week-day-header">
          <div class="week-day-name">${dayNames[i]}</div>
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
  const dayNames = ['월', '화', '수', '목', '금', '토', '일'];

  let html = '<div class="month-grid">';

  // 요일 헤더
  html += '<div class="month-day-names">';
  dayNames.forEach((n) => {
    html += `<div class="month-day-name-cell">${n}</div>`;
  });
  html += '</div>';

  grid.forEach((week) => {
    html += '<div class="month-week-row">';
    week.forEach((date) => {
      const dateKey = toDateKey(date);
      const otherClass = !isSameMonth(date, year, month) ? 'other-month' : '';
      const todayClass = isToday(dateKey) ? 'today' : '';
      const entries = state.scheduleEntries.filter((e) => e.date === dateKey);
      const MAX_CHIPS = 3;

      let chipsHtml = '';
      entries.slice(0, MAX_CHIPS).forEach((entry) => {
        const todo = state.todos.find((t) => t.id === entry.todoId);
        if (!todo) return;
        const doneClass = entry.done ? 'chip-done' : '';
        chipsHtml += `<div class="month-chip ${doneClass}" title="${escapeHtml(todo.text)}">${escapeHtml(todo.text)}</div>`;
      });
      if (entries.length > MAX_CHIPS) {
        chipsHtml += `<div class="month-chip-more">+${entries.length - MAX_CHIPS}개</div>`;
      }

      html += `
        <div class="month-day-cell ${otherClass} ${todayClass}"
             data-date="${dateKey}">
          <div class="month-day-num">${date.getDate()}</div>
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
      const todoId = e.dataTransfer.getData('text/plain');
      const dateKey = zone.dataset.date || zone.closest('[data-date]')?.dataset.date;
      if (todoId && dateKey) {
        assignToDate(todoId, dateKey);
        if (_onRender) _onRender();
      }
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
