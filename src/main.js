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
  rerender();

  // Focus the title input for immediate editing
  setTimeout(() => {
    titleEl.focus();
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

// ── Toolbar ──────────────────────────────────────────
toolbarEl.addEventListener('mousedown', (e) => {
  const btn = e.target.closest('.tbtn');
  if (!btn) return;

  // Ignore color-btn — handled separately
  if (btn.id === 'color-btn') return;

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
