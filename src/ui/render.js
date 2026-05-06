import { state, getCurrentTabNotes, nowISO, save } from '../state/store.js';
import { escapeHtml, formatDate, formatDateShort } from '../utils/format.js';
import {
  addNoteBtn,
  contentEl,
  currentSectionNameEl,
  extractTodoBtn,
  noteDateEl,
  noteListEl,
  noteRecordBtn,
  saveStatusEl,
  tabListEl,
  titleEl,
  trashToggleBtn,
} from './dom.js';
import { markDirty, markStateDirty, scheduleSync } from '../sync/cloud.js';
import { renderTodos } from './todo.js';

let editingTabId = null;
let draggedSectionId = null;
let draggedNoteId = null;
let suppressDragClick = false;
let lastRenderedNoteKey = null;

function clearDragClasses() {
  document
    .querySelectorAll('.section-tab.dragging, .section-tab.drag-over, .section-tab.drop-before, .section-tab.drop-after, .page-item.dragging')
    .forEach((el) => {
      el.classList.remove('dragging', 'drag-over', 'drop-before', 'drop-after');
    });
}

function hasDragType(dataTransfer, type) {
  return Array.from(dataTransfer?.types || []).includes(type);
}

function queueNoteDeletion(noteId) {
  if (!noteId || state.pendingDeleteNoteIds.includes(noteId)) return;
  state.pendingDeleteNoteIds.push(noteId);
}

function clearSearchUI() {
  state.searchQuery = '';
  const searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.value = '';
}

function syncNotesPanelHead() {
  const trashMode = state.noteListMode === 'trash';

  if (trashToggleBtn) {
    trashToggleBtn.textContent = trashMode
      ? '노트 보기'
      : `휴지통${state.deletedNotes.length ? ` (${state.deletedNotes.length})` : ''}`;
    trashToggleBtn.classList.toggle('active', trashMode);
    trashToggleBtn.setAttribute('aria-pressed', String(trashMode));
  }

  if (addNoteBtn) {
    addNoteBtn.hidden = trashMode;
    addNoteBtn.disabled = trashMode;
  }
}

function reorderSection(sourceTabId, targetTabId, insertAfter) {
  if (!sourceTabId || !targetTabId || sourceTabId === targetTabId) return false;

  const fromIndex = state.tabs.findIndex((tab) => tab.id === sourceTabId);
  const targetIndex = state.tabs.findIndex((tab) => tab.id === targetTabId);
  if (fromIndex < 0 || targetIndex < 0) return false;

  const [tab] = state.tabs.splice(fromIndex, 1);
  let nextIndex = state.tabs.findIndex((item) => item.id === targetTabId);
  if (insertAfter) nextIndex += 1;
  state.tabs.splice(nextIndex, 0, tab);
  tab.updatedAt = nowISO();
  save();
  markStateDirty();
  scheduleSync();
  return true;
}

function moveNoteToSection(noteId, targetTabId) {
  const note = state.notes.find((item) => item.id === noteId);
  const tab = state.tabs.find((item) => item.id === targetTabId);
  if (!note || !tab || note.tabId === targetTabId) return false;

  const now = nowISO();
  note.tabId = targetTabId;
  note.updatedAt = now;
  tab.updatedAt = now;
  state.noteListMode = 'notes';
  state.selectedDeletedNoteId = null;
  state.selectedTabId = targetTabId;
  state.selectedNoteId = note.id;
  clearSearchUI();

  save();
  markDirty(note.id);
  markStateDirty();
  scheduleSync();
  return true;
}

function moveNoteToTrash(note) {
  if (!note) return false;

  const tab = state.tabs.find((item) => item.id === note.tabId);
  state.deletedNotes = state.deletedNotes.filter((item) => item.id !== note.id);
  state.deletedNotes.unshift({
    ...note,
    deletedAt: nowISO(),
    deletedFromTabId: note.tabId,
    deletedFromTabName: tab?.name || '',
  });
  queueNoteDeletion(note.id);
  state.notes = state.notes.filter((item) => item.id !== note.id);
  return true;
}

