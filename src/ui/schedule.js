import { state, uid, nowISO, save } from '../state/store.js';
import {
  scheduleTaskListEl,
  scheduleCalendarBodyEl,
  scheduleDayNoteClearBtn,
  scheduleDayNoteCloseBtn,
  scheduleDayNoteInputEl,
  scheduleDayNotePanelEl,
  scheduleDayNoteStatusEl,
  scheduleDayNoteSummaryEl,
  scheduleDayNoteTitleEl,
  scheduleRangeLabelEl,
  schedulePrevBtn,
  scheduleNextBtn,
  plannerInboxListEl,
  plannerApplyBtn,
  plannerClearBtn,
  plannerToggleBtn,
  plannerTopbarToggleBtn,
  plannerAiAdviceEl,
  scheduleGotoTodayBtn,
  scheduleGotoDateInput,
  contentEl,
} from './dom.js?v=20260514-daynote-close';
import {
  getSunday,
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
import { markDirty, markStateDirty, scheduleSync } from '../sync/cloud.js';
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
  applyPlannerSuggestions as applyCorePlannerSuggestions,
  buildLocalPlannerSuggestions,
} from '../../packages/schedule-core/planner.js';
import { showScheduleModal } from './schedule-modal.js';
import {
  configureDateTextInput,
  readDateInputValue,
} from '../utils/date-input.js';

let onRenderCallback = null;
let taskFilter = 'active';
let pendingPlannerSuggestions = [];
let monthOverflowResizeBound = false;
let selectedDayNoteDate = null;
let dayNoteSaveTimer = null;
let dayNoteEventsBound = false;
let plannerStatusText = '업무 제안을 만들면 여기에 함께 표시됩니다.';

const SCHEDULE_SECTIONS = [
  { key: 'today', label: '오늘 일정' },
  { key: 'week', label: '이번 주 일정' },
  { key: 'month', label: '이번 달 일정' },
  { key: 'other', label: '기타 일정' },
];

const taskHelpers = { uid, nowISO };
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_KEY_PATTERN = /^\d{4}-\d{2}$/;

configureDateTextInput(scheduleGotoDateInput);

function persistAndSync() {
  save();
  markStateDirty();
  scheduleSync();
}

function ensureDateNotes() {
  if (!state.dateNotes || typeof state.dateNotes !== 'object' || Array.isArray(state.dateNotes)) {
    state.dateNotes = {};
  }
  return state.dateNotes;
}

function getDayNoteText(dateKey) {
  const note = ensureDateNotes()[dateKey];
  if (!note) return '';
  return typeof note === 'string' ? note : (note.text || '');
}

function hasDayNote(dateKey) {
  return !!getDayNoteText(dateKey).trim();
}

function dayNoteIconSvg() {
  return '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">'
    + '<path d="M3 2.5A1.5 1.5 0 014.5 1h7A1.5 1.5 0 0113 2.5v6.8c0 .4-.16.78-.44 1.06l-3.2 3.2A1.5 1.5 0 018.3 14H4.5A1.5 1.5 0 013 12.5v-10zM4.5 2a.5.5 0 00-.5.5v10a.5.5 0 00.5.5H8v-2.5A1.5 1.5 0 019.5 9H12V2.5a.5.5 0 00-.5-.5h-7zm4.5 10.3L11.3 10H9.5a.5.5 0 00-.5.5v1.8z"/>'
    + '</svg>';
}

function renderDayNoteButton(dateKey) {
  const hasNote = hasDayNote(dateKey);
  const label = hasNote ? '하루 메모 편집' : '하루 메모 추가';
  const cls = hasNote ? 'day-note-btn has-note' : 'day-note-btn';
  return `<button class="${cls}" data-action="open-day-note" data-date="${dateKey}" type="button" title="${label}" aria-label="${label}">${dayNoteIconSvg()}</button>`;
}

function formatDayNoteTitle(dateKey) {
  const date = fromDateKey(dateKey);
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(date);
}

function getDateEntryStats(dateKey) {
  const entries = state.scheduleEntries.filter((entry) => entry.date === dateKey);
  return {
    total: entries.length,
    done: entries.filter((entry) => entry.done).length,
  };
}

