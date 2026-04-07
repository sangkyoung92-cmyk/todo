import { load, nowISO, save, state, uid, getNextSectionColor } from './state/store.js';
import {
  addNoteBtn, addTabBtn, contentEl, saveStatusEl, titleEl,
  searchInput, toolbarEl, syncStatusEl, authAreaEl, addTodoBtn, extractTodoBtn,
  appModeTabs, notesViewEl, scheduleViewEl, sectionTabsBarEl,
  addScheduleTaskBtn,
  addAiScheduleTaskBtn,
} from './ui/dom.js';
import { renderAll, renderNotes, renderTabs, renderEditor } from './ui/render.js';
import { signIn, signOutUser, onAuthChange } from './auth.js';
import {
  setCurrentUser, markDirty, markStateDirty, scheduleSync,
  loadFromCloud, setSyncStatusCallback,
} from './sync/cloud.js';
import { addTodo } from './ui/todo.js';
import { getSelectedEditorText } from './todo/extract.js';
import { extractTodosWithAI, getApiKey, saveApiKey } from './ai/extract.js';
import { getScheduleAIPreferences, saveScheduleAIPreferences } from './ai/schedule-preferences.js';
import { buildBehaviorSummary } from './tracking/behavior.js';
import { extractDeadlineFromText } from './utils/parse-date-kr.js';
import { showAddTodoModal } from './ui/todo-modal.js';
import { renderSchedule, initScheduleNav, addScheduleTask, assignTodoToDate } from './ui/schedule.js';
import { showScheduleModal } from './ui/schedule-modal.js';

function rerender() {
  if (state.appMode === 'schedule') {
    renderSchedule(rerender);
  } else {
    renderAll(rerender);
  }
}

// ── 앱 모드 전환 (노트 / 스케줄) ─────────────────
function applyAppMode(mode) {
  state.appMode = mode;
  save();

  const isSchedule = mode === 'schedule';

  // 뷰 전환
  if (notesViewEl) notesViewEl.style.display = isSchedule ? 'none' : '';
  if (scheduleViewEl) scheduleViewEl.style.display = isSchedule ? 'flex' : 'none';
  if (sectionTabsBarEl) sectionTabsBarEl.style.display = isSchedule ? 'none' : '';
  if (toolbarEl) toolbarEl.style.display = isSchedule ? 'none' : '';

  // 탭 버튼 active 상태
  appModeTabs.forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.mode === mode);
  });

  rerender();
}

// 앱 모드 탭 클릭 이벤트
appModeTabs.forEach((tab) => {
  tab.addEventListener('click', () => applyAppMode(tab.dataset.mode));
});

// 스케줄 업무 추가 버튼
addScheduleTaskBtn?.addEventListener('click', async () => {
  const result = await showScheduleModal();
  if (!result) return;
  addScheduleTask(result.text, result.project, result.deadline, result.difficulty);
  rerender();
});

async function addAiScheduleTasks() {
  const note = state.notes.find((x) => x.id === state.selectedNoteId);
  if (!note || !note.content?.trim()) {
    alert('AI 일정 추가를 위해 내용이 있는 페이지를 먼저 선택하세요.');
    return;
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    openSettingsDrawer();
    alert('Gemini API 키를 먼저 설정해주세요. (설정 > AI 설정)');
    return;
  }

  const prefs = getScheduleAIPreferences();
  const existingTodosForDist = prefs.useDeadlineDistribution ? state.todos : [];
  const existingTodosForDup = prefs.useExistingTodoTexts ? state.todos : [];
  const behaviorSummary = prefs.useBehaviorSummary ? buildBehaviorSummary() : '';
  const existingTodos = prefs.useDeadlineDistribution || prefs.useExistingTodoTexts
    ? (existingTodosForDist.length ? existingTodosForDist : existingTodosForDup)
    : [];

  addAiScheduleTaskBtn.disabled = true;
  const prevLabel = addAiScheduleTaskBtn.textContent;
  addAiScheduleTaskBtn.textContent = 'AI 추가 중...';

  try {
    const sections = await extractTodosWithAI(note.content, existingTodos, behaviorSummary, note.createdAt);
    if (!sections.length) {
      alert('AI가 추가할 일정을 찾지 못했습니다.');
      return;
    }

    let added = 0;
    sections.forEach((section) => {
      section.todos.forEach((todoItem) => {
        const isDup = prefs.useExistingTodoTexts
          && state.todos.some((t) => t.text === todoItem.text && t.project === section.project);
        if (isDup) return;

        const todoId = addScheduleTask(
          todoItem.text,
          section.project,
          todoItem.deadline || null,
          todoItem.difficulty || '중',
        );
        if (todoItem.deadline) {
          assignTodoToDate(todoId, todoItem.deadline);
        }
        added += 1;
      });
    });

    if (added === 0) {
      alert('새로 추가할 일정이 없습니다. (중복 제외)');
      return;
    }
    rerender();
    alert(`AI 일정 ${added}개를 추가했습니다.`);
  } catch (err) {
    if (err.message === 'API_KEY_MISSING' || err.message === 'API_KEY_INVALID') {
      openSettingsDrawer();
    }
    alert(`AI 일정 추가 실패: ${err.message}`);
  } finally {
    addAiScheduleTaskBtn.disabled = false;
    addAiScheduleTaskBtn.textContent = prevLabel;
  }
}

