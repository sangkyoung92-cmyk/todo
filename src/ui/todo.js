import { state, nowISO, save, uid } from '../state/store.js';
import { markStateDirty, scheduleSync } from '../sync/cloud.js';
import { todoListEl } from './dom.js';
import { escapeHtml, formatDeadline, isOverdue, isToday } from '../utils/format.js';
import { logBehavior } from '../tracking/behavior.js';
import { buildTodoSectionsFromSchedule } from '../utils/todo-buckets.js';

export function addTodo(text, sourceNoteId = null, project = null, difficulty = null, deadline = null) {
  const clean = (text || '').trim();
  if (!clean) return;
  const now = nowISO();
  const todo = {
    id: uid(),
    text: clean,
    done: false,
    project: project || null,
    sourceNoteId,
    difficulty: difficulty || null,
    deadline: deadline || null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  state.todos.unshift(todo);

  if (todo.deadline) {
    const alreadyAssigned = state.scheduleEntries.some(
      (entry) => entry.todoId === todo.id && entry.date === todo.deadline,
    );
    if (!alreadyAssigned) {
      state.scheduleEntries.push({
        id: uid(),
        todoId: todo.id,
        date: todo.deadline,
        done: false,
        completedAt: null,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  save();
  markStateDirty(); scheduleSync();
  return todo.id;
}

const DIFFICULTY_CYCLE = ['하', '중', '상'];
const DIFFICULTY_COLORS = { '상': '#e74c3c', '중': '#e67e22', '하': '#27ae60' };
const TODO_SECTIONS = [
  { key: 'today', label: '오늘 할 일' },
  { key: 'week', label: '이번 주 할 일' },
  { key: 'month', label: '이번 달 할 일' },
  { key: 'other', label: '기타 할 일' },
];

function createSectionHeader(section, count, onRender) {
  const collapsed = state.todoSectionCollapsed?.[section.key] ?? false;

  const header = document.createElement('li');
  header.className = 'todo-section-header';

  const button = document.createElement('button');
  button.className = 'todo-section-toggle';
  button.type = 'button';
  button.innerHTML = `
    <span class="todo-section-arrow">${collapsed ? '▸' : '▾'}</span>
    <span class="todo-section-title">${section.label}</span>
    <span class="todo-section-count">${count}</span>
  `;

  button.addEventListener('click', () => {
    state.todoSectionCollapsed[section.key] = !collapsed;
    save();
    markStateDirty(); scheduleSync();
    onRender();
  });

  header.appendChild(button);
  return { header, collapsed };
}

function renderTodoItem(todo, onRender) {
  const li = document.createElement('li');
  li.className = `todo-item ${todo.done ? 'done' : ''}`;

  const deadlineStr = formatDeadline(todo.deadline);
  const overdue = !todo.done && isOverdue(todo.deadline);
  const today = !todo.done && isToday(todo.deadline);
  const diffColor = DIFFICULTY_COLORS[todo.difficulty] || '#999';

  let metaHtml = '';
  if (todo.difficulty || todo.deadline) {
    metaHtml = '<span class="todo-meta">';
    if (todo.difficulty) {
      metaHtml += `<button class="todo-difficulty" style="background:${diffColor}" data-action="cycle-difficulty" title="난이도 변경">${escapeHtml(todo.difficulty)}</button>`;
    }
    if (deadlineStr) {
      const deadlineClass = overdue ? ' overdue' : today ? ' today' : '';
      metaHtml += `<span class="todo-deadline${deadlineClass}" data-action="edit-deadline" title="기한 변경">${escapeHtml(deadlineStr)}</span>`;
    }
    metaHtml += '</span>';
  }

  li.innerHTML = `
    <label class="todo-main">
      <input type="checkbox" data-action="toggle" ${todo.done ? 'checked' : ''} />
      <div class="todo-content">
        <span class="todo-text" data-action="edit-text" title="더블클릭으로 수정">${escapeHtml(todo.text)}</span>
        ${metaHtml}
      </div>
    </label>
    <button class="icon-btn" data-action="delete" title="할 일 삭제">
      <svg viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 5.5A.5.5 0 016 6v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm2.5 0a.5.5 0 01.5.5v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm3 .5a.5.5 0 00-1 0v6a.5.5 0 001 0V6z"/><path fill-rule="evenodd" d="M14.5 3a1 1 0 01-1 1H13v9a2 2 0 01-2 2H5a2 2 0 01-2-2V4h-.5a1 1 0 01-1-1V2a1 1 0 011-1H6a1 1 0 011-1h2a1 1 0 011 1h3.5a1 1 0 011 1v1zM4.118 4L4 4.059V13a1 1 0 001 1h6a1 1 0 001-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z" clip-rule="evenodd"/></svg>
    </button>
  `;

  li.querySelector('[data-action="toggle"]').addEventListener('change', (e) => {
    const wasDone = todo.done;
    todo.done = e.target.checked;
    todo.updatedAt = nowISO();
    if (todo.done && !wasDone) {
      todo.completedAt = nowISO();
      logBehavior('complete', todo.id, false, true);
    } else if (!todo.done && wasDone) {
      todo.completedAt = null;
    }
    save();
    markStateDirty(); scheduleSync();
    onRender();
  });

  li.querySelector('[data-action="delete"]').addEventListener('click', () => {
    logBehavior('delete', todo.id, todo.text, null);
    state.todos = state.todos.filter((x) => x.id !== todo.id);
    save();
    markStateDirty(); scheduleSync();
    onRender();
  });

  const diffBtn = li.querySelector('[data-action="cycle-difficulty"]');
  if (diffBtn) {
    diffBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const oldDiff = todo.difficulty;
      const idx = DIFFICULTY_CYCLE.indexOf(oldDiff);
      todo.difficulty = DIFFICULTY_CYCLE[(idx + 1) % DIFFICULTY_CYCLE.length];
      logBehavior('difficulty_change', todo.id, oldDiff, todo.difficulty);
      save();
      markStateDirty(); scheduleSync();
      onRender();
    });
  }

  const deadlineEl = li.querySelector('[data-action="edit-deadline"]');
  if (deadlineEl) {
    deadlineEl.addEventListener('click', (e) => {
      e.stopPropagation();
      const input = document.createElement('input');
      input.type = 'date';
      input.value = todo.deadline || '';
      input.className = 'todo-deadline-input';
      deadlineEl.replaceWith(input);
      input.focus();

      const commit = () => {
        const oldDeadline = todo.deadline;
        const newDeadline = input.value;
        if (newDeadline && newDeadline !== oldDeadline) {
          todo.deadline = newDeadline;
          todo.updatedAt = nowISO();
          logBehavior('deadline_change', todo.id, oldDeadline, newDeadline);
          save();
          markStateDirty(); scheduleSync();
        }
        onRender();
      };

      input.addEventListener('change', commit);
      input.addEventListener('blur', commit);
    });
  }

  const textEl = li.querySelector('[data-action="edit-text"]');
  if (textEl) {
    textEl.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      const input = document.createElement('input');
      input.type = 'text';
      input.value = todo.text;
      input.className = 'todo-text-input';
      textEl.replaceWith(input);
      input.focus();
      input.select();

      const commit = () => {
        const oldText = todo.text;
        const newText = input.value.trim();
        if (newText && newText !== oldText) {
          todo.text = newText;
          todo.updatedAt = nowISO();
          logBehavior('name_edit', todo.id, oldText, newText);
          save();
          markStateDirty(); scheduleSync();
        }
        onRender();
      };

      input.addEventListener('blur', commit);
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); commit(); }
        if (ev.key === 'Escape') onRender();
      });
    });
  }

  return li;
}

export function renderTodos(onRender) {
  todoListEl.innerHTML = '';

  if (!state.todos.length) {
    const empty = document.createElement('li');
    empty.className = 'empty-state';
    empty.textContent = '할 일이 없습니다.';
    todoListEl.appendChild(empty);
    return;
  }

  const sorted = [...state.todos].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  const sectionMap = buildTodoSectionsFromSchedule(sorted, state.scheduleEntries);

  TODO_SECTIONS.forEach((section) => {
    const todos = sectionMap[section.key] || [];
    const { header, collapsed } = createSectionHeader(section, todos.length, onRender);
    todoListEl.appendChild(header);

    if (collapsed) return;

    if (!todos.length) {
      const empty = document.createElement('li');
      empty.className = 'todo-section-empty';
      empty.textContent = '항목이 없습니다.';
      todoListEl.appendChild(empty);
      return;
    }

    todos.forEach((todo) => {
      todoListEl.appendChild(renderTodoItem(todo, onRender));
    });
  });
}
