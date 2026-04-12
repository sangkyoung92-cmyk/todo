import { state, uid, nowISO, save } from '../state/store.js';
import {
  scheduleTaskListEl,
  scheduleCalendarBodyEl,
  scheduleRangeLabelEl,
  schedulePrevBtn,
  scheduleNextBtn,
  plannerPlanListEl,
  plannerInboxListEl,
  plannerPreviewListEl,
  plannerPreviewBtn,
  plannerApplyBtn,
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
  getTodoSectionCompletion,
} from '../../packages/schedule-core/sections.js';
import {
  addTask as addCoreTask,
  assignTaskToDate as assignCoreTaskToDate,
  copyEntryToDate as copyCoreEntryToDate,
  cycleTaskDifficulty as cycleCoreTaskDifficulty,
  deleteTask as deleteCoreTask,
  editTask as editCoreTask,
  getTaskProgress,
  moveEntryToDate as moveCoreEntryToDate,
  removeEntry as removeCoreEntry,
  setTaskDeadline,
  toggleEntryDone as toggleCoreEntryDone,
  toggleTaskSectionDone,
} from '../../packages/schedule-core/tasks.js';
import {
  applyAutoSchedulePreview,
  buildAutoSchedulePreview,
  getPlannerSnapshot,
} from '../../packages/schedule-core/planner.js';
import { showScheduleModal } from './schedule-modal.js';

let onRenderCallback = null;
let taskFilter = 'all';
let pendingPlannerPreview = [];

const SCHEDULE_SECTIONS = [
  { key: 'today', label: '오늘 일정' },
  { key: 'week', label: '이번 주 일정' },
  { key: 'month', label: '이번 달 일정' },
  { key: 'other', label: '기타 일정' },
];

const taskHelpers = { uid, nowISO };

function persistAndSync() {
  save();
  markStateDirty();
  scheduleSync();
}

function rerenderSchedule() {
  if (onRenderCallback) onRenderCallback();
}

function syncFilterButtons() {
  document.querySelectorAll('.schedule-filter-btn').forEach((item) => {
    item.classList.toggle('active', item.dataset.filter === taskFilter);
  });
}

function renderPlanner() {
  renderPlannerSummary();
  renderPlannerInbox();
  renderPlannerPreview();
}

function renderPlannerSummary() {
  if (!plannerPlanListEl) return;
  const snapshot = getPlannerSnapshot(state);
  if (!snapshot.planItems.length) {
    plannerPlanListEl.innerHTML = '<li class="planner-empty">오늘 바로 볼 업무가 없습니다.</li>';
    return;
  }

  plannerPlanListEl.innerHTML = snapshot.planItems.map((item) => `
    <li class="planner-item">
      <div class="planner-item-main">
        <div>
          <span class="planner-item-title">${escapeHtml(item.text)}</span>
          <span class="planner-item-note">${escapeHtml(item.reason)}</span>
        </div>
        <span class="planner-chip ${item.reason === '기한 지남' ? 'planner-chip--urgent' : ''}">${escapeHtml(item.difficulty)}</span>
      </div>
      <div class="planner-item-meta">
        ${item.deadline ? `<span class="planner-chip planner-chip--date">~${formatShortDate(item.deadline)}</span>` : ''}
        <span class="planner-chip">${getPriorityLabel(item.score)}</span>
      </div>
    </li>
  `).join('');
}