addAiScheduleTaskBtn?.addEventListener('click', addAiScheduleTasks);

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
  markStateDirty(); scheduleSync();
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
    title: '',
    content: '',
    createdAt: now,
    updatedAt: now,
  };

  state.notes.push(note);
  state.selectedNoteId = note.id;

  const tab = state.tabs.find((x) => x.id === state.selectedTabId);
  if (tab) tab.updatedAt = now;

  save();
  markDirty(note.id); markStateDirty(); scheduleSync();
  rerender();

  // Focus the title input for immediate editing
  setTimeout(() => {
    titleEl.focus();
  }, 50);
}

function addTodoFromSelection() {
  const text = getSelectedEditorText(contentEl);
  if (!text) {
    alert('에디터에서 할 일로 만들 텍스트를 먼저 선택하세요.');
    return;
  }
  const { deadline, cleanedText } = extractDeadlineFromText(text);
  addTodo(cleanedText, state.selectedNoteId || null, null, '중', deadline);
  rerender();
}

async function extractTodosFromCurrentNote() {
  const note = state.notes.find((x) => x.id === state.selectedNoteId);
  if (!note) {
    alert('먼저 페이지를 선택하세요.');
    return;
  }

  extractTodoBtn.disabled = true;
  extractTodoBtn.textContent = 'AI 분석 중...';

  try {
    const behaviorSummary = buildBehaviorSummary();
    const sections = await extractTodosWithAI(note.content, state.todos, behaviorSummary, note.createdAt);

    if (!sections.length) {
      alert('노트에서 추출할 할 일이 없습니다.');
      return;
    }

    let addedCount = 0;
    sections.forEach((section) => {
      section.todos.forEach((todoItem) => {
        const todoText = todoItem.text;
        const isDup = state.todos.some((t) => t.text === todoText && t.project === section.project);
        if (!isDup) {
          addTodo(todoText, note.id, section.project, todoItem.difficulty, todoItem.deadline);
          addedCount++;
        }
      });
    });

    if (addedCount === 0) {
      alert('추출할 새로운 할 일이 없습니다. (이미 모두 추가됨)');
    } else {
      rerender();
    }
  } catch (err) {
    if (err.message === 'API_KEY_MISSING') {
      openSettingsDrawer();
      alert('Gemini API 키를 먼저 설정해주세요. (설정 > AI 설정)');
    } else if (err.message === 'API_KEY_INVALID') {
      openSettingsDrawer();
      alert('API 키가 유효하지 않습니다. 설정에서 올바른 키를 입력해주세요.');
    } else {
      alert(`오류: ${err.message}`);
    }
  } finally {
    extractTodoBtn.disabled = false;
    extractTodoBtn.textContent = '노트에서 할 일 추출';
  }
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
    markDirty(note.id); scheduleSync();
    renderNotes(rerender);
    renderTabs(rerender);
    saveStatusEl.textContent = '저장됨';
  }, 800);
}

