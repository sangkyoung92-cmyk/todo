const STORAGE_KEY = 'onenote_mvp_v1';

const tabListEl = document.getElementById('tab-list');
const noteListEl = document.getElementById('note-list');
const addTabBtn = document.getElementById('add-tab-btn');
const addNoteBtn = document.getElementById('add-note-btn');
const titleEl = document.getElementById('note-title');
const contentEl = document.getElementById('note-content');

const state = {
  tabs: [],
  notes: [],
  selectedTabId: null,
  selectedNoteId: null,
  saveTimer: null,
};

function uid() {
  return crypto.randomUUID();
}

function nowISO() {
  return new Date().toISOString();
}

function load() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    createStarterData();
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    state.tabs = parsed.tabs || [];
    state.notes = parsed.notes || [];
    state.selectedTabId = parsed.selectedTabId || state.tabs[0]?.id || null;
    const tabNotes = getCurrentTabNotes();
    state.selectedNoteId = parsed.selectedNoteId || tabNotes[0]?.id || null;
  } catch (error) {
    console.error('Failed to parse storage:', error);
    createStarterData();
  }
}

function save() {
  const payload = {
    tabs: state.tabs,
    notes: state.notes,
    selectedTabId: state.selectedTabId,
    selectedNoteId: state.selectedNoteId,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function createStarterData() {
  const firstTabId = uid();
  const firstNoteId = uid();
  const now = nowISO();

  state.tabs = [
    {
      id: firstTabId,
      name: '기본 탭',
      createdAt: now,
      updatedAt: now,
    },
  ];

  state.notes = [
    {
      id: firstNoteId,
      tabId: firstTabId,
      title: '첫 노트',
      content: '여기에 회의록/업무 내용을 적어보세요.',
      createdAt: now,
      updatedAt: now,
    },
  ];

  state.selectedTabId = firstTabId;
  state.selectedNoteId = firstNoteId;
  save();
}

function getCurrentTabNotes() {
  return state.notes
    .filter((note) => note.tabId === state.selectedTabId)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

function renderTabs() {
  tabListEl.innerHTML = '';
  state.tabs.forEach((tab) => {
    const li = document.createElement('li');
    li.className = `item ${tab.id === state.selectedTabId ? 'active' : ''}`;

    li.innerHTML = `
      <div class="item-title">${escapeHtml(tab.name)}</div>
      <div class="item-sub">수정: ${formatDate(tab.updatedAt)}</div>
      <div class="actions">
        <button data-action="rename" data-id="${tab.id}">이름변경</button>
        <button data-action="delete" data-id="${tab.id}">삭제</button>
      </div>
    `;

    li.addEventListener('click', (event) => {
      if (event.target.tagName === 'BUTTON') return;
      state.selectedTabId = tab.id;
      const notes = getCurrentTabNotes();
      state.selectedNoteId = notes[0]?.id || null;
      save();
      render();
    });

    li.querySelector('[data-action="rename"]').addEventListener('click', () => {
      const next = prompt('새 탭 이름을 입력하세요.', tab.name);
      if (!next?.trim()) return;
      tab.name = next.trim();
      tab.updatedAt = nowISO();
      save();
      render();
    });

    li.querySelector('[data-action="delete"]').addEventListener('click', () => {
      if (state.tabs.length === 1) {
        alert('탭은 최소 1개 필요합니다.');
        return;
      }
      if (!confirm(`'${tab.name}' 탭을 삭제할까요? (해당 노트도 삭제됨)`)) return;

      state.tabs = state.tabs.filter((x) => x.id !== tab.id);
      state.notes = state.notes.filter((note) => note.tabId !== tab.id);

      if (state.selectedTabId === tab.id) {
        state.selectedTabId = state.tabs[0]?.id || null;
      }

      const notes = getCurrentTabNotes();
      state.selectedNoteId = notes[0]?.id || null;
      save();
      render();
    });

    tabListEl.appendChild(li);
  });
}

function renderNotes() {
  noteListEl.innerHTML = '';
  const notes = getCurrentTabNotes();

  notes.forEach((note) => {
    const li = document.createElement('li');
    li.className = `item ${note.id === state.selectedNoteId ? 'active' : ''}`;

    li.innerHTML = `
      <div class="item-title">${escapeHtml(note.title || '제목 없음')}</div>
      <div class="item-sub">수정: ${formatDate(note.updatedAt)}</div>
      <div class="actions">
        <button data-action="delete-note" data-id="${note.id}">삭제</button>
      </div>
    `;

    li.addEventListener('click', (event) => {
      if (event.target.tagName === 'BUTTON') return;
      state.selectedNoteId = note.id;
      save();
      renderEditor();
      renderNotes();
    });

    li.querySelector('[data-action="delete-note"]').addEventListener('click', () => {
      if (!confirm('노트를 삭제할까요?')) return;
      state.notes = state.notes.filter((x) => x.id !== note.id);
      const next = getCurrentTabNotes()[0];
      state.selectedNoteId = next?.id || null;
      save();
      render();
    });

    noteListEl.appendChild(li);
  });
}

function renderEditor() {
  const note = state.notes.find((x) => x.id === state.selectedNoteId);
  const disabled = !note;

  titleEl.disabled = disabled;
  contentEl.disabled = disabled;

  if (disabled) {
    titleEl.value = '';
    contentEl.value = '';
    return;
  }

  titleEl.value = note.title;
  contentEl.value = note.content;
}

function render() {
  renderTabs();
  renderNotes();
  renderEditor();
}

function addTab() {
  const name = prompt('탭 이름을 입력하세요.', '새 탭');
  if (!name?.trim()) return;

  const now = nowISO();
  const tab = {
    id: uid(),
    name: name.trim(),
    createdAt: now,
    updatedAt: now,
  };

  state.tabs.push(tab);
  state.selectedTabId = tab.id;
  state.selectedNoteId = null;
  save();
  render();
}

function addNote() {
  if (!state.selectedTabId) {
    alert('먼저 탭을 선택하세요.');
    return;
  }

  const now = nowISO();
  const note = {
    id: uid(),
    tabId: state.selectedTabId,
    title: '새 노트',
    content: '',
    createdAt: now,
    updatedAt: now,
  };

  state.notes.push(note);
  state.selectedNoteId = note.id;

  const tab = state.tabs.find((x) => x.id === state.selectedTabId);
  if (tab) tab.updatedAt = now;

  save();
  render();
}

function scheduleAutoSave() {
  const note = state.notes.find((x) => x.id === state.selectedNoteId);
  if (!note) return;

  if (state.saveTimer) {
    clearTimeout(state.saveTimer);
  }

  state.saveTimer = setTimeout(() => {
    const now = nowISO();
    note.title = titleEl.value;
    note.content = contentEl.value;
    note.updatedAt = now;

    const tab = state.tabs.find((x) => x.id === note.tabId);
    if (tab) tab.updatedAt = now;

    save();
    renderNotes();
  }, 1000);
}

function formatDate(iso) {
  return new Date(iso).toLocaleString('ko-KR', {
    hour12: false,
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

addTabBtn.addEventListener('click', addTab);
addNoteBtn.addEventListener('click', addNote);
titleEl.addEventListener('input', scheduleAutoSave);
contentEl.addEventListener('input', scheduleAutoSave);

load();
render();
