import { state, getCurrentTabNotes, nowISO, save } from '../state/store.js';
import { escapeHtml, formatDate, formatDateShort } from '../utils/format.js';
import {
  contentEl, noteListEl, saveStatusEl, tabListEl, titleEl,
  currentSectionNameEl, noteDateEl,
} from './dom.js';
import { markDirty, markStateDirty, scheduleSync } from '../sync/cloud.js';
import { renderTodos } from './todo.js';

let editingTabId = null;

export function renderTabs(onRender) {
  tabListEl.innerHTML = '';

  state.tabs.forEach((tab) => {
    const isEditing = editingTabId === tab.id;
    const li = document.createElement('li');
    li.className = `section-tab ${tab.id === state.selectedTabId ? 'active' : ''}`;
    // Set colored background for inactive tabs; active tab is white via CSS
    if (tab.id !== state.selectedTabId) {
      li.style.background = tab.color;
    }

    li.innerHTML = `
      <span class="section-tab-label">
        ${isEditing
    ? `<input class="section-tab-rename-input" type="text" value="${escapeHtml(tab.name)}" aria-label="섹션 이름 수정" />`
    : escapeHtml(tab.name)}
      </span>
      <div class="section-tab-actions">
        <button class="icon-btn" data-action="color" title="색상 변경">
          <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 0a8 8 0 100 16A8 8 0 008 0zm0 2a6 6 0 110 12A6 6 0 018 2zm0 2a4 4 0 100 8A4 4 0 008 4z" opacity=".2"/><circle cx="8" cy="8" r="3" fill="currentColor"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
        </button>
        <button class="icon-btn" data-action="delete" title="섹션 삭제">
          <svg viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 5.5A.5.5 0 016 6v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm2.5 0a.5.5 0 01.5.5v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm3 .5a.5.5 0 00-1 0v6a.5.5 0 001 0V6z"/><path fill-rule="evenodd" d="M14.5 3a1 1 0 01-1 1H13v9a2 2 0 01-2 2H5a2 2 0 01-2-2V4h-.5a1 1 0 01-1-1V2a1 1 0 011-1H6a1 1 0 011-1h2a1 1 0 011 1h3.5a1 1 0 011 1v1zM4.118 4L4 4.059V13a1 1 0 001 1h6a1 1 0 001-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z" clip-rule="evenodd"/></svg>
        </button>
      </div>
    `;

    li.addEventListener('click', (e) => {
      if (isEditing) return;
      if (e.target.closest('.icon-btn')) return;
      state.selectedTabId = tab.id;
      const notes = getCurrentTabNotes();
      state.selectedNoteId = notes[0]?.id || null;
      save();
      markStateDirty(); scheduleSync();
      onRender();
    });

    li.addEventListener('dblclick', (e) => {
      if (e.target.closest('.icon-btn')) return;
      editingTabId = tab.id;
      onRender();
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
          markStateDirty(); scheduleSync();
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
      if (!confirm(`'${tab.name}' 섹션을 삭제할까요? (포함된 페이지도 삭제됩니다)`)) return;

      const deletedNoteIds = state.notes.filter((n) => n.tabId === tab.id).map((n) => n.id);
      state.pendingDeleteNoteIds.push(...deletedNoteIds);

      state.tabs = state.tabs.filter((x) => x.id !== tab.id);
      state.notes = state.notes.filter((n) => n.tabId !== tab.id);

      if (state.selectedTabId === tab.id) {
        state.selectedTabId = state.tabs[0]?.id || null;
      }

      const notes = getCurrentTabNotes();
      state.selectedNoteId = notes[0]?.id || null;
      save();
      markStateDirty(); scheduleSync();
      onRender();
    });

    tabListEl.appendChild(li);
  });
}