function renderPlannerInbox() {
  if (!plannerInboxListEl) return;
  const items = [...(state.todoInbox || [])].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  if (!items.length) {
    plannerInboxListEl.innerHTML = '<li class="planner-empty">검토할 후보가 없습니다. 현재 노트 후보 추출을 눌러보세요.</li>';
    return;
  }

  plannerInboxListEl.innerHTML = items.map((item) => `
    <li class="planner-item" data-inbox-id="${item.id}">
      <label>
        <span class="planner-item-note">업무명</span>
        <input class="planner-inline-input" data-action="edit-inbox-text" value="${escapeHtml(item.text)}" />
      </label>
      <div class="planner-item-meta">
        <input class="planner-inline-date" type="date" data-action="edit-inbox-deadline" value="${escapeHtml(item.deadline || '')}" />
        <select class="planner-inline-select" data-action="edit-inbox-difficulty">
          ${['상', '중', '하'].map((diff) => `<option value="${diff}" ${diff === (item.difficulty || '중') ? 'selected' : ''}>${diff}</option>`).join('')}
        </select>
      </div>
      <div class="planner-item-actions">
        <button class="planner-action-btn" data-action="confirm-inbox" type="button">확정</button>
        <button class="planner-action-btn" data-action="defer-inbox" type="button">나중에</button>
        <button class="planner-action-btn planner-action-btn--danger" data-action="delete-inbox" type="button">삭제</button>
      </div>
    </li>
  `).join('');

  bindPlannerInboxEvents();
}

function renderPlannerPreview() {
  if (!plannerPreviewListEl || !plannerApplyBtn) return;
  plannerApplyBtn.disabled = pendingPlannerPreview.length === 0;

  if (!pendingPlannerPreview.length) {
    const unscheduledCount = getPlannerSnapshot(state).unscheduledTodos.length;
    plannerPreviewListEl.innerHTML = `<li class="planner-empty">미배정 업무 ${unscheduledCount}개. 미리보기를 만들면 여기에 추천 날짜가 표시됩니다.</li>`;
    return;
  }

  plannerPreviewListEl.innerHTML = pendingPlannerPreview.map((item) => `
    <li class="planner-item">
      <div class="planner-item-main">
        <div>
          <span class="planner-item-title">${escapeHtml(item.text)}</span>
          <span class="planner-item-note">${escapeHtml(item.reason)}</span>
        </div>
        <span class="planner-chip planner-chip--date">${formatShortDate(item.date)}</span>
      </div>
      <div class="planner-item-meta">
        <span class="planner-chip">${escapeHtml(item.difficulty)}</span>
        <span class="planner-chip">적용 대기</span>
      </div>
    </li>
  `).join('');
}

function bindPlannerInboxEvents() {
  plannerInboxListEl.querySelectorAll('[data-inbox-id]').forEach((card) => {
    const inboxId = card.dataset.inboxId;
    card.querySelector('[data-action="edit-inbox-text"]')?.addEventListener('change', (event) => {
      updateInboxItem(inboxId, { text: event.target.value });
    });
    card.querySelector('[data-action="edit-inbox-deadline"]')?.addEventListener('change', (event) => {
      updateInboxItem(inboxId, { deadline: event.target.value || null });
    });
    card.querySelector('[data-action="edit-inbox-difficulty"]')?.addEventListener('change', (event) => {
      updateInboxItem(inboxId, { difficulty: event.target.value || '중' });
    });
    card.querySelector('[data-action="confirm-inbox"]')?.addEventListener('click', () => {
      confirmInboxItem(inboxId);
    });
    card.querySelector('[data-action="defer-inbox"]')?.addEventListener('click', () => {
      updateInboxItem(inboxId, { updatedAt: '1970-01-01T00:00:00.000Z' });
      rerenderSchedule();
    });
    card.querySelector('[data-action="delete-inbox"]')?.addEventListener('click', () => {
      deleteInboxItem(inboxId);
    });
  });
}

function updateInboxItem(inboxId, patch) {
  const item = state.todoInbox.find((candidate) => candidate.id === inboxId);
  if (!item) return;
  if (Object.prototype.hasOwnProperty.call(patch, 'text')) {
    const nextText = (patch.text || '').trim();
    if (!nextText) {
      rerenderSchedule();
      return;
    }
    item.text = nextText;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'deadline')) {
    item.deadline = patch.deadline || null;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'difficulty')) {
    item.difficulty = patch.difficulty || '중';
  }
  item.updatedAt = patch.updatedAt || nowISO();
  persistAndSync();
}

