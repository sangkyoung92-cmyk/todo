import { load, nowISO, save, state, uid, getNextSectionColor } from './state/store.js';
import {
  addNoteBtn, addTabBtn, contentEl, saveStatusEl, titleEl,
  searchInput, toolbarEl,
} from './ui/dom.js';
import { renderAll, renderNotes, renderTabs, renderEditor } from './ui/render.js';

function rerender() {
  renderAll(rerender);
}

function addTab() {
  const name = prompt('섹션 이름을 입력하세요.', '새 섹션');
  if (!name?.trim()) return;

  const now = nowISO();
  const tab = {
    id: uid(),
    name: name.trim(),
    color: getNextSectionColor(),
    createdAt: now,
    updatedAt: now,
  };

  state.tabs.push(tab);
  state.selectedTabId = tab.id;
  state.selectedNoteId = null;
  save();
  rerender();
}

function addNote() {
  if (!state.selectedTabId) {
    alert('먼저 섹션을 선택하세요.');
    return;
  }

  const now = nowISO();
  const note = {
    id: uid(),
    tabId: state.selectedTabId,
    title: '제목 없음',
    content: '',
    createdAt: now,
    updatedAt: now,
  };

  state.notes.push(note);
  state.selectedNoteId = note.id;

  const tab = state.tabs.find((x) => x.id === state.selectedTabId);
  if (tab) tab.updatedAt = now;

  save();
  rerender();

  // Focus the title input for immediate editing
  setTimeout(() => {
    titleEl.focus();
    titleEl.select();
  }, 50);
}

function scheduleAutoSave() {
  const note = state.notes.find((x) => x.id === state.selectedNoteId);
  if (!note) return;

  saveStatusEl.textContent = '저장 중...';

  if (state.saveTimer) clearTimeout(state.saveTimer);

  state.saveTimer = setTimeout(() => {
    const now = nowISO();
    note.title = titleEl.value;
    note.content = contentEl.innerHTML;
    note.updatedAt = now;

    const tab = state.tabs.find((x) => x.id === note.tabId);
    if (tab) tab.updatedAt = now;

    save();
    renderNotes(rerender);
    renderTabs(rerender);
    saveStatusEl.textContent = '저장됨';
  }, 800);
}

// ── Toolbar ──────────────────────────────────────────────
toolbarEl.addEventListener('mousedown', (e) => {
  const btn = e.target.closest('.tbtn');
  if (!btn) return;

  e.preventDefault(); // keep focus in editor

  const cmd = btn.dataset.cmd;
  const val = btn.dataset.val || null;

  if (cmd) {
    document.execCommand(cmd, false, val);
    contentEl.focus();
    updateToolbarState();
  }
});

function updateToolbarState() {
  const cmds = ['bold', 'italic', 'underline', 'strikeThrough', 'insertUnorderedList', 'insertOrderedList'];
  cmds.forEach((cmd) => {
    const btn = toolbarEl.querySelector(`[data-cmd="${cmd}"]`);
    if (btn) {
      btn.classList.toggle('active', document.queryCommandState(cmd));
    }
  });
}

contentEl.addEventListener('keyup', updateToolbarState);
contentEl.addEventListener('mouseup', updateToolbarState);
contentEl.addEventListener('selectionchange', updateToolbarState);

// ── Search ───────────────────────────────────────────────
searchInput.addEventListener('input', () => {
  state.searchQuery = searchInput.value;
  renderNotes(rerender);
});

searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    searchInput.value = '';
    state.searchQuery = '';
    renderNotes(rerender);
    searchInput.blur();
  }
});

// ── Event listeners ──────────────────────────────────────
addTabBtn.addEventListener('click', addTab);
addNoteBtn.addEventListener('click', addNote);
titleEl.addEventListener('input', scheduleAutoSave);
contentEl.addEventListener('input', scheduleAutoSave);

// Prevent newline in title, move focus to content
titleEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    contentEl.focus();
  }
});

load();
rerender();
