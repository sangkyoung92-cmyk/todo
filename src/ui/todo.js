import { state, nowISO, save, uid } from '../state/store.js';
import { markStateDirty, scheduleSync } from '../sync/cloud.js';
import { todoListEl } from './dom.js';
import { renderTaskListInto } from './schedule.js';
import { getMostRecentScheduledDate } from '../utils/todo-buckets.js';

export function addTodo(text, sourceNoteId = null, difficulty = null, deadline = null) {
  const clean = (text || '').trim();
  if (!clean) return null;

  const now = nowISO();
  const todo = {
    id: uid(),
    text: clean,
    done: false,
    sourceNoteId,
    difficulty: difficulty || '중',
    deadline: deadline || getMostRecentScheduledDate(state.scheduleEntries) || null,
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
  markStateDirty();
  scheduleSync();
  return todo.id;
}

export function renderTodos(onRender) {
  renderTaskListInto(todoListEl, onRender, {
    draggable: false,
    emptyMessage: '업무가 없습니다.',
  });
}