function restoreDeletedNote(noteId, onRender) {
  const deletedIndex = state.deletedNotes.findIndex((item) => item.id === noteId);
  if (deletedIndex < 0) return;

  const deletedNote = state.deletedNotes[deletedIndex];
  const restoreTabId = state.tabs.some((tab) => tab.id === deletedNote.deletedFromTabId)
    ? deletedNote.deletedFromTabId
    : (state.selectedTabId || state.tabs[0]?.id || null);

  if (!restoreTabId) {
    alert('복원할 섹션이 없습니다. 섹션을 먼저 만든 뒤 다시 시도해주세요.');
    return;
  }

  state.deletedNotes.splice(deletedIndex, 1);
  state.pendingDeleteNoteIds = state.pendingDeleteNoteIds.filter((id) => id !== noteId);

  const restoredNote = {
    ...deletedNote,
    tabId: restoreTabId,
    updatedAt: nowISO(),
  };
  delete restoredNote.deletedAt;
  delete restoredNote.deletedFromTabId;
  delete restoredNote.deletedFromTabName;

  state.notes.push(restoredNote);
  state.noteListMode = 'notes';
  state.selectedDeletedNoteId = null;
  state.selectedTabId = restoreTabId;
  state.selectedNoteId = restoredNote.id;
  save();
  markDirty(restoredNote.id);
  markStateDirty();
  scheduleSync();
  onRender();
}

function permanentlyDeleteTrashedNote(noteId, onRender) {
  const deletedIndex = state.deletedNotes.findIndex((item) => item.id === noteId);
  if (deletedIndex < 0) return;

  state.deletedNotes.splice(deletedIndex, 1);
  if (state.selectedDeletedNoteId === noteId) {
    state.selectedDeletedNoteId = state.deletedNotes[0]?.id || null;
  }
  save();
  markStateDirty();
  scheduleSync();
  onRender();
}

function renderTrashItemActions() {
  return `
    <button class="ghost-btn ghost-btn--small" data-action="restore-note" type="button">복원</button>
    <button class="icon-btn danger-icon-btn" data-action="purge-note" title="영구 삭제" type="button">
      <svg viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 5.5A.5.5 0 016 6v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm2.5 0a.5.5 0 01.5.5v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm3 .5a.5.5 0 00-1 0v6a.5.5 0 001 0V6z"/><path fill-rule="evenodd" d="M14.5 3a1 1 0 01-1 1H13v9a2 2 0 01-2 2H5a2 2 0 01-2-2V4h-.5a1 1 0 01-1-1V2a1 1 0 011-1H6a1 1 0 011-1h2a1 1 0 011 1h3.5a1 1 0 011 1v1zM4.118 4L4 4.059V13a1 1 0 001 1h6a1 1 0 001-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z" clip-rule="evenodd"/></svg>
    </button>
  `;
}

function renderActiveItemActions() {
  return `
    <button class="icon-btn" data-action="delete-note" title="페이지 삭제" type="button">
      <svg viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 5.5A.5.5 0 016 6v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm2.5 0a.5.5 0 01.5.5v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm3 .5a.5.5 0 00-1 0v6a.5.5 0 001 0V6z"/><path fill-rule="evenodd" d="M14.5 3a1 1 0 01-1 1H13v9a2 2 0 01-2 2H5a2 2 0 01-2-2V4h-.5a1 1 0 01-1-1V2a1 1 0 011-1H6a1 1 0 011-1h2a1 1 0 011 1h3.5a1 1 0 011 1v1zM4.118 4L4 4.059V13a1 1 0 001 1h6a1 1 0 001-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z" clip-rule="evenodd"/></svg>
    </button>
  `;
}

