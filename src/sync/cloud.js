import {
  doc,
  getDoc,
  collection,
  getDocs,
  writeBatch,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from '../firebase-config.js';
import { state, save, nowISO, pruneDeletedNotes } from '../state/store.js';

let currentUid = null;
const dirtyNoteIds = new Set();
let hasDirtyState = false;
let syncTimer = null;
let syncStatusCallback = null;

export function setSyncStatusCallback(cb) {
  syncStatusCallback = cb;
}

function describeSyncError(err, phase) {
  const code = err?.code || '';
  const rawMessage = err?.message || String(err || '');
  let summary = phase === 'load'
    ? '클라우드 데이터를 불러오지 못했습니다.'
    : '클라우드에 변경사항을 저장하지 못했습니다.';

  if (code === 'permission-denied') {
    summary = 'Firestore 권한이 없어서 동기화에 실패했습니다.';
  } else if (code === 'unauthenticated') {
    summary = '로그인 세션이 없어서 동기화에 실패했습니다.';
  } else if (code === 'unavailable') {
    summary = '네트워크 또는 Firebase 서버 연결 문제로 동기화에 실패했습니다.';
  } else if (code === 'failed-precondition') {
    summary = 'Firestore 설정이 완료되지 않았거나 필요한 조건이 충족되지 않았습니다.';
  } else if (code === 'not-found') {
    summary = '필요한 Firestore 리소스를 찾지 못했습니다.';
  }

  return {
    phase,
    code,
    rawMessage,
    summary,
  };
}

function updateSyncStatus(status, error = null) {
  syncStatusCallback?.({
    status,
    error: error || null,
  });
}

export function setCurrentUser(uid) {
  currentUid = uid;
}

/** Mark a note as needing to be written to Firestore */
export function markDirty(noteId) {
  if (noteId) dirtyNoteIds.add(noteId);
}

/** Mark the state document (tabs/selection) as needing sync */
export function markStateDirty() {
  hasDirtyState = true;
}

/** Mark all notes dirty (used on first sign-in to push local data) */
function markAllDirty() {
  state.notes.forEach((n) => dirtyNoteIds.add(n.id));
  hasDirtyState = true;
}

/** Schedule a cloud sync after 2s of inactivity */
export function scheduleSync() {
  if (!currentUid) return;
  if (!hasDirtyState && dirtyNoteIds.size === 0 && state.pendingDeleteNoteIds.length === 0) return;
  updateSyncStatus('syncing');
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(syncToCloud, 2000);
}

function getLocalMaxUpdatedAt() {
  const all = [
    ...state.tabs.map((t) => t.updatedAt || ''),
    ...state.pageSections.map((section) => section.updatedAt || ''),
    ...state.notes.map((n) => n.updatedAt || ''),
    ...Object.values(state.dateNotes || {}).map((note) => note?.updatedAt || ''),
  ];
  return all.reduce((max, d) => (d > max ? d : max), '');
}

function mergeByUpdatedAt(localItems, cloudItems) {
  const byId = new Map();

  localItems.forEach((item) => {
    byId.set(item.id, item);
  });

  cloudItems.forEach((item) => {
    const local = byId.get(item.id);
    if (!local) {
      byId.set(item.id, item);
      return;
    }
    const localUpdatedAt = local.updatedAt || '';
    const cloudUpdatedAt = item.updatedAt || '';
    byId.set(item.id, cloudUpdatedAt > localUpdatedAt ? item : local);
  });

  return [...byId.values()];
}

function haveDifferentIdsOrUpdatedAt(a, b) {
  if (a.length !== b.length) return true;
  const aMap = new Map(a.map((x) => [x.id, x.updatedAt || '']));
  for (const item of b) {
    if (!aMap.has(item.id)) return true;
    if (aMap.get(item.id) !== (item.updatedAt || '')) return true;
  }
  return false;
}

/**
 * On sign-in: cloud is the source of truth.
 * @param {Function} rerender - call to re-render the whole UI
 */
export async function loadFromCloud(rerender) {
  if (!currentUid) return;

  try {
    updateSyncStatus('syncing');

    const stateRef = doc(db, 'users', currentUid, 'data', 'state');
    const stateSnap = await getDoc(stateRef);

    if (!stateSnap.exists()) {
      // This account has no cloud state yet: start from empty account workspace.
      state.tabs = [];
      state.pageSections = [];
      state.notes = [];
      state.deletedNotes = [];
      state.todos = [];
      state.selectedTabId = null;
      state.selectedPageSectionId = null;
      state.selectedNoteId = null;
      state.selectedDeletedNoteId = null;
      state.noteListMode = 'notes';
      state.scheduleEntries = [];
      state.dateNotes = {};
      save();
      dirtyNoteIds.clear();
      hasDirtyState = false;
      state.pendingDeleteNoteIds.length = 0;
      rerender?.();
      updateSyncStatus('synced');
      return;
    }

    const cloudData = stateSnap.data();
    const notesSnap = await getDocs(collection(db, 'users', currentUid, 'notes'));
    const cloudNotes = notesSnap.docs.map((d) => d.data());

    state.tabs = cloudData.tabs || [];
    state.pageSections = cloudData.pageSections || [];
    state.todos = cloudData.todos || [];
    state.deletedNotes = cloudData.deletedNotes || [];
    state.selectedTabId = cloudData.selectedTabId || state.tabs[0]?.id || null;
    state.selectedPageSectionId = cloudData.selectedPageSectionId || null;
    state.selectedNoteId = cloudData.selectedNoteId || null;
    state.selectedDeletedNoteId = null;
    state.noteListMode = 'notes';
    state.notes = cloudNotes;
    state.scheduleEntries = cloudData.scheduleEntries || [];
    state.dateNotes = cloudData.dateNotes || {};
    state.pageSectionCollapsed = cloudData.pageSectionCollapsed || {};
    if (cloudData.appMode) state.appMode = cloudData.appMode;
    if (cloudData.scheduleView) state.scheduleView = cloudData.scheduleView;
    if (cloudData.scheduleWeekStart) state.scheduleWeekStart = cloudData.scheduleWeekStart;
    if (cloudData.scheduleMonth) state.scheduleMonth = cloudData.scheduleMonth;
    const prunedExpiredTrash = pruneDeletedNotes();

    // Persist to localStorage and clear pending local sync queue
    save();
    dirtyNoteIds.clear();
    hasDirtyState = prunedExpiredTrash;
    state.pendingDeleteNoteIds.length = 0;

    rerender?.();

    if (prunedExpiredTrash) {
      scheduleSync();
    } else {
      updateSyncStatus('synced');
    }
  } catch (err) {
    console.error('Failed to load from cloud:', err);
    updateSyncStatus('error', describeSyncError(err, 'load'));
  }
}

/** Write all dirty notes and state doc to Firestore */
export async function syncToCloud() {
  if (!currentUid) return;
  const prunedExpiredTrash = pruneDeletedNotes();
  if (prunedExpiredTrash) {
    hasDirtyState = true;
  }
  if (!hasDirtyState && dirtyNoteIds.size === 0 && state.pendingDeleteNoteIds.length === 0) return;

  try {
    const batch = writeBatch(db);

    // Always write the state document when syncing
    const stateRef = doc(db, 'users', currentUid, 'data', 'state');
    batch.set(stateRef, {
      tabs: state.tabs,
      pageSections: state.pageSections,
      deletedNotes: state.deletedNotes,
      todos: state.todos,
      selectedTabId: state.selectedTabId,
      selectedPageSectionId: state.selectedPageSectionId,
      selectedNoteId: state.selectedNoteId,
      scheduleEntries: state.scheduleEntries,
      dateNotes: state.dateNotes || {},
      appMode: state.appMode,
      scheduleView: state.scheduleView,
      scheduleWeekStart: state.scheduleWeekStart,
      scheduleMonth: state.scheduleMonth,
      pageSectionCollapsed: state.pageSectionCollapsed || {},
      updatedAt: getLocalMaxUpdatedAt() || nowISO(),
    });

    // Write dirty note documents
    for (const noteId of dirtyNoteIds) {
      const note = state.notes.find((n) => n.id === noteId);
      if (note) {
        batch.set(doc(db, 'users', currentUid, 'notes', noteId), note);
      }
    }

    // Delete removed note documents
    for (const noteId of state.pendingDeleteNoteIds) {
      batch.delete(doc(db, 'users', currentUid, 'notes', noteId));
    }

    await batch.commit();

    dirtyNoteIds.clear();
    hasDirtyState = false;
    state.pendingDeleteNoteIds.length = 0;

    updateSyncStatus('synced');
  } catch (err) {
    console.error('Sync to cloud failed:', err);
    updateSyncStatus('error', describeSyncError(err, 'sync'));
  }
}
