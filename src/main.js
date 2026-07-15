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
  addNoteBtn, addPageSectionBtn, addTabBtn, contentEl, titleEl,
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
  topbarTrashBtn,
} from './ui/dom.js';
import { renderAll, renderNotes, renderTabs, renderEditor } from './ui/render.js?v=20260604-section-reorder';
import { signIn, signInRedirect, signOutUser, onAuthChange, signUpWithEmail, signInWithEmail, sendPasswordReset } from './auth.js';
import {
  setCurrentUser, markDirty, markStateDirty, scheduleSync,
  loadFromCloud, setSyncStatusCallback,
} from './sync/cloud.js';
import { addTodo } from './ui/todo.js';
import { extractTodoCandidatesFromHtml, getSelectedEditorText } from './todo/extract.js';
import { extractTodosWithAI, getApiKey, saveApiKey } from './ai/extract.js';
import { getScheduleAIPreferences, saveScheduleAIPreferences } from './ai/schedule-preferences.js';
import { summarizeRecordingWithAI } from './ai/summary.js';
import { getSummaryPrompt, resetSummaryPrompt, saveSummaryPrompt } from './ai/summary-settings.js';
import { createSpeechRecorder } from './audio/speech-recorder.js';
import { buildBehaviorSummary } from './tracking/behavior.js';
import { extractDeadlineFromText } from './utils/parse-date-kr.js';
import { showAddTodoModal } from './ui/todo-modal.js?v=20260527-page-sections';
import { createRecordingPanel } from './ui/recording-panel.js';
import { initNotesPanelResize, initSchedulePanelResize } from './ui/panel-resize.js';
import { initAuthLanding } from './ui/auth-landing.js';
import { migrateLocalData } from './sync/migration.js';
import {
  renderSchedule,
  initScheduleNav,
  addScheduleTask,
} from './ui/schedule.js?v=20260527-page-sections';
import { showScheduleModal } from './ui/schedule-modal.js';

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

// ?? ??紐⑤뱶 ?꾪솚 (?명듃 / ?ㅼ?以? ?????????????????
function applyAppMode(mode) {
  state.appMode = mode;
  save();

  const isSchedule = mode === 'schedule';

  // 酉??꾪솚
  if (notesViewEl) notesViewEl.style.display = isSchedule ? 'none' : '';
  if (scheduleViewEl) scheduleViewEl.style.display = isSchedule ? 'flex' : 'none';
  if (sectionTabsBarEl) sectionTabsBarEl.style.display = isSchedule ? 'none' : '';
  if (toolbarEl) toolbarEl.style.display = isSchedule ? 'none' : '';
  if (topbarTrashBtn) {
    const trashActive = !isSchedule && state.noteListMode === 'trash';
    topbarTrashBtn.classList.toggle('active', trashActive);
    topbarTrashBtn.setAttribute('aria-pressed', String(trashActive));
  }

  // ??踰꾪듉 active ?곹깭
  appModeTabs.forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.mode === mode);
  });

  rerender();
}