function confirmInboxItem(inboxId) {
  const item = state.todoInbox.find((candidate) => candidate.id === inboxId);
  if (!item) return;
  if (state.todos.some((todo) => todo.text === item.text)) {
    alert('이미 같은 이름의 업무가 있습니다.');
    return;
  }

  const todoId = addCoreTask(state, {
    text: item.text,
    sourceNoteId: item.sourceNoteId || null,
    difficulty: item.difficulty || '중',
    deadline: item.deadline || null,
  }, taskHelpers);
  if (!todoId) return;

  state.todoInbox = state.todoInbox.filter((candidate) => candidate.id !== inboxId);
  pendingPlannerPreview = [];
  persistAndSync();
  rerenderSchedule();
}

function deleteInboxItem(inboxId) {
  state.todoInbox = state.todoInbox.filter((candidate) => candidate.id !== inboxId);
  persistAndSync();
  rerenderSchedule();
}

export function addScheduleTask(text, deadline, difficulty) {
  const todoId = addCoreTask(state, {
    text,
    deadline,
    difficulty,
  }, taskHelpers);

  if (!todoId) return null;
  persistAndSync();
  return todoId;
}

export function renderSmartPlanner() {
  renderPlanner();
}

export function clearPlannerPreview() {
  pendingPlannerPreview = [];
  renderPlannerPreview();
}

export function buildPlannerSchedulePreview() {
  pendingPlannerPreview = buildAutoSchedulePreview(state);
  renderPlannerPreview();
}

export function applyPlannerSchedulePreview() {
  const applied = applyAutoSchedulePreview(state, pendingPlannerPreview, taskHelpers);
  pendingPlannerPreview = [];
  if (applied > 0) persistAndSync();
  rerenderSchedule();
  return applied;
}

export function assignTodoToDate(todoId, dateKey) {
  if (!assignCoreTaskToDate(state, todoId, dateKey, taskHelpers)) return;
  persistAndSync();
}

function removeFromDate(entryId) {
  if (!removeCoreEntry(state, entryId)) return;
  persistAndSync();
}

function moveEntryToDate(entryId, targetDate) {
  if (!moveCoreEntryToDate(state, entryId, targetDate, taskHelpers)) return;
  persistAndSync();
}

function copyEntryToDate(entryId, targetDate) {
  if (!copyCoreEntryToDate(state, entryId, targetDate, taskHelpers)) return;
  persistAndSync();
}

function toggleEntryDone(entryId) {
  if (!toggleCoreEntryDone(state, entryId, taskHelpers)) return;
  persistAndSync();
}

function toggleTaskDone(todoId, sectionKey, checked) {
  if (!toggleTaskSectionDone(state, todoId, sectionKey, checked, taskHelpers)) return;
  persistAndSync();
}