function renderDayNotePanel() {
  if (!scheduleDayNotePanelEl) return;

  if (!selectedDayNoteDate) {
    scheduleDayNotePanelEl.hidden = true;
    syncSelectedDayNoteCell();
    return;
  }

  const text = getDayNoteText(selectedDayNoteDate);
  const stats = getDateEntryStats(selectedDayNoteDate);
  scheduleDayNotePanelEl.hidden = false;
  scheduleDayNoteTitleEl.textContent = formatDayNoteTitle(selectedDayNoteDate);
  scheduleDayNoteSummaryEl.textContent = stats.total > 0
    ? `업무 ${stats.done}/${stats.total} 완료`
    : '배정된 업무 없음';

  if (document.activeElement !== scheduleDayNoteInputEl) {
    scheduleDayNoteInputEl.value = text;
  }
  scheduleDayNoteStatusEl.textContent = text.trim() ? '저장됨' : '메모 없음';
  scheduleDayNoteClearBtn.disabled = !text.trim();
  syncSelectedDayNoteCell();
}

function syncSelectedDayNoteCell() {
  if (!scheduleCalendarBodyEl) return;
  scheduleCalendarBodyEl.querySelectorAll('.week-day-col, .month-day-cell').forEach((cell) => {
    cell.classList.toggle('selected-day-note', !!selectedDayNoteDate && cell.dataset.date === selectedDayNoteDate);
  });
}

function openDayNotePanel(dateKey, options = {}) {
  if (!DATE_KEY_PATTERN.test(dateKey || '')) return;
  selectedDayNoteDate = dateKey;
  renderDayNotePanel();
  if (options.focus) {
    window.requestAnimationFrame(() => scheduleDayNoteInputEl?.focus());
  }
}

function closeDayNotePanel() {
  flushDayNoteSave();
  selectedDayNoteDate = null;
  renderDayNotePanel();
}

function commitDayNoteText() {
  if (!selectedDayNoteDate || !scheduleDayNoteInputEl) return;

  const dateKey = selectedDayNoteDate;
  const text = scheduleDayNoteInputEl.value.trim();
  const current = getDayNoteText(dateKey).trim();
  const notes = ensureDateNotes();

  if (!text) {
    if (!notes[dateKey]) {
      renderDayNotePanel();
      return;
    }
    delete notes[dateKey];
  } else {
    if (current === text) {
      renderDayNotePanel();
      return;
    }
    notes[dateKey] = {
      text,
      updatedAt: nowISO(),
    };
  }

  persistAndSync();
  rerenderSchedule();
}

function flushDayNoteSave() {
  if (!dayNoteSaveTimer) return;
  clearTimeout(dayNoteSaveTimer);
  dayNoteSaveTimer = null;
  commitDayNoteText();
}

function queueDayNoteSave() {
  if (!selectedDayNoteDate) return;
  if (dayNoteSaveTimer) clearTimeout(dayNoteSaveTimer);
  scheduleDayNoteStatusEl.textContent = '저장 중...';
  dayNoteSaveTimer = setTimeout(() => {
    dayNoteSaveTimer = null;
    commitDayNoteText();
  }, 350);
}

function initDayNotePanelEvents() {
  if (dayNoteEventsBound) return;
  dayNoteEventsBound = true;

  scheduleDayNoteCloseBtn?.addEventListener('click', closeDayNotePanel);
  scheduleDayNoteClearBtn?.addEventListener('click', () => {
    if (!selectedDayNoteDate || !scheduleDayNoteInputEl) return;
    scheduleDayNoteInputEl.value = '';
    commitDayNoteText();
    scheduleDayNoteInputEl.focus();
  });
  document.addEventListener('click', (event) => {
    if (!selectedDayNoteDate) return;
    if (scheduleDayNotePanelEl?.contains(event.target)) return;
    if (event.target.closest('[data-action="open-day-note"]')) return;
    closeDayNotePanel();
  });
  scheduleDayNoteInputEl?.addEventListener('input', queueDayNoteSave);
  scheduleDayNoteInputEl?.addEventListener('blur', flushDayNoteSave);
  scheduleDayNoteInputEl?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeDayNotePanel();
    }
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      flushDayNoteSave();
      scheduleDayNoteInputEl.blur();
    }
  });
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
  renderPlannerShell();
  renderPlannerStatus();
  renderPlannerSuggestions();
}

