import { state, getCurrentTabNotes, nowISO, save } from '../state/store.js';
import { escapeHtml, formatDate } from '../utils/format.js';
import { contentEl, noteListEl, saveStatusEl, tabListEl, titleEl } from './dom.js';

export function renderTabs(onRender) {
  tabListEl.innerHTML = '';

  state.tabs.forEach((tab) => {
    const li = document.createElement('li');
    li.className = `item ${tab.id === state.selectedTabId ? 'active' : ''}`;

    li.innerHTML = `
      <div class="item-title">${escapeHtml(tab.name)}</div>
      <div class="item-sub">수정: ${formatDate(tab.updatedAt)}</div>
      <div class="actions">
        <button data-action="rename">이름변경</button>
        <button data-action="delete">삭제</button>
      </div>
    `;

    li.addEventListener('click', (event) => {
      if (event.target.tagName === 'BUTTON') {
        return;
      }
      state.selectedTabId = tab.id;
      const notes = getCurrentTabNotes();
      state.selectedNoteId = notes[0]?.id || null;
      save();
      onRender();
    });

    li.querySelector('[data-action="rename"]').addEventListener('click', () => {
      const next = prompt('새 탭 이름을 입력하세요.', tab.name);
      if (!next?.trim()) {
        return;
      }
      tab.name = next.trim();
      tab.updatedAt = nowISO();
      save();
      onRender();
    });

    li.querySelector('[data-action="delete"]').addEventListener('click', () => {
      if (state.tabs.length === 1) {
        alert('탭은 최소 1개 필요합니다.');
        return;
      }
      if (!confirm(`'${tab.name}' 탭을 삭제할까요? (해당 노트도 삭제됨)`)) {
        return;
      }

      state.tabs = state.tabs.filter((x) => x.id !== tab.id);
      state.notes = state.notes.filter((note) => note.tabId !== tab.id);

      if (state.selectedTabId === tab.id) {
        state.selectedTabId = state.tabs[0]?.id || null;
      }

      const notes = getCurrentTabNotes();
      state.selectedNoteId = notes[0]?.id || null;
      save();
      onRender();
    });

    tabListEl.appendChild(li);
  });
}

export function renderNotes(onRender) {
  noteListEl.innerHTML = '';
  const notes = getCurrentTabNotes();

  notes.forEach((note) => {
    const li = document.createElement('li');
    li.className = `item ${note.id === state.selectedNoteId ? 'active' : ''}`;

    li.innerHTML = `
      <div class="item-title">${escapeHtml(note.title || '제목 없음')}</div>
      <div class="item-sub">수정: ${formatDate(note.updatedAt)}</div>
      <div class="actions">
        <button data-action="delete-note">삭제</button>
      </div>
    `;

    li.addEventListener('click', (event) => {
      if (event.target.tagName === 'BUTTON') {
        return;
      }
      state.selectedNoteId = note.id;
      save();
      renderEditor();
      renderNotes(onRender);
    });

    li.querySelector('[data-action="delete-note"]').addEventListener('click', () => {
      if (!confirm('노트를 삭제할까요?')) {
        return;
      }
      state.notes = state.notes.filter((x) => x.id !== note.id);
      const next = getCurrentTabNotes()[0];
      state.selectedNoteId = next?.id || null;
      save();
      onRender();
    });

    noteListEl.appendChild(li);
  });
}

export function renderEditor() {
  const note = state.notes.find((x) => x.id === state.selectedNoteId);
  const disabled = !note;

  titleEl.disabled = disabled;
  contentEl.disabled = disabled;

  if (disabled) {
    titleEl.value = '';
    contentEl.value = '';
    saveStatusEl.textContent = '선택된 노트 없음';
    return;
  }

  titleEl.value = note.title;
  contentEl.value = note.content;
  saveStatusEl.textContent = '저장됨';
}

export function renderAll(onRender) {
  renderTabs(onRender);
  renderNotes(onRender);
  renderEditor();
}