export function renderTabs(onRender) {
  tabListEl.innerHTML = '';
  const activeTab = state.tabs.find((tab) => tab.id === state.selectedTabId);
  if (tabListEl.parentElement && activeTab?.color) {
    tabListEl.parentElement.style.setProperty('--active-section-color', activeTab.color);
  }

  state.tabs.forEach((tab) => {
    const isEditing = editingTabId === tab.id;
    const li = document.createElement('li');
    li.className = `section-tab ${tab.id === state.selectedTabId && state.noteListMode !== 'trash' ? 'active' : ''}`;
    li.style.setProperty('--section-color', tab.color);
    li.style.background = tab.color;
    li.draggable = !isEditing;
    li.dataset.tabId = tab.id;
    li.innerHTML = `
      <span class="section-tab-label">
        ${isEditing
    ? `<input class="section-tab-rename-input" type="text" value="${escapeHtml(tab.name)}" aria-label="섹션 이름 수정" />`
    : escapeHtml(tab.name)}
      </span>
      <div class="section-tab-actions">
        <button class="icon-btn" data-action="color" title="색상 변경" type="button">
          <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 0a8 8 0 100 16A8 8 0 008 0zm0 2a6 6 0 110 12A6 6 0 018 2zm0 2a4 4 0 100 8A4 4 0 008 4z" opacity=".2"/><circle cx="8" cy="8" r="3" fill="currentColor"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
        </button>
        <button class="icon-btn" data-action="delete" title="섹션 삭제" type="button">
          <svg viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 5.5A.5.5 0 016 6v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm2.5 0a.5.5 0 01.5.5v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm3 .5a.5.5 0 00-1 0v6a.5.5 0 001 0V6z"/><path fill-rule="evenodd" d="M14.5 3a1 1 0 01-1 1H13v9a2 2 0 01-2 2H5a2 2 0 01-2-2V4h-.5a1 1 0 01-1-1V2a1 1 0 011-1H6a1 1 0 011-1h2a1 1 0 011 1h3.5a1 1 0 011 1v1zM4.118 4L4 4.059V13a1 1 0 001 1h6a1 1 0 001-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z" clip-rule="evenodd"/></svg>
        </button>
      </div>
    `;

    li.addEventListener('click', (e) => {
      if (isEditing) return;
      if (e.target.closest('.icon-btn')) return;
      if (suppressDragClick) {
        suppressDragClick = false;
        return;
      }
      state.noteListMode = 'notes';
      state.selectedDeletedNoteId = null;
      state.selectedTabId = tab.id;
      state.selectedNoteId = getCurrentTabNotes()[0]?.id || null;
      save();
      markStateDirty();
      scheduleSync();
      onRender();
    });

    li.addEventListener('dblclick', (e) => {
      if (e.target.closest('.icon-btn')) return;
      editingTabId = tab.id;
      onRender();
    });

    li.addEventListener('dragstart', (e) => {
      if (isEditing || e.target.closest('.icon-btn, input')) {
        e.preventDefault();
        return;
      }
      draggedSectionId = tab.id;
      suppressDragClick = true;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('application/x-onenote-section-id', tab.id);
      setTimeout(() => li.classList.add('dragging'), 0);
    });

    li.addEventListener('dragover', (e) => {
      const sectionId = hasDragType(e.dataTransfer, 'application/x-onenote-section-id')
        ? draggedSectionId || e.dataTransfer.getData('application/x-onenote-section-id')
        : '';
      const noteId = hasDragType(e.dataTransfer, 'application/x-onenote-note-id')
        ? draggedNoteId || e.dataTransfer.getData('application/x-onenote-note-id')
        : '';
      if (!sectionId && !noteId) return;

      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      li.classList.toggle('drag-over', !!noteId);
      li.classList.remove('drop-before', 'drop-after');

      if (sectionId && sectionId !== tab.id) {
        const rect = li.getBoundingClientRect();
        li.classList.add(e.clientX > rect.left + rect.width / 2 ? 'drop-after' : 'drop-before');
      }
    });

    li.addEventListener('dragleave', () => {
      li.classList.remove('drag-over', 'drop-before', 'drop-after');
    });

    li.addEventListener('drop', (e) => {
      const sectionId = draggedSectionId || e.dataTransfer.getData('application/x-onenote-section-id');
      const noteId = draggedNoteId || e.dataTransfer.getData('application/x-onenote-note-id');
      if (!sectionId && !noteId) return;

      e.preventDefault();
      const rect = li.getBoundingClientRect();
      const insertAfter = e.clientX > rect.left + rect.width / 2;
      const changed = sectionId
        ? reorderSection(sectionId, tab.id, insertAfter)
        : moveNoteToSection(noteId, tab.id);

      draggedSectionId = null;
      draggedNoteId = null;
      clearDragClasses();
      if (changed) onRender();
    });

    li.addEventListener('dragend', () => {
      draggedSectionId = null;
      clearDragClasses();
      setTimeout(() => {
        suppressDragClick = false;
      }, 0);
    });

    if (isEditing) {
      const input = li.querySelector('.section-tab-rename-input');
      const finishRename = ({ commit }) => {
        if (!commit) {
          editingTabId = null;
          onRender();
          return;
        }

        const nextName = input.value.trim();
        if (!nextName) {
          input.focus();
          input.select();
          return;
        }

        if (nextName !== tab.name) {
          tab.name = nextName;
          tab.updatedAt = nowISO();
          save();
          markStateDirty();
          scheduleSync();
        }
        editingTabId = null;
        onRender();
      };

      input.addEventListener('click', (e) => e.stopPropagation());
      input.addEventListener('dblclick', (e) => e.stopPropagation());
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          finishRename({ commit: true });
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          finishRename({ commit: false });
        }
      });
      input.addEventListener('blur', () => finishRename({ commit: true }));

      setTimeout(() => {
        input.focus();
        input.select();
      }, 0);
    }

    li.querySelector('[data-action="color"]').addEventListener('click', (e) => {
      if (isEditing) return;
      e.stopPropagation();
      const popup = document.getElementById('tab-color-popup');
      const rect = e.currentTarget.getBoundingClientRect();
      const isOpen = popup.classList.contains('open') && popup.dataset.tabId === tab.id;
      popup.classList.remove('open');
      if (!isOpen) {
        popup.dataset.tabId = tab.id;
        popup.style.top = `${rect.bottom + 6}px`;
        popup.style.left = `${rect.left}px`;
        popup.classList.add('open');
      }
    });

    li.querySelector('[data-action="delete"]').addEventListener('click', () => {
      if (isEditing) return;
      if (state.tabs.length === 1) {
        alert('섹션은 최소 1개 필요합니다.');
        return;
      }
      if (!confirm(`'${tab.name}' 섹션을 삭제할까요? 포함된 페이지는 휴지통으로 이동합니다.`)) return;

      state.notes
        .filter((note) => note.tabId === tab.id)
        .forEach((note) => moveNoteToTrash(note));

      state.tabs = state.tabs.filter((item) => item.id !== tab.id);
      if (state.selectedTabId === tab.id) {
        state.selectedTabId = state.tabs[0]?.id || null;
      }
      state.noteListMode = 'notes';
      state.selectedDeletedNoteId = null;
      state.selectedNoteId = getCurrentTabNotes()[0]?.id || null;
      save();
      markStateDirty();
      scheduleSync();
      onRender();
    });

    tabListEl.appendChild(li);
  });
}