function renderPlannerShell() {
  const plannerEl = document.querySelector('.smart-planner');
  if (!plannerEl) return;
  const collapsed = !!state.smartPlannerCollapsed;
  plannerEl.classList.toggle('is-collapsed', collapsed);
  if (plannerToggleBtn) {
    plannerToggleBtn.textContent = collapsed ? '펼치기' : '접기';
    plannerToggleBtn.setAttribute('aria-expanded', String(!collapsed));
  }
  if (plannerTopbarToggleBtn) {
    plannerTopbarToggleBtn.classList.toggle('active', !collapsed);
    plannerTopbarToggleBtn.textContent = collapsed ? '업무 제안' : '업무 제안 닫기';
    plannerTopbarToggleBtn.setAttribute('aria-expanded', String(!collapsed));
  }
}

function renderPlannerStatus() {
  if (!plannerAiAdviceEl) return;
  plannerAiAdviceEl.hidden = !plannerStatusText;
  plannerAiAdviceEl.textContent = plannerStatusText;
}

function renderPlannerSuggestions() {
  if (!plannerInboxListEl) return;
  const items = getVisiblePlannerSuggestions();
  if (plannerApplyBtn) plannerApplyBtn.disabled = items.length === 0;

  if (!items.length) {
    plannerInboxListEl.innerHTML = '<li class="planner-empty">업무 제안을 누르면 노트 후보와 일정 재배치 제안이 여기에 표시됩니다.</li>';
    return;
  }

  plannerInboxListEl.innerHTML = items.map((item) => `
    <li class="planner-item planner-suggestion-item">
      <div class="planner-suggestion-row">
        <span class="planner-suggestion-kind">${escapeHtml(getSuggestionKindLabel(item))}</span>
        <span class="planner-suggestion-name">${escapeHtml(item.text)}</span>
        <span class="planner-suggestion-date">${escapeHtml(formatSuggestionDate(item))}</span>
        <span class="planner-suggestion-difficulty">${escapeHtml(item.difficulty || '중')}</span>
        <span class="planner-suggestion-arrow">-&gt;</span>
        <span class="planner-suggestion-reason">${escapeHtml(item.reason || '업무 흐름을 보고 제안했습니다')}</span>
        <button class="planner-suggestion-delete" data-action="delete-suggestion" data-suggestion-id="${escapeHtml(item.id)}" data-inbox-id="${escapeHtml(item.inboxId || '')}" title="이 제안 삭제" type="button">✕</button>
      </div>
    </li>
  `).join('');
}