function deleteTask(todoId) {
  if (!deleteCoreTask(state, todoId)) return;
  persistAndSync();
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

  if (!editCoreTask(state, todoId, {
    text: nextText,
    difficulty: result.difficulty || '중',
    deadline: result.deadline || null,
  }, taskHelpers)) {
    return;
  }

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
      editCoreTask(state, todoId, { text: nextText }, taskHelpers);
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
      setTaskDeadline(state, todoId, nextDeadline, taskHelpers);
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

function cycleTaskDifficulty(todoId) {
  if (!cycleCoreTaskDifficulty(state, todoId, taskHelpers)) return;
  persistAndSync();
}

function diffBadge(todo) {
  const difficulty = todo.difficulty || '하';
  const cls = difficulty === '상' ? 'high' : difficulty === '중' ? 'mid' : 'low';
  return `<button class="schedule-diff-badge ${cls} schedule-inline-badge" data-action="cycle-difficulty" data-todo-id="${todo.id}" type="button" title="난이도 변경">${difficulty}</button>`;
}

function deadlineLabel(todo) {
  if (!todo.deadline) {
    return '<button class="schedule-inline-badge schedule-inline-badge-empty" data-action="edit-deadline" '
      + `data-todo-id="${todo.id}" type="button" title="기한 입력">기한 없음</button>`;
  }

  const cls = todo.deadline < todayKey() ? 'schedule-deadline-overdue' : '';
  const [, month, day] = todo.deadline.split('-');
  return `<button class="schedule-inline-badge ${cls}" data-action="edit-deadline" `
    + `data-todo-id="${todo.id}" type="button" title="기한 변경">~${parseInt(month, 10)}/${parseInt(day, 10)}</button>`;
}

function trashIconSvg() {
  return '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">'
    + '<path d="M5.5 5.5A.5.5 0 016 6v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm2.5 0a.5.5 0 01.5.5v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm3 .5a.5.5 0 00-1 0v6a.5.5 0 001 0V6z"/>'
    + '<path fill-rule="evenodd" d="M14.5 3a1 1 0 01-1 1H13v9a2 2 0 01-2 2H5a2 2 0 01-2-2V4h-.5a1 1 0 01-1-1V2a1 1 0 011-1H6a1 1 0 011-1h2a1 1 0 011 1h3.5a1 1 0 011 1v1zM4.118 4L4 4.059V13a1 1 0 001 1h6a1 1 0 001-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z" clip-rule="evenodd"/>'
    + '</svg>';
}

function editIconSvg() {
  return '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">'
    + '<path d="M12.854 1.646a.5.5 0 0 1 .708 0l.792.792a.5.5 0 0 1 0 .708l-8.5 8.5L4 12l.354-1.854 8.5-8.5zM3.5 13A1.5 1.5 0 0 0 5 14.5h8a.5.5 0 0 0 0-1H5a.5.5 0 0 1-.5-.5V5a.5.5 0 0 0-1 0v8z"/>'
    + '</svg>';
}

export function renderTaskListInto(targetEl, onRender = rerenderSchedule, options = {}) {
  if (!targetEl) return;

  const {
    draggable = true,
    emptyMessage = '업무가 없습니다.<br>+ 업무 버튼으로 추가해보세요.',
  } = options;

  let todos = state.todos;
  if (taskFilter === 'active') todos = todos.filter((todo) => !todo.done);
  if (taskFilter === 'done') todos = todos.filter((todo) => todo.done);
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
      const progress = getTaskProgress(state, todo.id);
      const sectionDone = getTodoSectionCompletion(todo.id, section.key, state.scheduleEntries);
      const percent = progress.total > 0 ? progress.percent : (sectionDone ? 100 : 0);
      const label = progress.total > 0
        ? `${progress.done}/${progress.total} (${progress.percent}%)`
        : sectionDone ? '완료' : '미완료';

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
        assignTodoToDate(dragData.todoId, dateKey);
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
  onRenderCallback = onRender;

  if (!state.scheduleWeekStart) {
    state.scheduleWeekStart = toDateKey(getMonday(new Date()));
  }
  if (!state.scheduleMonth) {
    state.scheduleMonth = todayKey().slice(0, 7);
  }

  renderTaskList();
  renderPlanner();

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
      taskFilter = btn.dataset.filter;
      syncFilterButtons();
      onRender();
    });
  });

  plannerPreviewBtn?.addEventListener('click', () => {
    buildPlannerSchedulePreview();
  });

  plannerApplyBtn?.addEventListener('click', () => {
    const applied = applyPlannerSchedulePreview();
    if (applied === 0) alert('적용할 미리보기가 없습니다.');
    else alert(`추천 일정 ${applied}개를 적용했습니다.`);
  });
}

function formatShortDate(dateKey) {
  if (!dateKey) return '날짜 없음';
  const [, month, day] = dateKey.split('-');
  return `${parseInt(month, 10)}/${parseInt(day, 10)}`;
}

function getPriorityLabel(score) {
  if (score >= 900) return '우선순위 높음';
  if (score >= 500) return '오늘 집중';
  return '이번 주 확인';
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