// ── Toolbar ──────────────────────────────────────────
toolbarEl.addEventListener('mousedown', (e) => {
  const btn = e.target.closest('.tbtn');
  if (!btn) return;

  // Ignore color-btn — handled separately
  if (btn.id === 'color-btn') return;

  e.preventDefault(); // keep focus in editor

  // 할 일 추가 버튼
  if (btn.dataset.action === 'add-todo') {
    addTodoFromSelection();
    return;
  }

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

// ── Text Color Picker ────────────────────────────────
const colorBtn = document.getElementById('color-btn');
const colorPalette = document.getElementById('color-palette');
const colorBtnBar = document.getElementById('color-btn-bar');

colorBtn.addEventListener('mousedown', (e) => {
  e.preventDefault(); // keep focus in editor
  colorPalette.classList.toggle('open');
});

// ── Tab Color Popup (body-level) ─────────────────────
const tabColorPopup = document.getElementById('tab-color-popup');
const TAB_COLORS = [
  '#7B2FA0', '#1f4db6', '#107c10', '#d83b01',
  '#0078d4', '#b4009e', '#038387', '#c19c00',
  '#e74c3c', '#e67e22', '#f1c40f', '#2ecc71',
  '#3498db', '#9b59b6', '#1abc9c', '#e91e63',
];
tabColorPopup.innerHTML = TAB_COLORS
  .map((c) => `<button class="color-swatch" data-color="${c}" style="background:${c}" title="${c}"></button>`)
  .join('');

tabColorPopup.addEventListener('click', (e) => {
  const swatch = e.target.closest('.color-swatch');
  if (!swatch) return;
  const tab = state.tabs.find((t) => t.id === tabColorPopup.dataset.tabId);
  if (!tab) return;
  tab.color = swatch.dataset.color;
  tab.updatedAt = nowISO();
  save();
  markStateDirty(); scheduleSync();
  tabColorPopup.classList.remove('open');
  rerender();
});

// Close palettes when clicking outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('.color-picker-wrap')) {
    colorPalette.classList.remove('open');
  }
  if (!e.target.closest('#tab-color-popup') && !e.target.closest('[data-action="color"]')) {
    tabColorPopup.classList.remove('open');
  }
});

colorPalette.addEventListener('mousedown', (e) => {
  e.preventDefault(); // keep focus in editor
  const swatch = e.target.closest('.color-swatch');
  if (!swatch) return;

  const color = swatch.dataset.color;
  document.execCommand('foreColor', false, color);
  colorBtnBar.style.background = color;
  contentEl.focus();
  colorPalette.classList.remove('open');
});

// ── Image Paste / Drop ───────────────────────────────
function insertImageFromFile(file) {
  if (!file || !file.type.startsWith('image/')) return false;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = document.createElement('img');
    img.src = ev.target.result;
    img.style.width = '400px';
    img.style.maxWidth = '100%';

    const sel = window.getSelection();
    if (sel && sel.rangeCount && contentEl.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(img);
      range.setStartAfter(img);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      contentEl.appendChild(img);
    }
    scheduleAutoSave();
  };
  reader.readAsDataURL(file);
  return true;
}

contentEl.addEventListener('paste', (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault();
      insertImageFromFile(item.getAsFile());
      break;
    }
  }
});

contentEl.addEventListener('dragover', (e) => {
  if ([...e.dataTransfer.items].some((i) => i.kind === 'file' && i.type.startsWith('image/'))) {
    e.preventDefault();
  }
});

contentEl.addEventListener('drop', (e) => {
  const files = e.dataTransfer?.files;
  if (!files?.length) return;
  for (const file of files) {
    if (insertImageFromFile(file)) {
      e.preventDefault();
      break;
    }
  }
});

// ── Image Resize ──────────────────────────────────────
const imgOverlay = document.getElementById('img-resize-overlay');
let selectedImg = null;
let resizing = false;
let resizeDir = 'se';
let resizeStart = { x: 0, y: 0, w: 0, h: 0 };

function updateImgOverlay() {
  if (!selectedImg) return;
  const rect = selectedImg.getBoundingClientRect();
  imgOverlay.style.left = `${rect.left}px`;
  imgOverlay.style.top = `${rect.top}px`;
  imgOverlay.style.width = `${rect.width}px`;
  imgOverlay.style.height = `${rect.height}px`;
}

function showImgOverlay(img) {
  selectedImg = img;
  updateImgOverlay();
  imgOverlay.classList.add('visible');
}

