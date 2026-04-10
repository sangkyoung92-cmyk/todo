import { state, nowISO, save, uid } from '../state/store.js';
import { markStateDirty, scheduleSync } from '../sync/cloud.js';
import { todoListEl } from './dom.js';
import { renderTaskListInto } from './schedule.js';
import { addTask } from '../../packages/schedule-core/tasks.js';

export function addTodo(text, sourceNoteId = null, difficulty = null, deadline = null) {
  const todoId = addTask(state, {
    text,
    sourceNoteId,
    difficulty,
    deadline,
  }, { nowISO, uid });

  save();
  markStateDirty();
  scheduleSync();
  return todoId;
}

export function renderTodos(onRender) {
  renderTaskListInto(todoListEl, onRender, {
    draggable: false,
    emptyMessage: '업무가 없습니다.',
  });
}