function setTodoPanelCollapsed(isCollapsed) {
  todoPanelEl?.classList.toggle('collapsed', isCollapsed);
  notesLayoutEl?.classList.toggle('todo-panel-collapsed', isCollapsed);
  if (toggleTodoPanelBtn) {
    toggleTodoPanelBtn.textContent = isCollapsed ? '?? : '?묎린';
    toggleTodoPanelBtn.setAttribute('aria-label', isCollapsed ? '?낅Т 紐⑸줉 ?쇱튂湲? : '?낅Т 紐⑸줉 ?묎린');
    toggleTodoPanelBtn.title = isCollapsed ? '?낅Т 紐⑸줉 ?쇱튂湲? : '?낅Т 紐⑸줉 ?묎린';
    toggleTodoPanelBtn.setAttribute('aria-expanded', String(!isCollapsed));
  }
}

// ??紐⑤뱶 ???대┃ ?대깽??
appModeTabs.forEach((tab) => {
  tab.addEventListener('click', () => applyAppMode(tab.dataset.mode));
});

// ?ㅼ?以??낅Т 異붽? 踰꾪듉
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
    alert('AI ?쇱젙 異붽?瑜??꾪빐 ?댁슜???덈뒗 ?섏씠吏瑜?癒쇱? ?좏깮?섏꽭??');
    return;
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    openSettingsDrawer();
    alert('Gemini API ?ㅻ? 癒쇱? ?ㅼ젙?댁＜?몄슂. (?ㅼ젙 > AI ?ㅼ젙)');
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
  addAiScheduleTaskBtn.textContent = 'AI 異붽? 以?..';

  try {
    const todos = await extractTodosWithAI(note.content, existingTodos, behaviorSummary, note.createdAt);
    if (!todos.length) {
      alert('AI媛 異붽????쇱젙??李얠? 紐삵뻽?듬땲??');
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
        todoItem.difficulty || '以?,
      );
      if (todoItem.deadline) {
        assignTodoToDate(todoId, todoItem.deadline);
      }
      added += 1;
    });

    if (added === 0) {
      alert('?덈줈 異붽????쇱젙???놁뒿?덈떎. (以묐났 ?쒖쇅)');
      return;
    }
    rerender();
    alert(`AI ?쇱젙 ${added}媛쒕? 異붽??덉뒿?덈떎.`);
  } catch (err) {
    if (err.message === 'API_KEY_MISSING' || err.message === 'API_KEY_INVALID') {
      openSettingsDrawer();
    }
    alert(`AI ?쇱젙 異붽? ?ㅽ뙣: ${err.message}`);
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
    name: '???뱀뀡',
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
    alert('癒쇱? ?뱀뀡???좏깮?섏꽭??');
    return;
  }

  const now = nowISO();
  const pageSection = {
    id: uid(),
    tabId: state.selectedTabId,
    name: '??援ъ뿭',
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
    alert('癒쇱? ?뱀뀡???좏깮?섏꽭??');
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
    alert('?먮뵒?곗뿉?????쇰줈 留뚮뱾 ?띿뒪?몃? 癒쇱? ?좏깮?섏꽭??');
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
  const todoId = addTodo(cleanedText, sourceNoteId, '以?, deadline, projectName);
  markSelectedTextAsTodoSource(options.markRange, todoId);
  rerender();
}

function getNoteProjectName(noteId) {
  const note = state.notes.find((item) => item.id === noteId);
  const pageSection = note?.pageSectionId
    ? state.pageSections.find((item) => item.id === note.pageSectionId)
    : null;
  if (pageSection?.name?.trim()) return pageSection.name.trim();
  return (note?.title || '').trim() || '?쒕ぉ ?놁쓬';
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

function addExtractedTodos(todoItems, sourceNoteId) {
  let addedCount = 0;
  todoItems.forEach((todoItem) => {
    const todoText = (todoItem.text || '').trim();
    const isDup = state.todos.some((t) => t.text === todoText);
    if (!todoText || isDup) return;

    addTodo(
      todoText,
      sourceNoteId,
      todoItem.difficulty || '以?,
      todoItem.deadline || null,
      getNoteProjectName(sourceNoteId),
    );
    addedCount += 1;
  });

  if (addedCount > 0) {
    setTodoPanelCollapsed(false);
  }

  return addedCount;
}

function extractLocalTodosFromNote(noteHtml) {
  return extractTodoCandidatesFromHtml(noteHtml)
    .map((line) => {
      const { deadline, cleanedText } = extractDeadlineFromText(line);
      return {
        text: cleanedText,
        difficulty: '以?,
        deadline,
      };
    })
    .filter((item) => item.text);
}

async function addTodosFromCurrentNote() {
  const note = state.notes.find((x) => x.id === state.selectedNoteId);
  if (!note) {
    alert('癒쇱? ?섏씠吏瑜??좏깮?섏꽭??');
    return;
  }

  if (!note.content?.trim()) {
    alert('???쇰줈 留뚮뱾 ?명듃 ?댁슜???놁뒿?덈떎.');
    return;
  }

  const apiKey = getApiKey();
  const previousLabel = extractTodoBtn.textContent;
  extractTodoBtn.disabled = true;
  extractTodoBtn.textContent = apiKey ? 'AI 遺꾩꽍 以?..' : '濡쒖뺄 異붿텧 以?..';

  try {
    let todos = [];
    let sourceLabel = '濡쒖뺄';

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
      alert('?명듃?먯꽌 異붽??????쇱쓣 李얠? 紐삵뻽?듬땲??');
      return;
    }

    const addedCount = addExtractedTodos(todos, note.id);
    if (addedCount === 0) {
      alert('?덈줈 異붽????꾨낫媛 ?놁뒿?덈떎. ?대? ?낅Т 紐⑸줉?대굹 ?몃컯?ㅼ뿉 ?덈뒗 ??ぉ? ?쒖쇅?덉뒿?덈떎.');
      return;
    }

    alert(`${sourceLabel}濡??????꾨낫 ${addedCount}媛쒕? 異붽??덉뒿?덈떎. ?낅Т ?쒖븞?먯꽌 ?곸슜?????덉뒿?덈떎.`);
    rerender();
  } catch (err) {
    if (err.message === 'API_KEY_INVALID') {
      openSettingsDrawer();
      alert('API ?ㅺ? ?좏슚?섏? ?딆뒿?덈떎. ?ㅼ젙?먯꽌 ?뺤씤?댁＜?몄슂.');
      return;
    }

    const fallbackTodos = extractLocalTodosFromNote(note.content);
    const addedCount = addExtractedTodos(fallbackTodos, note.id);
    if (addedCount > 0) {
      alert(`AI 異붿텧???ㅽ뙣?댁꽌 濡쒖뺄 湲곗??쇰줈 ${addedCount}媛쒕? 異붽??덉뒿?덈떎.`);
      rerender();
    } else {
      alert(`????異붿텧 ?ㅽ뙣: ${err.message}`);
    }
  } finally {
    extractTodoBtn.disabled = false;
    extractTodoBtn.textContent = previousLabel;
  }
}

async function extractTodosFromCurrentNote() {
  const note = state.notes.find((x) => x.id === state.selectedNoteId);
  if (!note) {
    alert('癒쇱? ?섏씠吏瑜??좏깮?섏꽭??');
    return;
  }

  extractTodoBtn.disabled = true;
  extractTodoBtn.textContent = 'AI 遺꾩꽍 以?..';

  try {
    const behaviorSummary = buildBehaviorSummary();
    const todos = await extractTodosWithAI(note.content, state.todos, behaviorSummary, note.createdAt);

    if (!todos.length) {
      alert('?명듃?먯꽌 異붿텧?????쇱씠 ?놁뒿?덈떎.');
      return;
    }

    const addedCount = addExtractedTodos(todos, note.id);

    if (addedCount === 0) {
      alert('異붿텧???덈줈???꾨낫媛 ?놁뒿?덈떎. (?대? ?낅Т 紐⑸줉 ?먮뒗 ?몃컯?ㅼ뿉 ?덉쓬)');
    } else {
      alert(`?????쒖븞???꾨낫 ${addedCount}媛쒕? 異붽??덉뒿?덈떎. ?ㅼ?以???뿉???곸슜?댁＜?몄슂.`);
      rerender();
    }
  } catch (err) {
    if (err.message === 'API_KEY_MISSING') {
      openSettingsDrawer();
      alert('Gemini API ?ㅻ? 癒쇱? ?ㅼ젙?댁＜?몄슂. (?ㅼ젙 > AI ?ㅼ젙)');
    } else if (err.message === 'API_KEY_INVALID') {
      openSettingsDrawer();
      alert('API ?ㅺ? ?좏슚?섏? ?딆뒿?덈떎. ?ㅼ젙?먯꽌 ?щ컮瑜??ㅻ? ?낅젰?댁＜?몄슂.');
    } else {
      alert(`?ㅻ쪟: ${err.message}`);
    }
  } finally {
    extractTodoBtn.disabled = false;
    extractTodoBtn.textContent = '?명듃?먯꽌 ????異붿텧';
  }
}

function scheduleAutoSave() {
  const note = state.notes.find((x) => x.id === state.selectedNoteId);
  if (!note) return;

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
  }, 800);
}