export function renderNotes(onRender) {
  noteListEl.innerHTML = '';

  const isSearch = state.searchQuery.trim().length > 0;

  // Update section name label
  if (isSearch) {
    currentSectionNameEl.textContent = `검색: "${state.searchQuery}"`;
  } else {
    const tab = state.tabs.find((t) => t.id === state.selectedTabId);
    currentSectionNameEl.textContent = tab ? tab.name : '페이지';
  }

  let notes;
  if (isSearch) {
    const q = state.searchQuery.trim().toLowerCase();
    // Search across all notes, strip HTML for content search
    notes = state.notes
      .filter((n) => {
        const titleMatch = n.title.toLowerCase().includes(q);
        const contentText = stripHtml(n.content).toLowerCase();
        return titleMatch || contentText.includes(q);
      })
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  } else {
    notes = getCurrentTabNotes();
  }

  if (notes.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'empty-state';
    empty.textContent = isSearch ? '검색 결과가 없습니다.' : '페이지가 없습니다.';
    noteListEl.appendChild(empty);
    return;
  }

  notes.forEach((note) => {
    const tab = state.tabs.find((t) => t.id === note.tabId);
    const li = document.createElement('li');
    li.className = `page-item ${note.id === state.selectedNoteId ? 'active' : ''}`;

    const sectionTag = isSearch && tab
      ? `<span class="page-section-tag" style="background:${tab.color}">${escapeHtml(tab.name)}</span>`
      : '';

    li.innerHTML = `
      <div class="page-item-body">
        <div class="page-title">${escapeHtml(note.title || '제목 없음')}</div>
        <div class="page-meta">${formatDateShort(note.updatedAt)}</div>
        ${sectionTag}
      </div>
      <div class="page-actions">
        <button class="icon-btn" data-action="delete-note" title="페이지 삭제">
          <svg viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 5.5A.5.5 0 016 6v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm2.5 0a.5.5 0 01.5.5v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm3 .5a.5.5 0 00-1 0v6a.5.5 0 001 0V6z"/><path fill-rule="evenodd" d="M14.5 3a1 1 0 01-1 1H13v9a2 2 0 01-2 2H5a2 2 0 01-2-2V4h-.5a1 1 0 01-1-1V2a1 1 0 011-1H6a1 1 0 011-1h2a1 1 0 011 1h3.5a1 1 0 011 1v1zM4.118 4L4 4.059V13a1 1 0 001 1h6a1 1 0 001-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z" clip-rule="evenodd"/></svg>
        </button>
      </div>
    `;

    li.addEventListener('click', (e) => {
      if (e.target.closest('.icon-btn')) return;
      // If search result from different tab, switch to that tab too
      if (isSearch && note.tabId !== state.selectedTabId) {
        state.selectedTabId = note.tabId;
        state.searchQuery = '';
        document.getElementById('search-input').value = '';
      }
      state.selectedNoteId = note.id;
      save();
      markStateDirty(); scheduleSync();
      renderEditor();
      renderNotes(onRender);
      renderTabs(onRender);
    });

    li.querySelector('[data-action="delete-note"]').addEventListener('click', () => {
      if (!confirm('이 페이지를 삭제할까요?')) return;
      state.pendingDeleteNoteIds.push(note.id);
      state.notes = state.notes.filter((x) => x.id !== note.id);
      const next = getCurrentTabNotes()[0];
      state.selectedNoteId = next?.id || null;
      save();
      markStateDirty(); scheduleSync();
      onRender();
    });

    noteListEl.appendChild(li);
  });
}

export function renderEditor() {
  const note = state.notes.find((x) => x.id === state.selectedNoteId);
  const disabled = !note;

  titleEl.disabled = disabled;
  contentEl.contentEditable = disabled ? 'false' : 'true';

  if (disabled) {
    titleEl.value = '';
    contentEl.innerHTML = '';
    noteDateEl.textContent = '';
    saveStatusEl.textContent = '선택된 페이지 없음';
    return;
  }

  titleEl.value = note.title;
  contentEl.innerHTML = note.content;
  contentEl.classList.toggle('ruled-paper', state.notePaperMode !== 'plain');
  noteDateEl.textContent = `최종 수정: ${formatDate(note.updatedAt)}`;
  saveStatusEl.textContent = '저장됨';
}

export function renderAll(onRender) {
  if (state.appMode === 'schedule') {
    // 스케줄 탭 렌더링은 schedule.js에서 담당 (main.js에서 호출)
    return;
  }
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
