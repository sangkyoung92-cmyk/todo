import { state, nowISO, save, uid } from '../state/store.js';
import { markStateDirty, scheduleSync } from '../sync/cloud.js';
import { todoListEl } from './dom.js';
import { escapeHtml } from '../utils/format.js';

export function addTodo(text, sourceNoteId = null) {
  const clean = (text || '').trim();
  if (!clean) return;
  const now = nowISO();
  state.todos.unshift({
    id: uid(),
    text: clean,
    done: false,
    sourceNoteId,
    createdAt: now,
    updatedAt: now,
  });
  save();
  markStateDirty(); scheduleSync();
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

  state.todos
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    .forEach((todo) => {
      const li = document.createElement('li');
      li.className = `todo-item ${todo.done ? 'done' : ''}`;
      li.innerHTML = `
        <label class="todo-main">
          <input type="checkbox" data-action="toggle" ${todo.done ? 'checked' : ''} />
          <span class="todo-text">${escapeHtml(todo.text)}</span>
        </label>
        <button class="icon-btn" data-action="delete" title="할 일 삭제">
          <svg viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 5.5A.5.5 0 016 6v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm2.5 0a.5.5 0 01.5.5v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm3 .5a.5.5 0 00-1 0v6a.5.5 0 001 0V6z"/><path fill-rule="evenodd" d="M14.5 3a1 1 0 01-1 1H13v9a2 2 0 01-2 2H5a2 2 0 01-2-2V4h-.5a1 1 0 01-1-1V2a1 1 0 011-1H6a1 1 0 011-1h2a1 1 0 011 1h3.5a1 1 0 011 1v1zM4.118 4L4 4.059V13a1 1 0 001 1h6a1 1 0 001-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z" clip-rule="evenodd"/></svg>
        </button>
      `;

      li.querySelector('[data-action="toggle"]').addEventListener('change', (e) => {
        todo.done = e.target.checked;
        todo.updatedAt = nowISO();
        save();
        markStateDirty(); scheduleSync();
        onRender();
      });

      li.querySelector('[data-action="delete"]').addEventListener('click', () => {
        state.todos = state.todos.filter((x) => x.id !== todo.id);
        save();
        markStateDirty(); scheduleSync();
        onRender();
      });

      todoListEl.appendChild(li);
    });
}
