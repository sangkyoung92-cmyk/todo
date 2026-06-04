import {
  load,
  nowISO,
  save,
  state,
  uid,
  getNextSectionColor,
  getCurrentTabPageSections,
  pruneDeletedNotes,
} from './state/store.js';
import {
  addNoteBtn, addPageSectionBtn, addTabBtn, contentEl, saveStatusEl, titleEl,
  searchInput, toolbarEl, syncStatusEl, authAreaEl, addTodoBtn, extractTodoBtn,
  noteRecordBtn,
  recordingPanelEl,
  recordingStatusEl,
  recordingWaveformEl,
  recordingTimerEl,
  recordingStopBtn,
  toggleTodoPanelBtn, todoPanelEl, notesLayoutEl,
  appModeTabs, notesViewEl, scheduleViewEl, sectionTabsBarEl,
  scheduleWorkspaceEl,
  addScheduleTaskBtn,
  plannerExtractBtn,
  plannerTopbarToggleBtn,
  topbarTrashBtn,
} from './ui/dom.js';
import { renderAll, renderNotes, renderTabs, renderEditor } from './ui/render.js?v=20260604-section-bulk';
import { signIn, signInRedirect, signOutUser, onAuthChange } from './auth.js';
import {
  setCurrentUser, markDirty, markStateDirty, scheduleSync,
  loadFromCloud, setSyncStatusCallback,
} from './sync/cloud.js';
import { addTodo } from './ui/todo.js';
import { extractTodoCandidatesFromHtml, getSelectedEditorText } from './todo/extract.js';
import { extractTodosWithAI, getApiKey, getPlannerSuggestionsWithAI, saveApiKey } from './ai/extract.js';
import { getScheduleAIPreferences, saveScheduleAIPreferences } from './ai/schedule-preferences.js';
import { summarizeRecordingWithAI } from './ai/summary.js';
import { getSummaryPrompt, resetSummaryPrompt, saveSummaryPrompt } from './ai/summary-settings.js';
import { createSpeechRecorder } from './audio/speech-recorder.js';
import { buildBehaviorSummary } from './tracking/behavior.js';
import { extractDeadlineFromText } from './utils/parse-date-kr.js';
import { showAddTodoModal } from './ui/todo-modal.js?v=20260527-page-sections';
import { createRecordingPanel } from './ui/recording-panel.js';
import { initNotesPanelResize, initSchedulePanelResize } from './ui/panel-resize.js';
import {
  renderSchedule,
  initScheduleNav,
  addScheduleTask,
  renderSmartPlanner,
  buildPlannerLocalSuggestions,
  setPlannerSuggestions,
  setPlannerStatus,
} from './ui/schedule.js?v=20260527-page-sections';
import { showScheduleModal } from './ui/schedule-modal.js';
import { createInboxItem, getPlannerSnapshot } from '../packages/schedule-core/planner.js';

function rerender() {
  pruneExpiredTrash();
  if (state.appMode === 'schedule') {
    renderSchedule(rerender);
  } else {
    renderAll(rerender);
  }
  syncEditorChrome();
}

function pruneExpiredTrash() {
  const changed = pruneDeletedNotes();
  if (!changed) return false;

  save();
  markStateDirty();
  scheduleSync();
  return true;
}

function setNoteListMode(mode, options = {}) {
  state.noteListMode = mode === 'trash' ? 'trash' : 'notes';
  state.searchQuery = '';
  searchInput.value = '';

  if (state.noteListMode === 'trash') {
    state.selectedDeletedNoteId = options.selectedDeletedNoteId || state.deletedNotes[0]?.id || null;
    state.selectedPageSectionId = null;
    state.selectedNoteId = null;
  } else {
    state.selectedDeletedNoteId = null;
    if (options.selectedTabId) state.selectedTabId = options.selectedTabId;
    state.selectedNoteId = options.selectedNoteId
      || state.notes.find((note) => note.tabId === state.selectedTabId)?.id
      || null;
    const selectedNote = state.notes.find((note) => note.id === state.selectedNoteId);
    state.selectedPageSectionId = selectedNote?.pageSectionId || null;
  }

  save();
  rerender();
}

function syncEditorChrome() {
  if (!contentEl) return;
  const isRuled = state.notePaperMode !== 'plain';
  contentEl.classList.toggle('ruled-paper', isRuled);
  document.getElementById('toggle-ruled-btn')?.classList.toggle('active', isRuled);
}

const MAX_EDITOR_VIRTUAL_SPACE = 2400;
const EDITOR_VIRTUAL_SCROLL_TRIGGER = 2;

function getEditorVirtualScrollSpace() {
  if (!contentEl) return 0;
  const value = Number.parseFloat(
    getComputedStyle(contentEl).getPropertyValue('--note-virtual-scroll-space'),
  );
  return Number.isFinite(value) ? value : 0;
}

function setEditorVirtualScrollSpace(height) {
  if (!contentEl) return;
  const next = Math.max(0, Math.min(MAX_EDITOR_VIRTUAL_SPACE, Math.round(height)));
  contentEl.style.setProperty('--note-virtual-scroll-space', `${next}px`);
}

function getEditorNativeScrollable() {
  if (!contentEl) return 0;
  const virtualSpace = getEditorVirtualScrollSpace();
  return Math.max(0, contentEl.scrollHeight - contentEl.clientHeight - virtualSpace);
}

function expandEditorVirtualScroll(deltaY) {
  if (!contentEl || deltaY <= 0) return;
  const maxScroll = Math.max(0, contentEl.scrollHeight - contentEl.clientHeight);
  const remaining = maxScroll - contentEl.scrollTop;
  if (remaining > EDITOR_VIRTUAL_SCROLL_TRIGGER) return;
  setEditorVirtualScrollSpace(getEditorVirtualScrollSpace() + deltaY);
}

