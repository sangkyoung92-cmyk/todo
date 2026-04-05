import { createNoteForTab, load, nowISO, save, state, uid } from './state/store.js';
import {
  addNoteBtn,
  addTabBtn,
  contentEl,
  saveStatusEl,
  titleEl,
} from './ui/dom.js';
import { renderAll, renderNotes } from './ui/render.js';
import { initializeToolbar } from './ui/toolbar.js';

function rerender() {
  renderAll(rerender);
}

function addTab() {
  const name = prompt('탭 이름을 입력하세요.', '새 탭');
  if (!name?.trim()) {
    return;
  }

  const now = nowISO();
  const tab = {
    id: uid(),
    name: name.trim(),
    createdAt: now,
    updatedAt: now,
  };

  const initialNote = createNoteForTab(tab.id, `${tab.name} 첫 노트`);

  state.tabs.push(tab);
  state.notes.push(initialNote);
  state.selectedTabId = tab.id;
  state.selectedNoteId = initialNote.id;

  save();
  rerender();
}

function addNote() {
  if (!state.selectedTabId) {
    alert('먼저 탭을 선택하세요.');
    return;
  }

  const note = createNoteForTab(state.selectedTabId);

  state.notes.push(note);
  state.selectedNoteId = note.id;

  const tab = state.tabs.find((x) => x.id === state.selectedTabId);
  if (tab) {
    tab.updatedAt = nowISO();
  }

  save();
  rerender();
}

function scheduleAutoSave() {
  const note = state.notes.find((x) => x.id === state.selectedNoteId);
  if (!note) {
    return;
  }

  saveStatusEl.textContent = '저장 중...';

  if (state.saveTimer) {
    clearTimeout(state.saveTimer);
  }

  state.saveTimer = setTimeout(() => {
    const now = nowISO();
    note.title = titleEl.value;
    note.content = contentEl.innerHTML;
    note.updatedAt = now;

    const tab = state.tabs.find((x) => x.id === note.tabId);
    if (tab) {
      tab.updatedAt = now;
    }

    save();
    renderNotes(rerender);
    saveStatusEl.textContent = '저장됨';
  }, 1000);
}

addTabBtn.addEventListener('click', addTab);
addNoteBtn.addEventListener('click', addNote);
titleEl.addEventListener('input', scheduleAutoSave);
contentEl.addEventListener('input', scheduleAutoSave);

initializeToolbar();
load();
rerender();