export function renderNotes(onRender) {
  noteListEl.innerHTML = '';
  syncNotesPanelHead();

  const trashMode = state.noteListMode === 'trash';
  const isSearch = state.searchQuery.trim().length > 0;

  if (trashMode) {
    currentSectionNameEl.textContent = '휴지통';
  } else if (isSearch) {
    currentSectionNameEl.textContent = `검색: "${state.searchQuery}"`;
  } else {
    const tab = state.tabs.find((item) => item.id === state.selectedTabId);
    currentSectionNameEl.textContent = tab ? tab.name : '페이지';
  }

  let notes;
  if (trashMode) {
    notes = [...state.deletedNotes].sort((a, b) => (a.deletedAt < b.deletedAt ? 1 : -1));
    if (!state.selectedDeletedNoteId && notes.length) {
      state.selectedDeletedNoteId = notes[0].id;
    }
  } else if (isSearch) {
    const q = state.searchQuery.trim().toLowerCase();
    notes = state.notes
      .filter((note) => {
        const titleMatch = (note.title || '').toLowerCase().includes(q);
        const contentText = stripHtml(note.content || '').toLowerCase();
        return titleMatch || contentText.includes(q);
      })
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  } else {
    notes = getCurrentTabNotes();
  }

  if (notes.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'empty-state';
    if (trashMode) {
      empty.innerHTML = '<strong>휴지통이 비어 있습니다.</strong><span>삭제한 페이지가 여기에 보관됩니다.</span>';
    } else if (isSearch) {
      empty.innerHTML = '<strong>검색 결과가 없습니다.</strong><span>다른 단어로 다시 찾아보세요.</span>';
    } else {
      empty.innerHTML = '<strong>아직 페이지가 없습니다.</strong><span>상단의 + 페이지 버튼으로 첫 노트를 만드세요.</span>';
    }
    noteListEl.appendChild(empty);
    return;
  }

  notes.forEach((note) => {
    const tab = state.tabs.find((item) => item.id === note.tabId || item.id === note.deletedFromTabId);
    const isActive = trashMode
      ? note.id === state.selectedDeletedNoteId
      : note.id === state.selectedNoteId;
    const li = document.createElement('li');
    li.className = `page-item ${isActive ? 'active' : ''}${trashMode ? ' trashed' : ''}`;
    li.draggable = !trashMode;
    li.dataset.noteId = note.id;

    const sectionTag = trashMode
      ? `<span class="page-section-tag trash-tag">${escapeHtml(note.deletedFromTabName || tab?.name || '삭제된 섹션')}</span>`
      : (isSearch && tab
        ? `<span class="page-section-tag" style="background:${tab.color}">${escapeHtml(tab.name)}</span>`
        : '');
    const metaText = trashMode
      ? `삭제: ${formatDateShort(note.deletedAt || note.updatedAt)}`
      : formatDateShort(note.updatedAt);

    li.innerHTML = `
      <div class="page-item-body">
        <div class="page-title">${escapeHtml(note.title || '제목 없음')}</div>
        <div class="page-meta">${metaText}</div>
        ${sectionTag}
      </div>
      <div class="page-actions">
        ${trashMode ? renderTrashItemActions() : renderActiveItemActions()}
      </div>
    `;

    li.addEventListener('click', (e) => {
      if (e.target.closest('.icon-btn, .ghost-btn')) return;
      if (suppressDragClick || li.classList.contains('dragging')) {
        suppressDragClick = false;
        return;
      }

      if (trashMode) {
        state.selectedDeletedNoteId = note.id;
        save();
        renderEditor();
        renderNotes(onRender);
        return;
      }

      if (isSearch && note.tabId !== state.selectedTabId) {
        state.selectedTabId = note.tabId;
        clearSearchUI();
      }
      state.noteListMode = 'notes';
      state.selectedDeletedNoteId = null;
      state.selectedNoteId = note.id;
      save();
      markStateDirty();
      scheduleSync();
      renderEditor();
      renderNotes(onRender);
      renderTabs(onRender);
    });

    li.addEventListener('dragstart', (e) => {
      if (trashMode || e.target.closest('.icon-btn, .ghost-btn')) {
        e.preventDefault();
        return;
      }
      draggedNoteId = note.id;
      suppressDragClick = true;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('application/x-onenote-note-id', note.id);
      setTimeout(() => li.classList.add('dragging'), 0);
    });

    li.addEventListener('dragend', () => {
      draggedNoteId = null;
      clearDragClasses();
      setTimeout(() => {
        suppressDragClick = false;
      }, 0);
    });

    if (trashMode) {
      li.querySelector('[data-action="restore-note"]').addEventListener('click', () => {
        restoreDeletedNote(note.id, onRender);
      });
      li.querySelector('[data-action="purge-note"]').addEventListener('click', () => {
        if (!confirm('휴지통에서 영구 삭제할까요? 이 작업은 되돌릴 수 없습니다.')) return;
        permanentlyDeleteTrashedNote(note.id, onRender);
      });
    } else {
      li.querySelector('[data-action="delete-note"]').addEventListener('click', () => {
        if (!confirm('이 페이지를 휴지통으로 이동할까요?')) return;
        moveNoteToTrash(note);
        state.selectedNoteId = getCurrentTabNotes()[0]?.id || null;
        save();
        markStateDirty();
        scheduleSync();
        onRender();
      });
    }

    noteListEl.appendChild(li);
  });
}