function syncEditorVirtualScrollSpace() {
  if (!contentEl) return;
  const current = getEditorVirtualScrollSpace();
  if (!current) return;
  const nativeScrollable = getEditorNativeScrollable();
  const usedVirtualSpace = Math.max(0, contentEl.scrollTop - nativeScrollable);
  const next = usedVirtualSpace <= 1 ? 0 : usedVirtualSpace;
  if (Math.abs(next - current) > 1) {
    setEditorVirtualScrollSpace(next);
  }
}

// ── 앱 모드 전환 (노트 / 스케줄) ─────────────────
function applyAppMode(mode) {
  state.appMode = mode;
  if (mode === 'schedule') state.smartPlannerCollapsed = true;
  save();

  const isSchedule = mode === 'schedule';

  // 뷰 전환
  if (notesViewEl) notesViewEl.style.display = isSchedule ? 'none' : '';
  if (scheduleViewEl) scheduleViewEl.style.display = isSchedule ? 'flex' : 'none';
  if (sectionTabsBarEl) sectionTabsBarEl.style.display = isSchedule ? 'none' : '';
  if (toolbarEl) toolbarEl.style.display = isSchedule ? 'none' : '';
  if (plannerTopbarToggleBtn) plannerTopbarToggleBtn.hidden = !isSchedule;
  if (topbarTrashBtn) {
    const trashActive = !isSchedule && state.noteListMode === 'trash';
    topbarTrashBtn.classList.toggle('active', trashActive);
    topbarTrashBtn.setAttribute('aria-pressed', String(trashActive));
  }

  // 탭 버튼 active 상태
  appModeTabs.forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.mode === mode);
  });

  rerender();
}

function setTodoPanelCollapsed(isCollapsed) {
  todoPanelEl?.classList.toggle('collapsed', isCollapsed);
  notesLayoutEl?.classList.toggle('todo-panel-collapsed', isCollapsed);
  if (toggleTodoPanelBtn) {
    toggleTodoPanelBtn.textContent = isCollapsed ? '‹' : '접기';
    toggleTodoPanelBtn.setAttribute('aria-label', isCollapsed ? '업무 목록 펼치기' : '업무 목록 접기');
    toggleTodoPanelBtn.title = isCollapsed ? '업무 목록 펼치기' : '업무 목록 접기';
    toggleTodoPanelBtn.setAttribute('aria-expanded', String(!isCollapsed));
  }
}

// 앱 모드 탭 클릭 이벤트
appModeTabs.forEach((tab) => {
  tab.addEventListener('click', () => applyAppMode(tab.dataset.mode));
});

// 스케줄 업무 추가 버튼
addScheduleTaskBtn?.addEventListener('click', async () => {
  const result = await showScheduleModal();
  if (!result) return;
  addScheduleTask(
    result.text,
    result.deadline,
    result.difficulty,
    result.projectName || '',
    result.description || '',
  );
  rerender();
});

/*
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
    const todos = await extractTodosWithAI(note.content, existingTodos, behaviorSummary, note.createdAt);
    if (!todos.length) {
      alert('AI가 추가할 일정을 찾지 못했습니다.');
      return;
    }

    let added = 0;
    todos.forEach((todoItem) => {
      const isDup = prefs.useExistingTodoTexts
        && state.todos.some((t) => t.text === todoItem.text);
      if (isDup) return;

      const todoId = addScheduleTask(
        todoItem.text,
        todoItem.deadline || null,
        todoItem.difficulty || '중',
      );
      if (todoItem.deadline) {
        assignTodoToDate(todoId, todoItem.deadline);
      }
      added += 1;
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
*/

function addTab() {
  const now = nowISO();
  const tab = {
    id: uid(),
    name: '새 섹션',
    color: getNextSectionColor(),
    createdAt: now,
    updatedAt: now,
  };

  state.tabs.push(tab);
  state.noteListMode = 'notes';
  state.selectedDeletedNoteId = null;
  state.selectedTabId = tab.id;
  state.selectedPageSectionId = null;
  state.selectedNoteId = null;
  save();
  markStateDirty(); scheduleSync();
  rerender();
}

function addPageSection() {
  if (!state.selectedTabId) {
    alert('먼저 섹션을 선택하세요.');
    return;
  }

  const now = nowISO();
  const pageSection = {
    id: uid(),
    tabId: state.selectedTabId,
    name: '새 구역',
    order: getCurrentTabPageSections().length,
    createdAt: now,
    updatedAt: now,
  };

  state.pageSections.push(pageSection);
  state.pageSectionCollapsed[pageSection.id] = false;
  state.selectedPageSectionId = pageSection.id;
  state.noteListMode = 'notes';
  state.selectedDeletedNoteId = null;

  save();
  markStateDirty();
  scheduleSync();
  rerender();
}

function addNote(pageSectionId = state.selectedPageSectionId) {
  if (!state.selectedTabId) {
    alert('먼저 섹션을 선택하세요.');
    return;
  }

  const selectedPageSection = state.pageSections.find(
    (item) => item.id === pageSectionId && item.tabId === state.selectedTabId,
  );
  const now = nowISO();
  const note = {
    id: uid(),
    tabId: state.selectedTabId,
    pageSectionId: selectedPageSection?.id || null,
    title: '',
    content: '',
    createdAt: now,
    updatedAt: now,
  };

  state.noteListMode = 'notes';
  state.selectedDeletedNoteId = null;
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
  addTodoFromNoteText(text, {
    markRange: getCurrentEditorRange(),
    sourceNoteId: state.selectedNoteId || null,
  });
}