function hideImgOverlay() {
  if (!selectedImg) return;
  selectedImg = null;
  imgOverlay.classList.remove('visible');
}

contentEl.addEventListener('click', (e) => {
  if (e.target.tagName === 'IMG') {
    e.preventDefault();
    showImgOverlay(e.target);
  } else {
    hideImgOverlay();
  }
});

contentEl.addEventListener('scroll', () => { if (selectedImg) updateImgOverlay(); });
window.addEventListener('resize', () => { if (selectedImg) updateImgOverlay(); });
window.addEventListener('scroll', () => { if (selectedImg) updateImgOverlay(); }, true);

imgOverlay.addEventListener('mousedown', (e) => {
  const handle = e.target.closest('.img-resize-handle');
  if (!handle || !selectedImg) return;
  e.preventDefault();
  resizing = true;
  resizeDir = handle.dataset.dir;
  resizeStart = {
    x: e.clientX,
    y: e.clientY,
    w: selectedImg.offsetWidth,
    h: selectedImg.offsetHeight,
  };
});

window.addEventListener('mousemove', (e) => {
  if (!resizing || !selectedImg) return;
  const dx = e.clientX - resizeStart.x;
  const dy = e.clientY - resizeStart.y;

  if (resizeDir === 'se' || resizeDir === 'e') {
    selectedImg.style.width = `${Math.max(40, resizeStart.w + dx)}px`;
    selectedImg.style.height = '';
  }
  if (resizeDir === 'se' || resizeDir === 's') {
    selectedImg.style.height = `${Math.max(30, resizeStart.h + dy)}px`;
  }
  updateImgOverlay();
});

window.addEventListener('mouseup', () => {
  if (resizing) {
    resizing = false;
    scheduleAutoSave();
  }
});

// Hide overlay when clicking outside editor
document.addEventListener('mousedown', (e) => {
  if (!imgOverlay.contains(e.target) && !contentEl.contains(e.target)) {
    hideImgOverlay();
  }
});

// ── Search ───────────────────────────────────────────
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

// ── Event listeners ──────────────────────────────────
addTabBtn.addEventListener('click', addTab);
addNoteBtn.addEventListener('click', addNote);
addTodoBtn.addEventListener('click', async () => {
  const result = await showAddTodoModal();
  if (!result) return;
  addTodo(result.text, state.selectedNoteId || null, result.project, result.difficulty, result.deadline);
  rerender();
});
extractTodoBtn.addEventListener('click', extractTodosFromCurrentNote);

// ── Settings Drawer ──────────────────────────────────
const settingsBtn = document.getElementById('settings-btn');
const settingsDrawer = document.getElementById('settings-drawer');
const settingsOverlay = document.getElementById('settings-overlay');
const settingsCloseBtn = document.getElementById('settings-close-btn');
const geminiKeyInput = document.getElementById('gemini-api-key-input');
const geminiKeyToggle = document.getElementById('gemini-key-toggle');
const geminiKeySave = document.getElementById('gemini-key-save');
const geminiKeyClear = document.getElementById('gemini-key-clear');
const geminiKeyStatus = document.getElementById('gemini-key-status');
const scheduleAIPrefBehavior = document.getElementById('schedule-ai-pref-behavior');
const scheduleAIPrefDeadline = document.getElementById('schedule-ai-pref-deadline');
const scheduleAIPrefExisting = document.getElementById('schedule-ai-pref-existing');
const scheduleAIPrefSave = document.getElementById('schedule-ai-pref-save');
const scheduleAIPrefStatus = document.getElementById('schedule-ai-pref-status');

function openSettingsDrawer() {
  geminiKeyInput.value = getApiKey();
  const prefs = getScheduleAIPreferences();
  scheduleAIPrefBehavior.checked = !!prefs.useBehaviorSummary;
  scheduleAIPrefDeadline.checked = !!prefs.useDeadlineDistribution;
  scheduleAIPrefExisting.checked = !!prefs.useExistingTodoTexts;
  scheduleAIPrefStatus.textContent = '';
  updateKeyStatus();
  settingsDrawer.classList.add('open');
  settingsOverlay.classList.add('open');
}

function closeSettingsDrawer() {
  settingsDrawer.classList.remove('open');
  settingsOverlay.classList.remove('open');
}