function getVisiblePlannerSuggestions() {
  const inboxItems = (state.todoInbox || []).map((item) => ({
    id: `inbox-${item.id}`,
    type: 'task',
    source: 'inbox',
    inboxId: item.id,
    text: item.text,
    projectName: item.projectName || '',
    sourceNoteId: item.sourceNoteId || null,
    difficulty: item.difficulty || '중',
    deadline: item.deadline || null,
    date: item.deadline || null,
    reason: '노트에서 추출한 업무 후보입니다',
  }));

  const merged = [...inboxItems, ...pendingPlannerSuggestions];
  const seen = new Set();
  return merged.filter((item) => {
    const key = `${item.type}-${item.todoId || item.text}-${item.date || item.deadline || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function addScheduleTask(text, deadline, difficulty, projectName = '', description = '') {
  const todoId = addCoreTask(state, {
    text,
    projectName,
    description,
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

export function clearPlannerSuggestions() {
  pendingPlannerSuggestions = [];
  state.todoInbox = [];
  plannerStatusText = '업무 제안을 만들면 여기에 함께 표시됩니다.';
  save();
  renderPlanner();
}

export function deletePlannerSuggestion(suggestionId, inboxId) {
  if (inboxId) {
    state.todoInbox = (state.todoInbox || []).filter((item) => item.id !== inboxId);
    save();
  } else {
    pendingPlannerSuggestions = pendingPlannerSuggestions.filter((item) => item.id !== suggestionId);
  }
  renderPlanner();
}

export function buildPlannerLocalSuggestions() {
  return buildLocalPlannerSuggestions(state);
}

export function setPlannerSuggestions(suggestions, statusText = '') {
  pendingPlannerSuggestions = suggestions || [];
  plannerStatusText = statusText || '제안 결과를 확인하고 적용하기를 눌러주세요.';
  renderPlanner();
}

export function setPlannerStatus(statusText) {
  plannerStatusText = statusText || '';
  renderPlannerStatus();
}

export function applyPlannerSuggestionList() {
  const applied = applyCorePlannerSuggestions(state, getVisiblePlannerSuggestions(), taskHelpers);
  pendingPlannerSuggestions = [];
  plannerStatusText = applied > 0
    ? `제안 ${applied}개를 적용했습니다.`
    : '적용할 제안이 없습니다.';
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
  restoreTodoSourceMark(todoId);
  if (!deleteCoreTask(state, todoId)) return;
  persistAndSync();
}

function restoreTodoSourceMark(todoId) {
  const todo = state.todos.find((item) => item.id === todoId);
  if (!todo?.sourceNoteId) return;

  const note = state.notes.find((item) => item.id === todo.sourceNoteId);
  if (!note?.content) return;

  const wrap = document.createElement('div');
  wrap.innerHTML = note.content;
  const marks = [...wrap.querySelectorAll('.todo-source-mark')];
  const target = marks.find((mark) => mark.dataset.todoId === todoId)
    || marks.find((mark) => !mark.dataset.todoId && normalizeText(mark.textContent) === normalizeText(todo.text));
  if (!target) return;

  while (target.firstChild) {
    target.parentNode.insertBefore(target.firstChild, target);
  }
  target.remove();

  const now = nowISO();
  note.content = wrap.innerHTML;
  note.updatedAt = now;

  const tab = state.tabs.find((item) => item.id === note.tabId);
  if (tab) tab.updatedAt = now;

  if (state.selectedNoteId === note.id && contentEl) {
    contentEl.innerHTML = note.content;
  }

  save();
  markDirty(note.id);
  markStateDirty();
  scheduleSync();
}

function normalizeText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

async function editTask(todoId) {
  const todo = state.todos.find((item) => item.id === todoId);
  if (!todo) return;

  const result = await showScheduleModal({
    text: todo.text,
    projectName: todo.projectName || '',
    description: todo.description || '',
    deadline: todo.deadline || '',
    difficulty: todo.difficulty || '중',
  });
  if (!result) return;

  const nextText = (result.text || '').trim();
  if (!nextText) return;

  if (!editCoreTask(state, todoId, {
    text: nextText,
    projectName: result.projectName || '',
    description: result.description || '',
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
          ${todo.projectName ? `<div class="schedule-task-project" title="${escapeHtml(todo.projectName)}">${escapeHtml(todo.projectName)}</div>` : ''}
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
          ${todo.description ? `<p class="schedule-task-description">${escapeHtml(todo.description)}</p>` : ''}
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
      editTask(el.dataset.todoId).then(() => onRender());
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
      editTask(el.dataset.todoId).then(() => onRender());
    });
  });

  if (!draggable) return;

  targetEl.querySelectorAll('.schedule-task-card[draggable]').forEach((card) => {
    card.addEventListener('dragstart', (event) => {
      const payload = JSON.stringify({
        type: 'todo',
        todoId: card.dataset.todoId,
      });
      event.dataTransfer.setData('application/x-schedule-drag', payload);
      event.dataTransfer.setData('text/plain', `todo:${card.dataset.todoId}`);
      event.dataTransfer.effectAllowed = 'copyMove';
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
    const dayIndex = date.getDay();
    const weekdayClass = dayIndex === 0 ? 'sunday' : dayIndex === 6 ? 'saturday' : '';
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
        <div class="week-day-header ${weekdayClass}">
          <div class="week-day-name">${dayNames[index]}</div>
          <div class="week-day-num">${date.getDate()}</div>
          ${holidayName ? `<div class="week-day-holiday-name">${escapeHtml(holidayName)}</div>` : ''}
          ${renderDayNoteButton(dateKey)}
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
      const renderableEntries = entries
        .map((entry) => ({
          entry,
          todo: state.todos.find((item) => item.id === entry.todoId),
        }))
        .filter(({ todo }) => todo);
      let chipsHtml = '';
      renderableEntries.forEach(({ entry, todo }) => {
        chipsHtml += `
          <div class="month-chip ${entry.done ? 'chip-done' : ''}" data-entry-id="${entry.id}" data-todo-id="${todo.id}" draggable="true">
            <input type="checkbox" class="month-chip-check" data-action="toggle-entry" data-entry-id="${entry.id}" ${entry.done ? 'checked' : ''} />
            <span class="month-chip-text" title="${escapeHtml(todo.text)}">${escapeHtml(todo.text)}</span>
            <button class="month-chip-remove" data-action="remove-entry" data-entry-id="${entry.id}" title="날짜에서 제거">${trashIconSvg()}</button>
          </div>
        `;
      });

      if (renderableEntries.length > 0) {
        chipsHtml += '<div class="month-chip-more" hidden></div>';
      }

      html += `
        <div class="month-day-cell ${otherClass} ${todayClass} ${weekendClass} ${holidayClass} ${weekdayClass}" data-date="${dateKey}">
          ${renderDayNoteButton(dateKey)}
          <div class="month-day-num-wrap">
            <div class="month-day-num ${weekdayClass}">${date.getDate()}</div>
            ${holidayName ? `<span class="month-holiday-name">${escapeHtml(holidayName)}</span>` : ''}
          </div>
          <div class="month-chips">${chipsHtml}</div>
        </div>
      `;
    });

    html += '</div>';
  });

  html += '</div>';
  scheduleCalendarBodyEl.innerHTML = html;
  bindCalendarEvents();
  scheduleMonthOverflowRefresh();
}

function getDragData(dataTransfer) {
  const raw = dataTransfer.getData('application/x-schedule-drag');
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  const plain = dataTransfer.getData('text/plain');
  if (!plain) return null;
  if (plain.startsWith('entry:')) return { type: 'entry', entryId: plain.slice(6) };
  if (plain.startsWith('todo:')) return { type: 'todo', todoId: plain.slice(5) };
  return { type: 'todo', todoId: plain };
}

function bindCalendarEvents() {
  // 월간 뷰 칩 스크롤 → 오버플로 배지 갱신 (scroll은 위임 불가)
  scheduleCalendarBodyEl.querySelectorAll('.month-chips').forEach((chips) => {
    chips.addEventListener('scroll', scheduleMonthOverflowRefresh);
  });

  if (!monthOverflowResizeBound) {
    monthOverflowResizeBound = true;
    window.addEventListener('resize', scheduleMonthOverflowRefresh);
  }
}

function initCalendarEventDelegation() {
  if (!scheduleCalendarBodyEl) return;

  // ── 칩(달력 내 일정) 드래그 소스 ─────────────────────
  scheduleCalendarBodyEl.addEventListener('dragstart', (event) => {
    const chip = event.target.closest('.cal-chip[draggable], .month-chip[draggable]');
    if (!chip) return;
    event.stopPropagation();
    const payload = JSON.stringify({ type: 'entry', entryId: chip.dataset.entryId });
    event.dataTransfer.setData('application/x-schedule-drag', payload);
    event.dataTransfer.setData('text/plain', `entry:${chip.dataset.entryId}`);
    event.dataTransfer.effectAllowed = 'copyMove';
    chip.classList.add('dragging');
  });

  scheduleCalendarBodyEl.addEventListener('dragend', (event) => {
    const chip = event.target.closest('.cal-chip, .month-chip');
    if (chip) chip.classList.remove('dragging');
  });

  // ── 드롭 존 ─────────────────────────────────────────
  scheduleCalendarBodyEl.addEventListener('dragover', (event) => {
    const zone = event.target.closest('.week-day-col, .week-day-drop-zone, .month-day-cell');
    if (!zone) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = event.ctrlKey || event.metaKey ? 'copy' : 'move';
    const dropCell = zone.closest('.week-day-col, .month-day-cell') || zone;
    dropCell.classList.add('drag-over');
  });

  scheduleCalendarBodyEl.addEventListener('dragleave', (event) => {
    const dropCell = event.target.closest('.week-day-col, .month-day-cell');
    if (!dropCell) return;
    if (!dropCell.contains(event.relatedTarget)) {
      dropCell.classList.remove('drag-over');
    }
  });

  scheduleCalendarBodyEl.addEventListener('drop', (event) => {
    const zone = event.target.closest('.week-day-col, .week-day-drop-zone, .month-day-cell');
    if (!zone) return;
    event.preventDefault();
    event.stopPropagation();
    const dropCell = zone.closest('.week-day-col, .month-day-cell') || zone;
    dropCell.classList.remove('drag-over');
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

  // ── 체크박스 / 삭제 버튼 ────────────────────────────
  scheduleCalendarBodyEl.addEventListener('change', (event) => {
    if (event.target.dataset.action !== 'toggle-entry') return;
    toggleEntryDone(event.target.dataset.entryId);
    rerenderSchedule();
  });

  scheduleCalendarBodyEl.addEventListener('click', (event) => {
    const noteBtn = event.target.closest('[data-action="open-day-note"]');
    if (noteBtn) {
      event.preventDefault();
      event.stopPropagation();
      openDayNotePanel(noteBtn.dataset.date, { focus: true });
      return;
    }

    const noteCell = event.target.closest('.week-day-col, .month-day-cell');
    if (
      noteCell
      && hasDayNote(noteCell.dataset.date)
      && !event.target.closest('.cal-chip, .month-chip, [data-action]')
    ) {
      event.preventDefault();
      event.stopPropagation();
      openDayNotePanel(noteCell.dataset.date);
      return;
    }

    const removeBtn = event.target.closest('[data-action="remove-entry"]');
    if (!removeBtn) return;
    event.stopPropagation();
    removeFromDate(removeBtn.dataset.entryId);
    rerenderSchedule();
  });

  // ── 더블클릭: 일정 편집 / 새 업무 추가 ──────────────
  scheduleCalendarBodyEl.addEventListener('dblclick', async (event) => {
    const chip = event.target.closest('.cal-chip, .month-chip');
    if (chip) {
      if (event.target.closest('[data-action="toggle-entry"], [data-action="remove-entry"]')) return;
      event.stopPropagation();
      await editTask(chip.dataset.todoId);
      rerenderSchedule();
      return;
    }
    const cell = event.target.closest('.week-day-col, .month-day-cell');
    if (!cell || event.target.closest('.cal-chip, .month-chip, [data-action]')) return;
    const dateKey = cell.dataset.date;
    if (!dateKey) return;
    const result = await showScheduleModal({ deadline: dateKey, difficulty: '중' });
    if (!result) return;
    addScheduleTask(
      result.text,
      result.deadline || dateKey,
      result.difficulty || '중',
      result.projectName || '',
      result.description || '',
    );
    rerenderSchedule();
  });
}

function scheduleMonthOverflowRefresh() {
  window.requestAnimationFrame(refreshMonthOverflowIndicators);
}

function refreshMonthOverflowIndicators() {
  if (!scheduleCalendarBodyEl?.querySelector('.month-grid')) return;

  scheduleCalendarBodyEl.querySelectorAll('.month-day-cell').forEach((cell) => {
    const chipsEl = cell.querySelector('.month-chips');
    const moreEl = cell.querySelector('.month-chip-more');
    if (!chipsEl || !moreEl) return;

    cell.classList.remove('month-day-cell-overflow', 'is-scrolled');
    moreEl.hidden = true;

    if (chipsEl.scrollHeight <= chipsEl.clientHeight + 1) return;

    const isScrolled = chipsEl.scrollTop > 0;
    cell.classList.add('month-day-cell-overflow');
    moreEl.hidden = false;

    const visibleBottom = chipsEl.getBoundingClientRect().bottom - moreEl.getBoundingClientRect().height;
    const hiddenCount = [...chipsEl.querySelectorAll('.month-chip')]
      .filter((chip) => chip.getBoundingClientRect().bottom > visibleBottom + 1)
      .length;

    if (hiddenCount <= 0) {
      moreEl.hidden = true;
      cell.classList.remove('month-day-cell-overflow');
      return;
    }

    moreEl.textContent = `+${hiddenCount}개`;
    cell.classList.toggle('is-scrolled', isScrolled);
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
  const fallbackWeekStart = toDateKey(getSunday(new Date()));
  const fallbackMonth = todayKey().slice(0, 7);

  ensureDateNotes();

  if (typeof state.scheduleWeekStart !== 'string' || !DATE_KEY_PATTERN.test(state.scheduleWeekStart)) {
    state.scheduleWeekStart = fallbackWeekStart;
  } else {
    const weekStartDate = fromDateKey(state.scheduleWeekStart);
    if (weekStartDate.getDay() !== 0) {
      state.scheduleWeekStart = toDateKey(getSunday(weekStartDate));
    }
  }
  if (typeof state.scheduleMonth !== 'string' || !MONTH_KEY_PATTERN.test(state.scheduleMonth)) {
    state.scheduleMonth = fallbackMonth;
  }

  renderTaskList();
  renderPlanner();

  if (state.scheduleView === 'month') {
    renderMonthView();
  } else {
    renderWeekView();
  }

  renderDayNotePanel();

  document.querySelectorAll('.schedule-view-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === state.scheduleView);
  });
}

export function initScheduleNav(onRender) {
  // 달력 이벤트 위임 초기화 (한 번만 등록)
  initCalendarEventDelegation();
  initDayNotePanelEvents();

  const applyGotoDate = () => {
    const dateStr = readDateInputValue(scheduleGotoDateInput, { allowEmpty: true, report: true });
    if (!dateStr) return;

    const targetDate = fromDateKey(dateStr);
    if (state.scheduleView === 'week') {
      state.scheduleWeekStart = toDateKey(getSunday(targetDate));
    } else {
      state.scheduleMonth = dateStr.slice(0, 7);
    }
    save();
    renderSchedule(onRender);
  };

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

  scheduleGotoTodayBtn?.addEventListener('click', () => {
    if (state.scheduleView === 'week') {
      state.scheduleWeekStart = toDateKey(getSunday(new Date()));
    } else {
      state.scheduleMonth = todayKey().slice(0, 7);
    }
    save();
    renderSchedule(onRender);
  });

  scheduleGotoDateInput?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    applyGotoDate();
  });
  scheduleGotoDateInput?.addEventListener('dateinput:pick', applyGotoDate);

  document.querySelectorAll('.schedule-view-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.scheduleView = btn.dataset.view;
      if (state.scheduleView === 'week') {
        state.scheduleWeekStart = toDateKey(getSunday(new Date()));
      }
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

  plannerApplyBtn?.addEventListener('click', () => {
    const applied = applyPlannerSuggestionList();
    if (applied === 0) alert('적용할 제안이 없습니다.');
    else alert(`제안 ${applied}개를 적용했습니다.`);
  });

  plannerClearBtn?.addEventListener('click', () => {
    clearPlannerSuggestions();
  });

  plannerInboxListEl?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-action="delete-suggestion"]');
    if (!btn) return;
    deletePlannerSuggestion(btn.dataset.suggestionId, btn.dataset.inboxId);
  });

  plannerToggleBtn?.addEventListener('click', () => {
    state.smartPlannerCollapsed = !state.smartPlannerCollapsed;
    save();
    markStateDirty();
    scheduleSync();
    renderPlannerShell();
  });
}

function formatShortDate(dateKey) {
  if (!dateKey) return '날짜 없음';
  const [, month, day] = dateKey.split('-');
  return `${parseInt(month, 10)}/${parseInt(day, 10)}`;
}

function formatSuggestionDate(item) {
  const target = item.date ? formatShortDate(item.date) : '날짜 없음';
  const deadline = item.deadline ? formatShortDate(item.deadline) : '없음';
  return `${target}(${deadline})`;
}

function getSuggestionKindLabel(item) {
  return item.type === 'task' ? '추가' : '수정';
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