function addTodoFromNoteText(text, options = {}) {
  const { deadline, cleanedText } = extractDeadlineFromText(text);
  const sourceNoteId = options.sourceNoteId || state.selectedNoteId || null;
  const projectName = getNoteProjectName(sourceNoteId);
  setTodoPanelCollapsed(false);
  const todoId = addTodo(cleanedText, sourceNoteId, '중', deadline, projectName);
  markSelectedTextAsTodoSource(options.markRange, todoId);
  rerender();
}

function getNoteProjectName(noteId) {
  const note = state.notes.find((item) => item.id === noteId);
  const pageSection = note?.pageSectionId
    ? state.pageSections.find((item) => item.id === note.pageSectionId)
    : null;
  if (pageSection?.name?.trim()) return pageSection.name.trim();
  return (note?.title || '').trim() || '제목 없음';
}

function getCurrentEditorRange() {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  if (range.collapsed || !isInsideEditor(range.commonAncestorContainer)) return null;
  return range.cloneRange();
}

function markSelectedTextAsTodoSource(sourceRange = null, todoId = null) {
  const note = state.notes.find((x) => x.id === state.selectedNoteId);
  if (!note) return;

  const range = sourceRange || getCurrentEditorRange();
  if (!range) return;
  if (range.collapsed || !isInsideEditor(range.commonAncestorContainer)) return;

  const marker = document.createElement('span');
  marker.className = 'todo-source-mark';
  if (todoId) marker.dataset.todoId = todoId;
  marker.appendChild(range.extractContents());
  range.insertNode(marker);
  selectNodeContents(marker);

  const now = nowISO();
  note.content = contentEl.innerHTML;
  note.updatedAt = now;

  const tab = state.tabs.find((x) => x.id === note.tabId);
  if (tab) tab.updatedAt = now;

  save();
  markDirty(note.id);
  markStateDirty();
  scheduleSync();
}

function addTodosToInbox(todoItems, sourceNoteId) {
  let addedCount = 0;
  todoItems.forEach((todoItem) => {
    const todoText = (todoItem.text || '').trim();
    const isDup = state.todos.some((t) => t.text === todoText)
      || state.todoInbox.some((t) => t.text === todoText);
    if (!todoText || isDup) return;

    const inboxItem = createInboxItem({
      text: todoText,
      sourceNoteId,
      projectName: getNoteProjectName(sourceNoteId),
      difficulty: todoItem.difficulty || '중',
      deadline: todoItem.deadline || null,
    }, { nowISO, uid });
    if (!inboxItem) return;
    state.todoInbox.push(inboxItem);
    addedCount += 1;
  });

  if (addedCount > 0) {
    save();
    markStateDirty();
    scheduleSync();
    renderSmartPlanner();
  }

  return addedCount;
}

function extractLocalTodosFromNote(noteHtml) {
  return extractTodoCandidatesFromHtml(noteHtml)
    .map((line) => {
      const { deadline, cleanedText } = extractDeadlineFromText(line);
      return {
        text: cleanedText,
        difficulty: '중',
        deadline,
      };
    })
    .filter((item) => item.text);
}