// ?? Toolbar ??????????????????????????????????????????
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
    <h2>AI ?붿빟</h2>
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
    .map((line, index) => `<p><strong>諛쒗솕??${speakers[index % speakers.length]}:</strong> ${escapeText(line)}</p>`)
    .join('');
}

function appendTranscript(transcript, { replace = false } = {}) {
  if (!activeRecordingNoteId) {
    alert('癒쇱? ?섏씠吏瑜??좏깮?섏꽭??');
    return;
  }
  const previous = replace ? '' : getRecordingDraft(activeRecordingNoteId);
  setRecordingDraft(
    activeRecordingNoteId,
    [previous, transcript.trim()].filter(Boolean).join('\n'),
  );
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
    alert('癒쇱? ?섏씠吏瑜??좏깮?섏꽭??');
    return;
  }

  const recordingText = getRecordingDraft(note.id);
  if (!recordingText) {
    alert('?붿빟???뱀쓬 ?댁슜???놁뒿?덈떎. 癒쇱? ?뱀쓬 踰꾪듉?쇰줈 ?뚯꽦???띿뒪?몃줈 ??ν빐二쇱꽭??');
    return;
  }

  noteRecordBtn.disabled = true;
  noteRecordBtn.textContent = summarize ? '?붿빟 以?..' : '異붽? 以?..';

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
      alert('Gemini API ?ㅻ? 癒쇱? ?ㅼ젙?댁＜?몄슂. (?ㅼ젙 > AI ?ㅼ젙)');
      return;
    }
    if (err.message === 'API_KEY_INVALID') {
      openSettingsDrawer();
      alert('API ?ㅺ? ?좏슚?섏? ?딆뒿?덈떎. ?ㅼ젙?먯꽌 ?뺤씤?댁＜?몄슂.');
      return;
    }
    if (err.message === 'API_OVERLOADED') {
      alert('Gemini ?쒕쾭媛 ?꾩옱 ?쇱옟?⑸땲?? ?좎떆 ???ㅼ떆 AI ?붿빟???뚮윭二쇱꽭??');
      return;
    }
    alert(`AI ?붿빟 ?ㅽ뙣: ${err.message}`);
  } finally {
    noteRecordBtn.disabled = false;
    noteRecordBtn.textContent = '?뱀쓬';
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

  // Ignore color-btn ??handled separately
  if (btn.id === 'color-btn') return;

  e.preventDefault(); // keep focus in editor
  restoreEditorSelection();

  // ????異붽? 踰꾪듉
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

// ?? Text Color Picker ????????????????????????????????
const colorBtn = document.getElementById('color-btn');
const colorPalette = document.getElementById('color-palette');
const colorBtnBar = document.getElementById('color-btn-bar');

colorBtn.addEventListener('mousedown', (e) => {
  e.preventDefault(); // keep focus in editor
  restoreEditorSelection();
  colorPalette.classList.toggle('open');
});

// ?? Tab Color Popup (body-level) ?????????????????????
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

// ?? Image Paste / Drop ???????????????????????????????
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

// ?? Image Resize ??????????????????????????????????????
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

// ?? Search ???????????????????????????????????????????
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
    alert('?뱀쓬???댁슜???놁뒿?덈떎.');
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

// ?? Event listeners ??????????????????????????????????
const speechRecorder = createSpeechRecorder({
  onTranscript: appendTranscript,
  onStopComplete: confirmStoppedRecording,
  onMeter: (meter) => recordingPanel.updateMeter(meter),
  onStateChange: (isRecording) => {
    if (!noteRecordBtn) return;
    noteRecordBtn.textContent = isRecording ? '?뺤?' : '?뱀쓬';
    noteRecordBtn.classList.toggle('recording', isRecording);
    noteRecordBtn.setAttribute('aria-pressed', String(isRecording));
    recordingPanel.setRecording(isRecording);
  },
  onProcessingChange: (isProcessing) => {
    if (!noteRecordBtn) return;
    noteRecordBtn.disabled = isProcessing;
    if (isProcessing) {
      noteRecordBtn.textContent = '?뺣━ 以?..';
      recordingPanel.setBusy('?뱀쓬 ?띿뒪??蹂??以?);
    } else if (!speechRecorder.isRecording()) {
      noteRecordBtn.textContent = '?뱀쓬';
    }
  },
  onError: (err) => {
    if (err.message === 'AUDIO_RECORDING_UNSUPPORTED') {
      alert('??釉뚮씪?곗???留덉씠???뱀쓬??吏?먰븯吏 ?딆뒿?덈떎. Chrome ?먮뒗 Edge?먯꽌 ?ъ슜?댁＜?몄슂.');
      return;
    }
    if (err.message === 'SPEECH_RECOGNITION_UNSUPPORTED') {
      alert('??釉뚮씪?곗????ㅼ떆媛??뚯꽦 ?몄떇??吏?먰븯吏 ?딆뒿?덈떎. Chrome ?먮뒗 Edge?먯꽌 ?ъ슜?댁＜?몄슂.');
      return;
    }
    if (err.message === 'no-speech') {
      return;
    }
    if (err.message === 'aborted') {
      return;
    }
    if (err.message === 'API_KEY_MISSING') {
      return;
    }
    if (err.message === 'API_KEY_INVALID') {
      openSettingsDrawer();
      alert('Gemini API ?ㅺ? ?좏슚?섏? ?딆븘 ?꾩껜 ?뱀쓬???띿뒪?몃줈 蹂?섑븯吏 紐삵뻽?듬땲??');
      return;
    }
    if (err.message === 'API_OVERLOADED') {
      return;
    }
    if (err.message === 'TRANSCRIPT_EMPTY') {
      return;
    }
    alert(`?뱀쓬 ?ㅻ쪟: ${err.message}`);
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
    alert('??釉뚮씪?곗???留덉씠???뱀쓬??吏?먰븯吏 ?딆뒿?덈떎. Chrome ?먮뒗 Edge?먯꽌 ?ъ슜?댁＜?몄슂.');
    return;
  }
  if (speechRecorder.isRecording()) {
    speechRecorder.stop();
  } else {
    if (!state.selectedNoteId) {
      alert('癒쇱? ?섏씠吏瑜??좏깮?섏꽭??');
      return;
    }
    activeRecordingNoteId = state.selectedNoteId;
    setRecordingDraft(activeRecordingNoteId, '');
    recordingPanel.setBusy('留덉씠??以鍮?以?);
    speechRecorder.start();
  }
});
recordingPanel.onStop(() => speechRecorder.stop());
topbarTrashBtn?.addEventListener('click', () => {
  if (state.appMode !== 'notes') {
    applyAppMode('notes');
  }
  setNoteListMode(state.noteListMode === 'trash' ? 'notes' : 'trash');
});

// ?? Settings Drawer ??????????????????????????????????
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
    geminiKeyStatus.textContent = '????λ맖';
    geminiKeyStatus.dataset.state = 'saved';
  } else {
    geminiKeyStatus.textContent = '誘몄꽕??;
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
    geminiKeyStatus.textContent = '?ㅻ? ?낅젰?댁＜?몄슂';
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
  scheduleAIPrefStatus.textContent = '????λ맖';
  scheduleAIPrefStatus.dataset.state = 'saved';
});

summaryPromptSave.addEventListener('click', () => {
  summaryPromptInput.value = saveSummaryPrompt(summaryPromptInput.value);
  summaryPromptStatus.textContent = '??λ맖';
  summaryPromptStatus.dataset.state = 'saved';
});

summaryPromptReset.addEventListener('click', () => {
  summaryPromptInput.value = resetSummaryPrompt();
  summaryPromptStatus.textContent = '湲곕낯媛??곸슜??;
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

// ?? Cloud Sync Status ????????????????????????????????
const SYNC_LABELS = {
  syncing: '???숆린??以?..',
  synced: '???숆린?붾맖',
  error: '???ㅻ쪟',
};

function buildSyncErrorMessage(error) {
  if (!error) return '';
  const lines = [error.summary];
  if (error.code) lines.push(`肄붾뱶: ${error.code}`);
  if (error.rawMessage) lines.push(`?먮낯: ${error.rawMessage}`);
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

// ?? Auth ?????????????????????????????????????????????
let currentAuthUser = null;
let authLanding = null;
let pendingLandingMigration = false;

function describeMigrationResult(result) {
  if (!result) return '湲곗〈 ?곗씠???뺤씤???앸궗?댁슂.';
  if (result.status === 'uploaded') return '湲곗〈 濡쒖뺄 ?곗씠?곕? 媛?낇븳 怨꾩젙?쇰줈 ?덉쟾?섍쾶 ??꼈?댁슂.';
  if (result.status === 'merged') return '湲곗〈 濡쒖뺄 ?곗씠?곗? 怨꾩젙 ?곗씠?곕? ?덉쟾?섍쾶 ?⑹낀?댁슂.';
  if (result.status === 'already-migrated') return '?대? ??怨꾩젙?쇰줈 湲곗〈 ?곗씠???곕룞???꾨즺?섏뼱 ?덉뼱??';
  if (result.status === 'no-local') return '?곕룞??湲곗〈 濡쒖뺄 ?곗씠?곌? ?놁뼱??';
  return '湲곗〈 ?곗씠???뺤씤???앸궗?댁슂.';
}

async function signInWithGoogleFlow() {
  try {
    await signIn();
  } catch (err) {
    const code = err?.code || '';

    if (code === 'auth/popup-blocked' || code === 'auth/cancelled-popup-request') {
      await signInRedirect();
      return;
    }

    if (code === 'auth/unauthorized-domain') {
      throw new Error(
        'Firebase ?몄쬆 ?꾨찓???ㅼ젙???꾩슂?⑸땲?? Firebase Console > Authentication > Settings > Authorized domains??sangkyoung92-cmyk.github.io 瑜?異붽??댁＜?몄슂.',
      );
    }

    if (code !== 'auth/popup-closed-by-user') {
      throw new Error(`濡쒓렇???ㅽ뙣: ${err.message || code || '?????녿뒗 ?ㅻ쪟'}`);
    }
  }
}

async function migrateForCurrentUser(mode = 'auto') {
  if (!currentAuthUser) throw new Error('癒쇱? 濡쒓렇?명빐二쇱꽭??');
  const result = await migrateLocalData(currentAuthUser.uid, { mode });
  rerender();
  return describeMigrationResult(result);
}


async function handleSignOut() {
  authLanding?.show();
  authLanding?.setStatus('濡쒓렇?꾩썐?섎뒗 以묒씠?먯슂...');
  try {
    await signOutUser();
    currentAuthUser = null;
    renderAuthArea(null);
    authLanding?.setStatus('濡쒓렇?꾩썐?먯뼱?? ?ㅼ떆 濡쒓렇?명븯硫?湲곗〈 ?곗씠?곕? ?뺤씤?좉쾶??');
  } catch (error) {
    authLanding?.setStatus(error.message || '濡쒓렇?꾩썐???ㅽ뙣?덉뼱??', true);
  }
}

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
      <button id="logout-btn" class="logout-btn">濡쒓렇?꾩썐</button>
    `;
    document.getElementById('logout-btn').addEventListener('click', handleSignOut);
  } else {
    authAreaEl.innerHTML = `<button id="login-btn" class="login-btn">濡쒓렇??/button>`;
    document.getElementById('login-btn').addEventListener('click', () => authLanding?.show());
    clearSyncStatusDisplay();
  }
}

load();
authLanding = initAuthLanding({
  onGoogle: signInWithGoogleFlow,
  onEmailLogin: ({ email, password }) => signInWithEmail(email, password),
  onEmailSignup: ({ email, password }) => signUpWithEmail(email, password),
  onResetPassword: (email) => sendPasswordReset(email),
  onManualMigration: async () => {
    pendingLandingMigration = true;
    if (!currentAuthUser) return '?곕룞??怨꾩젙??癒쇱? 濡쒓렇??媛?낇빐二쇱꽭?? 濡쒓렇??吏곹썑 ??釉뚮씪?곗???濡쒖뺄 ?곗씠?곕굹 ?먮룞 諛깆뾽 ?곗씠?곕? 怨꾩젙???낅줈?쒗븷寃뚯슂.';
    pendingLandingMigration = false;
    return migrateForCurrentUser('manual');
  },
});
authLanding.show();
onAuthChange(async (user) => {
  currentAuthUser = user;
  renderAuthArea(user);
  if (user) {
    authLanding?.setStatus('怨꾩젙 ?곗씠?곕? 遺덈윭?ㅺ린 ?꾩뿉 湲곗〈 濡쒖뺄 ?곗씠?곕? ?덉쟾?섍쾶 ?뺤씤?섎뒗 以묒씠?먯슂...');
    setCurrentUser(user.uid);
    try {
      const message = await migrateForCurrentUser(pendingLandingMigration ? 'manual' : 'auto');
      pendingLandingMigration = false;
      authLanding?.setStatus(message);
    } catch (error) {
      console.error('Local migration failed:', error);
      authLanding?.setStatus(error.message || '湲곗〈 ?곗씠???곕룞???ㅽ뙣?덉뼱?? 怨꾩젙 ?곗씠?곕? 遺덈윭?듬땲??', true);
    }
    await loadFromCloud(rerender);
    authLanding?.hide();
  } else {
    setCurrentUser(null);
    authLanding?.show();
    clearSyncStatusDisplay();
  }
});

load();
pruneExpiredTrash();
initNotesPanelResize(notesLayoutEl);
initSchedulePanelResize(scheduleWorkspaceEl);
initScheduleNav(rerender);
// ??λ맂 紐⑤뱶濡?珥덇린 UI ?곸슜
applyAppMode(state.appMode || 'notes');
window.setInterval(() => {
  if (pruneExpiredTrash()) rerender();
}, 60 * 60 * 1000);