function updateKeyStatus() {
  const key = getApiKey();
  if (key) {
    geminiKeyStatus.textContent = '✓ 저장됨';
    geminiKeyStatus.dataset.state = 'saved';
  } else {
    geminiKeyStatus.textContent = '미설정';
    geminiKeyStatus.dataset.state = 'empty';
  }
}

settingsBtn.addEventListener('click', openSettingsDrawer);
settingsCloseBtn.addEventListener('click', closeSettingsDrawer);
settingsOverlay.addEventListener('click', closeSettingsDrawer);

geminiKeyToggle.addEventListener('click', () => {
  const isPassword = geminiKeyInput.type === 'password';
  geminiKeyInput.type = isPassword ? 'text' : 'password';
});

geminiKeySave.addEventListener('click', () => {
  const key = geminiKeyInput.value.trim();
  if (!key) {
    geminiKeyStatus.textContent = '키를 입력해주세요';
    geminiKeyStatus.dataset.state = 'error';
    return;
  }
  saveApiKey(key);
  updateKeyStatus();
});

geminiKeyClear.addEventListener('click', () => {
  geminiKeyInput.value = '';
  saveApiKey('');
  updateKeyStatus();
});

scheduleAIPrefSave.addEventListener('click', () => {
  saveScheduleAIPreferences({
    useBehaviorSummary: scheduleAIPrefBehavior.checked,
    useDeadlineDistribution: scheduleAIPrefDeadline.checked,
    useExistingTodoTexts: scheduleAIPrefExisting.checked,
  });
  scheduleAIPrefStatus.textContent = '✓ 저장됨';
  scheduleAIPrefStatus.dataset.state = 'saved';
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && settingsDrawer.classList.contains('open')) {
    closeSettingsDrawer();
  }
});
titleEl.addEventListener('input', scheduleAutoSave);
contentEl.addEventListener('input', scheduleAutoSave);
contentEl.addEventListener('keydown', (e) => {
  if (e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'q') {
    e.preventDefault();
    addTodoFromSelection();
  }
});

// Prevent newline in title, move focus to content
titleEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    contentEl.focus();
  }
});

// ── Cloud Sync Status ────────────────────────────────
const SYNC_LABELS = {
  syncing: '☁ 동기화 중...',
  synced: '☁ 동기화됨',
  error: '☁ 오류',
};

setSyncStatusCallback((status) => {
  syncStatusEl.textContent = SYNC_LABELS[status] || '';
  syncStatusEl.dataset.status = status;
});

// ── Auth ─────────────────────────────────────────────
function renderAuthArea(user) {
  if (user) {
    authAreaEl.innerHTML = `
      <span class="user-info">
        ${user.photoURL
          ? `<img class="user-avatar" src="${user.photoURL}" alt="" referrerpolicy="no-referrer" />`
          : `<span class="user-avatar-initials">${(user.displayName || user.email || '?')[0].toUpperCase()}</span>`
        }
        <span class="user-name">${user.displayName || user.email || ''}</span>
      </span>
      <button id="logout-btn" class="logout-btn">로그아웃</button>
    `;
    document.getElementById('logout-btn').addEventListener('click', () => signOutUser());
  } else {
    authAreaEl.innerHTML = `<button id="login-btn" class="login-btn">Google 로그인</button>`;
    document.getElementById('login-btn').addEventListener('click', () => {
      if (hasPotentialLocalDraft()) {
        const ok = window.confirm(
          '로그인 시 클라우드 데이터가 로컬 데이터를 덮어쓸 수 있어요.\n'
          + '현재 이 브라우저에서 작성한 내용이 사라질 수 있습니다.\n'
          + '계속 로그인할까요?',
        );
        if (!ok) return;
      }
      signIn();
    });
    syncStatusEl.textContent = '';
  }
}

function hasPotentialLocalDraft() {
  if (state.tabs.length > 0) return true;
  return state.notes.some((note) => (note.title || '').trim() || (note.content || '').trim());
}

onAuthChange((user) => {
  renderAuthArea(user);
  if (user) {
    setCurrentUser(user.uid);
    loadFromCloud(rerender);
  } else {
    setCurrentUser(null);
    syncStatusEl.textContent = '';
  }
});

load();
initScheduleNav(rerender);
// 저장된 모드로 초기 UI 적용
applyAppMode(state.appMode || 'notes');