async function addTodosFromCurrentNote() {
  const note = state.notes.find((x) => x.id === state.selectedNoteId);
  if (!note) {
    alert('먼저 페이지를 선택하세요.');
    return;
  }

  if (!note.content?.trim()) {
    alert('할 일로 만들 노트 내용이 없습니다.');
    return;
  }

  const apiKey = getApiKey();
  const previousLabel = extractTodoBtn.textContent;
  extractTodoBtn.disabled = true;
  extractTodoBtn.textContent = apiKey ? 'AI 분석 중...' : '로컬 추출 중...';

  try {
    let todos = [];
    let sourceLabel = '로컬';

    if (apiKey) {
      const prefs = getScheduleAIPreferences();
      const existingTodos = prefs.useDeadlineDistribution || prefs.useExistingTodoTexts ? state.todos : [];
      const behaviorSummary = prefs.useBehaviorSummary ? buildBehaviorSummary() : '';
      todos = await extractTodosWithAI(note.content, existingTodos, behaviorSummary, note.createdAt);
      sourceLabel = 'AI';
    } else {
      todos = extractLocalTodosFromNote(note.content);
    }

    if (!todos.length) {
      alert('노트에서 추가할 할 일을 찾지 못했습니다.');
      return;
    }

    const addedCount = addTodosToInbox(todos, note.id);
    if (addedCount === 0) {
      alert('새로 추가할 후보가 없습니다. 이미 업무 목록이나 인박스에 있는 항목은 제외했습니다.');
      return;
    }

    alert(`${sourceLabel}로 할 일 후보 ${addedCount}개를 추가했습니다. 업무 제안에서 적용할 수 있습니다.`);
    rerender();
  } catch (err) {
    if (err.message === 'API_KEY_INVALID') {
      openSettingsDrawer();
      alert('API 키가 유효하지 않습니다. 설정에서 확인해주세요.');
      return;
    }

    const fallbackTodos = extractLocalTodosFromNote(note.content);
    const addedCount = addTodosToInbox(fallbackTodos, note.id);
    if (addedCount > 0) {
      alert(`AI 추출에 실패해서 로컬 기준으로 ${addedCount}개를 추가했습니다.`);
      rerender();
    } else {
      alert(`할 일 추출 실패: ${err.message}`);
    }
  } finally {
    extractTodoBtn.disabled = false;
    extractTodoBtn.textContent = previousLabel;
  }
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
    const todos = await extractTodosWithAI(note.content, state.todos, behaviorSummary, note.createdAt);

    if (!todos.length) {
      alert('노트에서 추출할 할 일이 없습니다.');
      return;
    }

    const addedCount = addTodosToInbox(todos, note.id);

    if (addedCount === 0) {
      alert('추출할 새로운 후보가 없습니다. (이미 업무 목록 또는 인박스에 있음)');
    } else {
      alert(`할 일 제안에 후보 ${addedCount}개를 추가했습니다. 스케줄 탭에서 적용해주세요.`);
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

async function suggestPlannerWork() {
  if (!plannerExtractBtn) return;

  const note = state.notes.find((x) => x.id === state.selectedNoteId);
  const localSuggestions = buildPlannerLocalSuggestions();
  const apiKey = getApiKey();
  const prevLabel = plannerExtractBtn.textContent;

  plannerExtractBtn.disabled = true;
  plannerExtractBtn.textContent = apiKey ? 'AI 제안 중...' : '제안 계산 중...';
  setPlannerStatus(apiKey
    ? 'AI가 현재 노트와 업무 과중도를 보고 있습니다...'
    : '로컬 기준으로 업무 과중도를 계산하고 있습니다...');

  try {
    if (!apiKey) {
      setPlannerSuggestions(
        localSuggestions,
        localSuggestions.length
          ? `로컬 제안 ${localSuggestions.length}개를 찾았습니다.`
          : '로컬 기준으로는 옮길 업무가 없습니다.',
      );
      return;
    }

    const aiSuggestions = (await getPlannerSuggestionsWithAI(
      getPlannerSnapshot(state),
      localSuggestions,
      {
        noteHtml: note?.content || '',
        noteCreatedAt: note?.createdAt || '',
      },
    )).map((item) => (item.type === 'task'
      ? { ...item, sourceNoteId: note?.id || null }
      : item));
    const suggestions = mergePlannerSuggestions(localSuggestions, aiSuggestions);
    setPlannerSuggestions(
      suggestions,
      suggestions.length
        ? `로컬 기준과 AI 제안 ${suggestions.length}개를 찾았습니다.`
        : 'AI와 로컬 기준 모두 새 제안을 찾지 못했습니다.',
    );
  } catch (err) {
    if (err.message === 'API_KEY_MISSING' || err.message === 'API_KEY_INVALID') {
      openSettingsDrawer();
    }
    setPlannerSuggestions(
      localSuggestions,
      localSuggestions.length
        ? `AI 제안 실패: ${err.message}. 로컬 제안만 표시합니다.`
        : `AI 제안 실패: ${err.message}`,
    );
  } finally {
    plannerExtractBtn.disabled = false;
    plannerExtractBtn.textContent = prevLabel;
  }
}

function mergePlannerSuggestions(localSuggestions, aiSuggestions) {
  const merged = [];
  const seen = new Map();

  [...(localSuggestions || []), ...(aiSuggestions || [])].forEach((item) => {
    const key = `${item.type}-${item.todoId || item.text}-${item.date || item.deadline || ''}`;
    const existingIndex = seen.get(key);
    if (existingIndex === undefined) {
      seen.set(key, merged.length);
      merged.push(item);
      return;
    }

    const existing = merged[existingIndex];
    merged[existingIndex] = {
      ...existing,
      ...item,
      action: item.action || existing.action,
      entryId: item.entryId || existing.entryId || null,
      source: existing.source === item.source ? existing.source : 'local+ai',
      reason: item.reason || existing.reason,
    };
  });

  return merged;
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
function persistCurrentNoteImmediately() {
  const note = state.notes.find((x) => x.id === state.selectedNoteId);
  if (!note) return false;

  if (state.saveTimer) clearTimeout(state.saveTimer);

  const now = nowISO();
  note.title = titleEl.value;
  note.content = contentEl.innerHTML;
  note.updatedAt = now;

  const tab = state.tabs.find((x) => x.id === note.tabId);
  if (tab) tab.updatedAt = now;

  save();
  markDirty(note.id);
  markStateDirty();
  scheduleSync();
  renderNotes(rerender);
  renderTabs(rerender);
  saveStatusEl.textContent = '저장됨';
  return true;
}

function appendHtmlToEditor(html) {
  if (!contentEl || contentEl.getAttribute('contenteditable') === 'false') return false;
  contentEl.insertAdjacentHTML('beforeend', html);
  persistCurrentNoteImmediately();
  contentEl.focus();
  return true;
}

function appendHtmlToNote(note, html) {
  if (!note) return false;
  if (state.selectedNoteId === note.id) return appendHtmlToEditor(html);

  if (state.saveTimer) clearTimeout(state.saveTimer);

  const now = nowISO();
  note.content = `${note.content || ''}${html}`;
  note.updatedAt = now;

  const tab = state.tabs.find((x) => x.id === note.tabId);
  if (tab) tab.updatedAt = now;

  save();
  markDirty(note.id);
  markStateDirty();
  scheduleSync();
  renderNotes(rerender);
  renderTabs(rerender);
  saveStatusEl.textContent = '녹음 추가됨';
  return true;
}

function getRecordingDraft(noteId) {
  return (state.recordingDrafts?.[noteId] || '').trim();
}

function setRecordingDraft(noteId, text) {
  if (!state.recordingDrafts) state.recordingDrafts = {};
  state.recordingDrafts[noteId] = text.trim();
  save();
  markStateDirty();
  scheduleSync();
}

let activeRecordingNoteId = null;

function escapeText(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

function formatSummaryHtml(summary) {
  const lines = summary
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const items = lines.length
    ? lines.map((line) => `<li>${escapeText(line.replace(/^[-*]\s*/, ''))}</li>`).join('')
    : `<li>${escapeText(summary)}</li>`;

  return `
    <hr>
    <h2>AI 요약</h2>
    <ul>${items}</ul>
  `;
}

function formatRecordingHtml(recordingText) {
  const speakers = ['A', 'B', 'C'];
  const lines = recordingText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines
    .map((line, index) => `<p><strong>발화자 ${speakers[index % speakers.length]}:</strong> ${escapeText(line)}</p>`)
    .join('');
}

function appendTranscript(transcript, { replace = false } = {}) {
  if (!activeRecordingNoteId) {
    alert('먼저 페이지를 선택하세요.');
    return;
  }
  const previous = replace ? '' : getRecordingDraft(activeRecordingNoteId);
  setRecordingDraft(
    activeRecordingNoteId,
    [previous, transcript.trim()].filter(Boolean).join('\n'),
  );
  saveStatusEl.textContent = '녹음 저장됨';
}

const recordingPanel = createRecordingPanel({
  panelEl: recordingPanelEl,
  statusEl: recordingStatusEl,
  waveformEl: recordingWaveformEl,
  timerEl: recordingTimerEl,
  stopBtn: recordingStopBtn,
});

async function addRecordingToNote(noteId, { summarize }) {
  const note = state.notes.find((x) => x.id === noteId);
  if (!note) {
    alert('먼저 페이지를 선택하세요.');
    return;
  }

  const recordingText = getRecordingDraft(note.id);
  if (!recordingText) {
    alert('요약할 녹음 내용이 없습니다. 먼저 녹음 버튼으로 음성을 텍스트로 저장해주세요.');
    return;
  }

  noteRecordBtn.disabled = true;
  noteRecordBtn.textContent = summarize ? '요약 중...' : '추가 중...';

  try {
    if (summarize) {
      const summary = await summarizeRecordingWithAI(recordingText);
      appendHtmlToNote(note, formatSummaryHtml(summary));
    } else {
      appendHtmlToNote(note, formatRecordingHtml(recordingText));
    }
    setRecordingDraft(note.id, '');
    if (state.selectedNoteId === note.id) renderEditor(rerender);
  } catch (err) {
    if (err.message === 'API_KEY_MISSING') {
      openSettingsDrawer();
      alert('Gemini API 키를 먼저 설정해주세요. (설정 > AI 설정)');
      return;
    }
    if (err.message === 'API_KEY_INVALID') {
      openSettingsDrawer();
      alert('API 키가 유효하지 않습니다. 설정에서 확인해주세요.');
      return;
    }
    if (err.message === 'API_OVERLOADED') {
      alert('Gemini 서버가 현재 혼잡합니다. 잠시 후 다시 AI 요약을 눌러주세요.');
      return;
    }
    alert(`AI 요약 실패: ${err.message}`);
  } finally {
    noteRecordBtn.disabled = false;
    noteRecordBtn.textContent = '녹음';
    activeRecordingNoteId = null;
    recordingPanel.reset();
  }
}

const FONT_SIZE_STEPS = [12, 14, 15, 16, 18, 20, 24, 28, 34];
const DEFAULT_FONT_SIZE = 15;
const fontSizeLabel = document.getElementById('font-size-label');
let lastEditorRange = null;
const NOTE_SELECTION_TODO_DRAG_TYPE = 'application/x-onenote-todo-selection';
let draggedTodoSelection = null;

function isInsideEditor(node) {
  return node && (node === contentEl || contentEl.contains(node));
}

function saveEditorSelection() {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;

  const range = sel.getRangeAt(0);
  if (!isInsideEditor(range.commonAncestorContainer)) return;
  lastEditorRange = range.cloneRange();
}

function restoreEditorSelection() {
  if (!lastEditorRange) return false;

  const sel = window.getSelection();
  if (!sel) return false;
  sel.removeAllRanges();
  sel.addRange(lastEditorRange.cloneRange());
  return true;
}

toolbarEl.addEventListener('mousedown', (e) => {
  const btn = e.target.closest('.tbtn');
  if (!btn) return;

  // Ignore color-btn — handled separately
  if (btn.id === 'color-btn') return;

  e.preventDefault(); // keep focus in editor
  restoreEditorSelection();

  // 할 일 추가 버튼
  if (btn.dataset.action === 'add-todo') {
    addTodoFromSelection();
    return;
  }

  if (btn.dataset.action === 'font-size-down' || btn.dataset.action === 'font-size-up') {
    applyFontSize(btn.dataset.action === 'font-size-up' ? 1 : -1);
    return;
  }

  if (btn.dataset.action === 'toggle-ruled') {
    state.notePaperMode = state.notePaperMode === 'plain' ? 'ruled' : 'plain';
    save();
    markStateDirty();
    scheduleSync();
    syncEditorChrome();
    contentEl.focus();
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
  updateFontSizeLabel();
  syncEditorChrome();
}

function getSelectionElement() {
  const sel = window.getSelection();
  if (!sel || !sel.anchorNode || !contentEl.contains(sel.anchorNode)) return null;
  return sel.anchorNode.nodeType === Node.ELEMENT_NODE
    ? sel.anchorNode
    : sel.anchorNode.parentElement;
}

function getSelectionFontSize() {
  const el = getSelectionElement();
  if (!el) return DEFAULT_FONT_SIZE;
  return parseFloat(window.getComputedStyle(el).fontSize) || DEFAULT_FONT_SIZE;
}

function nearestFontSizeIndex(size) {
  return FONT_SIZE_STEPS.reduce((bestIndex, step, index) => (
    Math.abs(step - size) < Math.abs(FONT_SIZE_STEPS[bestIndex] - size) ? index : bestIndex
  ), 0);
}

function updateFontSizeLabel(size = getSelectionFontSize()) {
  if (!fontSizeLabel) return;
  fontSizeLabel.textContent = String(Math.round(size));
}

function replaceFontSizeTags(size) {
  contentEl.querySelectorAll('font[size="7"]').forEach((fontEl) => {
    const span = document.createElement('span');
    span.style.fontSize = `${size}px`;
    while (fontEl.firstChild) span.appendChild(fontEl.firstChild);
    fontEl.replaceWith(span);
  });
}

function selectNodeContents(node) {
  const range = document.createRange();
  range.selectNodeContents(node);
  const sel = window.getSelection();
  if (!sel) return;
  sel.removeAllRanges();
  sel.addRange(range);
  saveEditorSelection();
}

function applyFontSize(direction) {
  restoreEditorSelection();
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount || !contentEl.contains(sel.anchorNode)) {
    contentEl.focus();
    return;
  }

  const currentSize = getSelectionFontSize();
  const currentIndex = nearestFontSizeIndex(currentSize);
  const nextIndex = Math.max(0, Math.min(FONT_SIZE_STEPS.length - 1, currentIndex + direction));
  const nextSize = FONT_SIZE_STEPS[nextIndex];

  contentEl.focus();

  if (sel.isCollapsed) {
    const target = getSelectionElement();
    const block = target?.closest('p, div, li, h1, h2, span');
    if (block && block !== contentEl) {
      block.style.fontSize = `${nextSize}px`;
    } else {
      document.execCommand('fontSize', false, '7');
      replaceFontSizeTags(nextSize);
      saveEditorSelection();
    }
  } else {
    const range = sel.getRangeAt(0);
    const span = document.createElement('span');
    span.style.fontSize = `${nextSize}px`;
    span.appendChild(range.extractContents());
    range.insertNode(span);
    selectNodeContents(span);
  }

  saveEditorSelection();
  updateFontSizeLabel(nextSize);
  scheduleAutoSave();
  updateToolbarState();
}

contentEl.addEventListener('keyup', () => {
  saveEditorSelection();
  updateToolbarState();
});
contentEl.addEventListener('mouseup', () => {
  saveEditorSelection();
  updateToolbarState();
});
contentEl.addEventListener('selectionchange', updateToolbarState);
document.addEventListener('selectionchange', () => {
  const el = getSelectionElement();
  if (el) {
    saveEditorSelection();
    updateToolbarState();
  }
});

// ── Text Color Picker ────────────────────────────────
const colorBtn = document.getElementById('color-btn');
const colorPalette = document.getElementById('color-palette');
const colorBtnBar = document.getElementById('color-btn-bar');

colorBtn.addEventListener('mousedown', (e) => {
  e.preventDefault(); // keep focus in editor
  restoreEditorSelection();
  colorPalette.classList.toggle('open');
});

// ── Tab Color Popup (body-level) ─────────────────────
const tabColorPopup = document.getElementById('tab-color-popup');
const TAB_COLORS = [
  '#5B8DEF', '#6E9AF7', '#8A7CF6', '#A77CF0',
  '#37A987', '#4FA3B8', '#73B6E6', '#9CCF6A',
  '#F29F67', '#F3B562', '#E87EA1', '#F08DA8',
  '#D97A63', '#C98BD9', '#7BC8B1', '#F0A7C2',
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
  restoreEditorSelection();
  const swatch = e.target.closest('.color-swatch');
  if (!swatch) return;

  const color = swatch.dataset.color;
  document.execCommand('foreColor', false, color);
  saveEditorSelection();
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

contentEl.addEventListener('wheel', (e) => {
  expandEditorVirtualScroll(e.deltaY);
}, { passive: true });
contentEl.addEventListener('scroll', () => {
  syncEditorVirtualScrollSpace();
  if (selectedImg) updateImgOverlay();
});
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

const recordingModal = document.getElementById('recording-modal');
const recordingModalOverlay = document.getElementById('recording-modal-overlay');
const recordingModalSummary = document.getElementById('recording-modal-summary');
const recordingModalSubmit = document.getElementById('recording-modal-submit');
const recordingModalCancel = document.getElementById('recording-modal-cancel');
const recordingModalDecline = document.getElementById('recording-modal-decline');

function showRecordingAddModal() {
  return new Promise((resolve) => {
    recordingModalSummary.checked = false;
    recordingModal.classList.add('open');
    recordingModalOverlay.classList.add('open');

    const close = (result) => {
      recordingModal.classList.remove('open');
      recordingModalOverlay.classList.remove('open');
      recordingModalSubmit.removeEventListener('click', onSubmit);
      recordingModalCancel.removeEventListener('click', onCancel);
      recordingModalDecline.removeEventListener('click', onCancel);
      recordingModalOverlay.removeEventListener('click', onCancel);
      resolve(result);
    };
    const onSubmit = () => close({ summarize: recordingModalSummary.checked });
    const onCancel = () => close(null);

    recordingModalSubmit.addEventListener('click', onSubmit);
    recordingModalCancel.addEventListener('click', onCancel);
    recordingModalDecline.addEventListener('click', onCancel);
    recordingModalOverlay.addEventListener('click', onCancel);
  });
}

async function confirmStoppedRecording() {
  const note = state.notes.find((x) => x.id === activeRecordingNoteId);
  const recordingText = note ? getRecordingDraft(note.id) : '';
  if (!recordingText) {
    alert('녹음된 내용이 없습니다.');
    activeRecordingNoteId = null;
    return;
  }

  const result = await showRecordingAddModal();
  if (!result) {
    activeRecordingNoteId = null;
    return;
  }
  await addRecordingToNote(note.id, result);
}

// ── Event listeners ──────────────────────────────────
const speechRecorder = createSpeechRecorder({
  onTranscript: appendTranscript,
  onStopComplete: confirmStoppedRecording,
  onMeter: (meter) => recordingPanel.updateMeter(meter),
  onStateChange: (isRecording) => {
    if (!noteRecordBtn) return;
    noteRecordBtn.textContent = isRecording ? '정지' : '녹음';
    noteRecordBtn.classList.toggle('recording', isRecording);
    noteRecordBtn.setAttribute('aria-pressed', String(isRecording));
    recordingPanel.setRecording(isRecording);
  },
  onProcessingChange: (isProcessing) => {
    if (!noteRecordBtn) return;
    noteRecordBtn.disabled = isProcessing;
    if (isProcessing) {
      noteRecordBtn.textContent = '정리 중...';
      recordingPanel.setBusy('녹음 텍스트 변환 중');
    } else if (!speechRecorder.isRecording()) {
      noteRecordBtn.textContent = '녹음';
    }
  },
  onError: (err) => {
    if (err.message === 'AUDIO_RECORDING_UNSUPPORTED') {
      alert('이 브라우저는 마이크 녹음을 지원하지 않습니다. Chrome 또는 Edge에서 사용해주세요.');
      return;
    }
    if (err.message === 'SPEECH_RECOGNITION_UNSUPPORTED') {
      alert('이 브라우저는 실시간 음성 인식을 지원하지 않습니다. Chrome 또는 Edge에서 사용해주세요.');
      return;
    }
    if (err.message === 'no-speech') {
      saveStatusEl.textContent = '말소리가 감지되지 않았습니다';
      return;
    }
    if (err.message === 'aborted') {
      saveStatusEl.textContent = '녹음이 취소되었습니다';
      return;
    }
    if (err.message === 'API_KEY_MISSING') {
      saveStatusEl.textContent = '실시간 텍스트만 저장되었습니다';
      return;
    }
    if (err.message === 'API_KEY_INVALID') {
      openSettingsDrawer();
      alert('Gemini API 키가 유효하지 않아 전체 녹음을 텍스트로 변환하지 못했습니다.');
      return;
    }
    if (err.message === 'API_OVERLOADED') {
      saveStatusEl.textContent = '음성 변환이 지연되었습니다. 잠시 후 다시 시도해주세요';
      return;
    }
    if (err.message === 'TRANSCRIPT_EMPTY') {
      saveStatusEl.textContent = '음성 변환 결과가 비어 있습니다';
      return;
    }
    alert(`녹음 오류: ${err.message}`);
  },
});

addTabBtn.addEventListener('click', addTab);
addPageSectionBtn?.addEventListener('click', addPageSection);
addNoteBtn.addEventListener('click', () => addNote());
document.addEventListener('add-note-to-page-section', (event) => addNote(event.detail?.pageSectionId));
toggleTodoPanelBtn?.addEventListener('click', () => {
  const isCollapsed = todoPanelEl?.classList.contains('collapsed') || false;
  setTodoPanelCollapsed(!isCollapsed);
});
addTodoBtn.addEventListener('click', async () => {
  const result = await showAddTodoModal({
    projectName: getNoteProjectName(state.selectedNoteId),
  });
  if (!result) return;
  setTodoPanelCollapsed(false);
  addTodo(
    result.text,
    state.selectedNoteId || null,
    result.difficulty,
    result.deadline,
    result.projectName || getNoteProjectName(state.selectedNoteId),
    result.description || '',
  );
  rerender();
});
extractTodoBtn.addEventListener('click', addTodosFromCurrentNote);
noteRecordBtn?.addEventListener('click', () => {
  if (speechRecorder.isBusy()) return;
  if (!speechRecorder.isSupported) {
    alert('이 브라우저는 마이크 녹음을 지원하지 않습니다. Chrome 또는 Edge에서 사용해주세요.');
    return;
  }
  if (speechRecorder.isRecording()) {
    speechRecorder.stop();
  } else {
    if (!state.selectedNoteId) {
      alert('먼저 페이지를 선택하세요.');
      return;
    }
    activeRecordingNoteId = state.selectedNoteId;
    setRecordingDraft(activeRecordingNoteId, '');
    recordingPanel.setBusy('마이크 준비 중');
    speechRecorder.start();
  }
});
recordingPanel.onStop(() => speechRecorder.stop());
plannerExtractBtn?.addEventListener('click', suggestPlannerWork);
topbarTrashBtn?.addEventListener('click', () => {
  if (state.appMode !== 'notes') {
    applyAppMode('notes');
  }
  setNoteListMode(state.noteListMode === 'trash' ? 'notes' : 'trash');
});
plannerTopbarToggleBtn?.addEventListener('click', () => {
  state.smartPlannerCollapsed = !state.smartPlannerCollapsed;
  save();
  markStateDirty();
  scheduleSync();
  rerender();
});

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
const summaryPromptInput = document.getElementById('summary-prompt-input');
const summaryPromptSave = document.getElementById('summary-prompt-save');
const summaryPromptReset = document.getElementById('summary-prompt-reset');
const summaryPromptStatus = document.getElementById('summary-prompt-status');

function openSettingsDrawer() {
  geminiKeyInput.value = getApiKey();
  const prefs = getScheduleAIPreferences();
  scheduleAIPrefBehavior.checked = !!prefs.useBehaviorSummary;
  scheduleAIPrefDeadline.checked = !!prefs.useDeadlineDistribution;
  scheduleAIPrefExisting.checked = !!prefs.useExistingTodoTexts;
  scheduleAIPrefStatus.textContent = '';
  summaryPromptInput.value = getSummaryPrompt();
  summaryPromptStatus.textContent = '';
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

summaryPromptSave.addEventListener('click', () => {
  summaryPromptInput.value = saveSummaryPrompt(summaryPromptInput.value);
  summaryPromptStatus.textContent = '저장됨';
  summaryPromptStatus.dataset.state = 'saved';
});

summaryPromptReset.addEventListener('click', () => {
  summaryPromptInput.value = resetSummaryPrompt();
  summaryPromptStatus.textContent = '기본값 적용됨';
  summaryPromptStatus.dataset.state = 'saved';
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

contentEl.addEventListener('dragstart', (e) => {
  const text = getSelectedEditorText(contentEl);
  const range = getCurrentEditorRange();
  if (!text || !range || !e.dataTransfer) return;

  draggedTodoSelection = {
    text,
    range,
    sourceNoteId: state.selectedNoteId || null,
  };
  e.dataTransfer.setData(NOTE_SELECTION_TODO_DRAG_TYPE, text);
  e.dataTransfer.setData('text/plain', text);
  e.dataTransfer.effectAllowed = 'copy';
});

contentEl.addEventListener('dragend', () => {
  todoPanelEl?.classList.remove('todo-drop-target');
  draggedTodoSelection = null;
});

function hasNoteTodoDrag(dataTransfer) {
  return [...(dataTransfer?.types || [])].includes(NOTE_SELECTION_TODO_DRAG_TYPE);
}

function clearTodoDropTarget() {
  todoPanelEl?.classList.remove('todo-drop-target');
}

todoPanelEl?.addEventListener('dragover', (e) => {
  if (!hasNoteTodoDrag(e.dataTransfer)) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
  setTodoPanelCollapsed(false);
  todoPanelEl.classList.add('todo-drop-target');
});

todoPanelEl?.addEventListener('dragleave', (e) => {
  if (!todoPanelEl.contains(e.relatedTarget)) clearTodoDropTarget();
});

todoPanelEl?.addEventListener('drop', (e) => {
  if (!hasNoteTodoDrag(e.dataTransfer)) return;
  e.preventDefault();
  clearTodoDropTarget();

  const text = e.dataTransfer.getData(NOTE_SELECTION_TODO_DRAG_TYPE)
    || draggedTodoSelection?.text
    || '';
  if (!text.trim()) return;

  addTodoFromNoteText(text, {
    markRange: draggedTodoSelection?.range || null,
    sourceNoteId: draggedTodoSelection?.sourceNoteId || state.selectedNoteId || null,
  });
  draggedTodoSelection = null;
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

function buildSyncErrorMessage(error) {
  if (!error) return '';
  const lines = [error.summary];
  if (error.code) lines.push(`코드: ${error.code}`);
  if (error.rawMessage) lines.push(`원본: ${error.rawMessage}`);
  return lines.join('\n');
}

function clearSyncStatusDisplay() {
  syncStatusEl.textContent = '';
  syncStatusEl.title = '';
  syncStatusEl.dataset.status = '';
  syncStatusEl.dataset.errorMessage = '';
  syncStatusEl.setAttribute('aria-label', '');
  syncStatusEl.style.cursor = '';
}

setSyncStatusCallback(({ status, error }) => {
  syncStatusEl.textContent = SYNC_LABELS[status] || '';
  syncStatusEl.dataset.status = status;
  if (status === 'error' && error) {
    const message = buildSyncErrorMessage(error);
    syncStatusEl.title = message;
    syncStatusEl.dataset.errorMessage = message;
    syncStatusEl.setAttribute('aria-label', message);
    syncStatusEl.style.cursor = 'help';
    return;
  }

  syncStatusEl.title = '';
  syncStatusEl.dataset.errorMessage = '';
  syncStatusEl.setAttribute('aria-label', syncStatusEl.textContent);
  syncStatusEl.style.cursor = '';
});

syncStatusEl.addEventListener('click', () => {
  const message = syncStatusEl.dataset.errorMessage || '';
  if (!message) return;
  alert(message);
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
    document.getElementById('login-btn').addEventListener('click', async () => {
      if (hasPotentialLocalDraft()) {
        const ok = window.confirm(
          '로그인 시 클라우드 데이터가 로컬 데이터를 덮어쓸 수 있어요.\n'
          + '현재 이 브라우저에서 작성한 내용이 사라질 수 있습니다.\n'
          + '계속 로그인할까요?',
        );
        if (!ok) return;
      }
      try {
        await signIn();
      } catch (err) {
        const code = err?.code || '';

        if (code === 'auth/popup-blocked' || code === 'auth/cancelled-popup-request') {
          await signInRedirect();
          return;
        }

        if (code === 'auth/unauthorized-domain') {
          alert(
            'Firebase 인증 도메인 설정이 필요합니다.\n'
            + 'Firebase Console > Authentication > Settings > Authorized domains에\n'
            + 'sangkyoung92-cmyk.github.io 를 추가해주세요.',
          );
          return;
        }

        if (code !== 'auth/popup-closed-by-user') {
          alert(`로그인 실패: ${err.message || code || '알 수 없는 오류'}`);
        }
      }
    });
    clearSyncStatusDisplay();
  }
}

function hasPotentialLocalDraft() {
  if (state.tabs.length > 0) return true;
  if (state.todoInbox.length > 0) return true;
  return state.notes.some((note) => (note.title || '').trim() || (note.content || '').trim());
}

onAuthChange((user) => {
  renderAuthArea(user);
  if (user) {
    setCurrentUser(user.uid);
    loadFromCloud(rerender);
  } else {
    setCurrentUser(null);
    clearSyncStatusDisplay();
  }
});

load();
pruneExpiredTrash();
initNotesPanelResize(notesLayoutEl);
initSchedulePanelResize(scheduleWorkspaceEl);
initScheduleNav(rerender);
// 저장된 모드로 초기 UI 적용
applyAppMode(state.appMode || 'notes');
window.setInterval(() => {
  if (pruneExpiredTrash()) rerender();
}, 60 * 60 * 1000);