export function renderEditor() {
  const trashMode = state.noteListMode === 'trash';
  const note = trashMode
    ? (state.deletedNotes.find((item) => item.id === state.selectedDeletedNoteId) || null)
    : (state.notes.find((item) => item.id === state.selectedNoteId) || null);
  const readOnly = trashMode || !note;
  const noteKey = note ? `${trashMode ? 'trash' : 'note'}:${note.id}` : null;

  titleEl.disabled = readOnly;
  contentEl.contentEditable = readOnly ? 'false' : 'true';
  if (noteRecordBtn) noteRecordBtn.disabled = readOnly;
  if (extractTodoBtn) extractTodoBtn.disabled = readOnly;
  contentEl.dataset.placeholder = trashMode
    ? '휴지통에서 복원할 페이지를 선택하세요.'
    : '여기에 내용을 입력하세요...';

  if (!note) {
    titleEl.value = '';
    contentEl.innerHTML = '';
    contentEl.style.setProperty('--note-virtual-scroll-space', '0px');
    noteDateEl.textContent = trashMode
      ? '휴지통에서 페이지를 선택하면 여기에서 내용을 미리 볼 수 있습니다.'
      : '';
    lastRenderedNoteKey = null;
    saveStatusEl.textContent = trashMode ? '휴지통' : '선택된 페이지 없음';
    return;
  }

  if (noteKey !== lastRenderedNoteKey) {
    contentEl.style.setProperty('--note-virtual-scroll-space', '0px');
  }

  titleEl.value = note.title || '';
  contentEl.innerHTML = note.content || '';
  contentEl.classList.toggle('ruled-paper', state.notePaperMode !== 'plain');
  noteDateEl.textContent = trashMode
    ? `휴지통 이동: ${formatDate(note.deletedAt || note.updatedAt)}`
    : `최종 수정: ${formatDate(note.updatedAt)}`;
  saveStatusEl.textContent = trashMode ? '휴지통' : '저장됨';
  lastRenderedNoteKey = noteKey;
}

export function renderAll(onRender) {
  if (state.appMode === 'schedule') return;
  renderTabs(onRender);
  renderNotes(onRender);
  renderEditor();
  renderTodos(onRender);
}

function stripHtml(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || '';
}
