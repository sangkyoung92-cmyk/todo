import { state, getCurrentTabNotes, nowISO, save, SECTION_COLORS } from '../state/store.js';
import { escapeHtml, formatDate, formatDateShort } from '../utils/format.js';
import {
  contentEl, noteListEl, saveStatusEl, tabListEl, titleEl,
  currentSectionNameEl, noteDateEl,
} from './dom.js';

export function renderTabs(onRender) {
  tabListEl.innerHTML = '';

  state.tabs.forEach((tab) => {
    const li = document.createElement('li');
    li.className = `section-tab ${tab.id === state.selectedTabId ? 'active' : ''}`;
    // Set colored background for inactive tabs; active tab is white via CSS
    if (tab.id !== state.selectedTabId) {
      li.style.background = tab.color;
    }

    const tabColors = [
      ...SECTION_COLORS,
      '#e74c3c', '#e67e22', '#f1c40f', '#2ecc71',
      '#3498db', '#9b59b6', '#1abc9c', '#e91e63',
    ];
    const swatchesHtml = tabColors
      .map((c) => `<button class="color-swatch" data-color="${c}" style="background:${c}" title="${c}"></button>`)
      .join('');

    li.innerHTML = `
      <span class="section-tab-label">${escapeHtml(tab.name)}</span>
      <div class="section-tab-actions">
        <div class="tab-color-picker-wrap" style="position:relative">
          <button class="icon-btn" data-action="color" title="색상 변경">
            <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 0a8 8 0 100 16A8 8 0 008 0zm0 2a6 6 0 110 12A6 6 0 018 2zm0 2a4 4 0 100 8A4 4 0 008 4z" opacity=".2"/><circle cx="8" cy="8" r="3" fill="currentColor"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
          </button>
          <div class="tab-color-palette" id="tab-color-${tab.id}">
            ${swatchesHtml}
          </div>
        </div>
        <button class="icon-btn" data-action="rename" title="이름 변경">
          <svg viewBox="0 0 16 16" fill="currentColor"><path d="M12.854.146a.5.5 0 010 .708l-1 1-1.414-1.414 1-.999a.5.5 0 01.707 0l.707.705zM11.086 2.207L9.672.793 2 8.464V10h1.537l7.549-7.793zM1 11.5A.5.5 0 011.5 11H3v-1h-.5A1.5 1.5 0 001 11.5V14a1 1 0 001 1h11a1 1 0 001-1v-2.5a1.5 1.5 0 00-1.5-1.5H12v1h.5a.5.5 0 01.5.5V14H2v-2.5z"/></svg>
        </button>
        <button class="icon-btn" data-action="delete" title="섹션 삭제">
          <svg viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 5.5A.5.5 0 016 6v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm2.5 0a.5.5 0 01.5.5v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm3 .5a.5.5 0 00-1 0v6a.5.5 0 001 0V6z"/><path fill-rule="evenodd" d="M14.5 3a1 1 0 01-1 1H13v9a2 2 0 01-2 2H5a2 2 0 01-2-2V4h-.5a1 1 0 01-1-1V2a1 1 0 011-1H6a1 1 0 011-1h2a1 1 0 011 1h3.5a1 1 0 011 1v1zM4.118 4L4 4.059V13a1 1 0 001 1h6a1 1 0 001-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z" clip-rule="evenodd"/></svg>
        </button>
      </div>
    `;

    li.addEventListener('click', (e) => {
      if (e.target.closest('.icon-btn')) return;
      state.selectedTabId = tab.id;
      const notes = getCurrentTabNotes();
      state.selectedNoteId = notes[0]?.id || null;
      save();
      onRender();
    });

    li.querySelector('[data-action="color"]').addEventListener('click', (e) => {
      e.stopPropagation();
      const palette = document.getElementById(`tab-color-${tab.id}`);
      // Close other open palettes
      document.querySelectorAll('.tab-color-palette.open').forEach((p) => {
        if (p.id !== `tab-color-${tab.id}`) p.classList.remove('open');
      });
      palette.classList.toggle('open');
    });

    document.getElementById(`tab-color-${tab.id}`).addEventListener('click', (e) => {
      e.stopPropagation();
      const swatch = e.target.closest('.color-swatch');
      if (!swatch) return;
      tab.color = swatch.dataset.color;
      tab.updatedAt = nowISO();
      save();
      onRender();
    });

    li.querySelector('[data-action="rename"]').addEventListener('click', () => {
      const next = prompt('섹션 이름을 입력하세요.', tab.name);
      if (!next?.trim()) return;
      tab.name = next.trim();
      tab.updatedAt = nowISO();
      save();
      onRender();
    });

    li.querySelector('[data-action="delete"]').addEventListener('click', () => {
      if (state.tabs.length === 1) {
        alert('섹션은 최소 1개 필요합니다.');
        return;
      }
      if (!confirm(`'${tab.name}' 섹션을 삭제할까요? (포함된 페이지도 삭제됩니다)`)) return;

      state.tabs = state.tabs.filter((x) => x.id !== tab.id);
      state.notes = state.notes.filter((n) => n.tabId !== tab.id);

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
      renderEditor();
      renderNotes(onRender);
      renderTabs(onRender);
    });

    li.querySelector('[data-action="delete-note"]').addEventListener('click', () => {
      if (!confirm('이 페이지를 삭제할까요?')) return;
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
  noteDateEl.textContent = `최종 수정: ${formatDate(note.updatedAt)}`;
  saveStatusEl.textContent = '저장됨';
}

export function renderAll(onRender) {
  renderTabs(onRender);
  renderNotes(onRender);
  renderEditor();
}

function stripHtml(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || '';
}
