import {
  doc,
  setDoc,
  getDoc,
  collection,
  getDocs,
  writeBatch,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from '../firebase-config.js';
import { state, save, nowISO } from '../state/store.js';

let currentUid = null;
const dirtyNoteIds = new Set();
let hasDirtyState = false;
let syncTimer = null;
let syncStatusCallback = null;

export function setSyncStatusCallback(cb) {
  syncStatusCallback = cb;
}

function updateSyncStatus(status) {
  syncStatusCallback?.(status);
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
    ...state.notes.map((n) => n.updatedAt || ''),
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
      state.notes = [];
      state.todos = [];
      state.selectedTabId = null;
      state.selectedNoteId = null;
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
    state.todos = cloudData.todos || [];
    state.selectedTabId = cloudData.selectedTabId || state.tabs[0]?.id || null;
    state.selectedNoteId = cloudData.selectedNoteId || null;
    state.notes = cloudNotes;

    // Persist to localStorage and clear pending local sync queue
    save();
    dirtyNoteIds.clear();
    hasDirtyState = false;
    state.pendingDeleteNoteIds.length = 0;

    rerender?.();

    updateSyncStatus('synced');
  } catch (err) {
    console.error('Failed to load from cloud:', err);
    updateSyncStatus('error');
  }
}

/** Write all dirty notes and state doc to Firestore */
export async function syncToCloud() {
  if (!currentUid) return;
  if (!hasDirtyState && dirtyNoteIds.size === 0 && state.pendingDeleteNoteIds.length === 0) return;

  try {
    const batch = writeBatch(db);

    // Always write the state document when syncing
    const stateRef = doc(db, 'users', currentUid, 'data', 'state');
    batch.set(stateRef, {
      tabs: state.tabs,
      todos: state.todos,
      selectedTabId: state.selectedTabId,
      selectedNoteId: state.selectedNoteId,
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
    updateSyncStatus('error');
  }
}
