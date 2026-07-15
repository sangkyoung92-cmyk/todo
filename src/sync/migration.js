import {
  doc,
  getDoc,
  collection,
  getDocs,
  writeBatch,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from '../firebase-config.js';
import { STORAGE_KEY, state, save, nowISO } from '../state/store.js';

const MIGRATION_META_KEY = 'onenote_migration_meta_v1';
const BACKUP_PREFIX = 'onenote_backup_before_auth_';

export function readLocalSnapshot() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error('Failed to read local snapshot:', error);
    return null;
  }
}

export function hasMeaningfulLocalData(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return false;
  return [
    snapshot.tabs,
    snapshot.pageSections,
    snapshot.notes,
    snapshot.deletedNotes,
    snapshot.todos,
    snapshot.scheduleEntries,
  ].some((items) => Array.isArray(items) && items.length > 0)
    || Object.keys(snapshot.dateNotes || {}).length > 0
    || Object.keys(snapshot.recordingDrafts || {}).length > 0;
}


export function readLatestBackupSnapshot() {
  const backupKeys = Object.keys(localStorage)
    .filter((key) => key.startsWith(BACKUP_PREFIX))
    .sort()
    .reverse();
  for (const key of backupKeys) {
    try {
      const snapshot = JSON.parse(localStorage.getItem(key) || 'null');
      if (hasMeaningfulLocalData(snapshot)) return { key, snapshot };
    } catch (error) {
      console.error('Failed to read local backup snapshot:', error);
    }
  }
  return null;
}

export function getMigrationMeta() {
  try {
    return JSON.parse(localStorage.getItem(MIGRATION_META_KEY) || '{}');
  } catch {
    return {};
  }
}

export function hasMigratedForUid(uid) {
  return getMigrationMeta()?.uid === uid;
}

export function backupLocalSnapshot(snapshot) {
  if (!hasMeaningfulLocalData(snapshot)) return null;
  const key = `${BACKUP_PREFIX}${new Date().toISOString()}`;
  localStorage.setItem(key, JSON.stringify(snapshot));
  return key;
}

export function markMigrationComplete(uid, backupKey = null) {
  localStorage.setItem(MIGRATION_META_KEY, JSON.stringify({ uid, backupKey, migratedAt: nowISO() }));
}

export async function fetchCloudSnapshot(uid) {
  const stateRef = doc(db, 'users', uid, 'data', 'state');
  const stateSnap = await getDoc(stateRef);
  if (!stateSnap.exists()) return null;
  const notesSnap = await getDocs(collection(db, 'users', uid, 'notes'));
  return {
    ...stateSnap.data(),
    notes: notesSnap.docs.map((item) => item.data()),
  };
}

function mergeByUpdatedAt(localItems = [], cloudItems = []) {
  const byId = new Map();
  cloudItems.forEach((item) => item?.id && byId.set(item.id, item));
  localItems.forEach((item) => {
    if (!item?.id) return;
    const cloud = byId.get(item.id);
    if (!cloud || (item.updatedAt || '') >= (cloud.updatedAt || '')) byId.set(item.id, item);
  });
  return [...byId.values()];
}

function mergeDateNotes(localNotes = {}, cloudNotes = {}) {
  const keys = new Set([...Object.keys(cloudNotes || {}), ...Object.keys(localNotes || {})]);
  const merged = {};
  keys.forEach((key) => {
    const local = localNotes?.[key];
    const cloud = cloudNotes?.[key];
    if (!cloud || (local?.updatedAt || '') >= (cloud?.updatedAt || '')) merged[key] = local;
    else merged[key] = cloud;
  });
  return merged;
}

export function mergeSnapshots(localSnapshot, cloudSnapshot = {}) {
  const merged = {
    ...cloudSnapshot,
    tabs: mergeByUpdatedAt(localSnapshot.tabs, cloudSnapshot.tabs),
    pageSections: mergeByUpdatedAt(localSnapshot.pageSections, cloudSnapshot.pageSections),
    notes: mergeByUpdatedAt(localSnapshot.notes, cloudSnapshot.notes),
    deletedNotes: mergeByUpdatedAt(localSnapshot.deletedNotes, cloudSnapshot.deletedNotes),
    todos: mergeByUpdatedAt(localSnapshot.todos, cloudSnapshot.todos),
    scheduleEntries: mergeByUpdatedAt(localSnapshot.scheduleEntries, cloudSnapshot.scheduleEntries),
    dateNotes: mergeDateNotes(localSnapshot.dateNotes, cloudSnapshot.dateNotes),
    recordingDrafts: { ...(cloudSnapshot.recordingDrafts || {}), ...(localSnapshot.recordingDrafts || {}) },
    appMode: localSnapshot.appMode || cloudSnapshot.appMode || 'notes',
    scheduleView: localSnapshot.scheduleView || cloudSnapshot.scheduleView || 'week',
    scheduleWeekStart: localSnapshot.scheduleWeekStart || cloudSnapshot.scheduleWeekStart || null,
    scheduleMonth: localSnapshot.scheduleMonth || cloudSnapshot.scheduleMonth || null,
    notePaperMode: localSnapshot.notePaperMode || cloudSnapshot.notePaperMode || 'ruled',
    todoSectionCollapsed: localSnapshot.todoSectionCollapsed || cloudSnapshot.todoSectionCollapsed || {},
    pageSectionCollapsed: { ...(cloudSnapshot.pageSectionCollapsed || {}), ...(localSnapshot.pageSectionCollapsed || {}) },
    selectedTabId: localSnapshot.selectedTabId || cloudSnapshot.selectedTabId || null,
    selectedPageSectionId: localSnapshot.selectedPageSectionId || cloudSnapshot.selectedPageSectionId || null,
    selectedNoteId: localSnapshot.selectedNoteId || cloudSnapshot.selectedNoteId || null,
    selectedDeletedNoteId: localSnapshot.selectedDeletedNoteId || cloudSnapshot.selectedDeletedNoteId || null,
    noteListMode: 'notes',
  };
  const todoIds = new Set((merged.todos || []).map((todo) => todo.id));
  merged.scheduleEntries = (merged.scheduleEntries || []).filter((entry) => todoIds.has(entry.todoId));
  return merged;
}

export function applySnapshotToState(snapshot = {}) {
  state.tabs = snapshot.tabs || [];
  state.pageSections = snapshot.pageSections || [];
  state.notes = snapshot.notes || [];
  state.deletedNotes = snapshot.deletedNotes || [];
  state.todos = snapshot.todos || [];
  state.recordingDrafts = snapshot.recordingDrafts || {};
  state.selectedTabId = snapshot.selectedTabId || state.tabs[0]?.id || null;
  state.selectedPageSectionId = snapshot.selectedPageSectionId || null;
  state.selectedNoteId = snapshot.selectedNoteId || state.notes[0]?.id || null;
  state.selectedDeletedNoteId = snapshot.selectedDeletedNoteId || null;
  state.noteListMode = 'notes';
  state.scheduleEntries = snapshot.scheduleEntries || [];
  state.dateNotes = snapshot.dateNotes || {};
  state.appMode = snapshot.appMode || 'notes';
  state.scheduleView = snapshot.scheduleView || 'week';
  state.scheduleWeekStart = snapshot.scheduleWeekStart || state.scheduleWeekStart;
  state.scheduleMonth = snapshot.scheduleMonth || state.scheduleMonth;
  state.notePaperMode = snapshot.notePaperMode || 'ruled';
  state.todoSectionCollapsed = snapshot.todoSectionCollapsed || { today: false, week: false, month: false, other: false };
  state.pageSectionCollapsed = snapshot.pageSectionCollapsed || {};
  save();
}

export async function writeSnapshotToCloud(uid, snapshot) {
  const batch = writeBatch(db);
  const stateRef = doc(db, 'users', uid, 'data', 'state');
  batch.set(stateRef, {
    tabs: snapshot.tabs || [],
    pageSections: snapshot.pageSections || [],
    deletedNotes: snapshot.deletedNotes || [],
    todos: snapshot.todos || [],
    selectedTabId: snapshot.selectedTabId || null,
    selectedPageSectionId: snapshot.selectedPageSectionId || null,
    selectedNoteId: snapshot.selectedNoteId || null,
    scheduleEntries: snapshot.scheduleEntries || [],
    dateNotes: snapshot.dateNotes || {},
    appMode: snapshot.appMode || 'notes',
    scheduleView: snapshot.scheduleView || 'week',
    scheduleWeekStart: snapshot.scheduleWeekStart || null,
    scheduleMonth: snapshot.scheduleMonth || null,
    pageSectionCollapsed: snapshot.pageSectionCollapsed || {},
    updatedAt: nowISO(),
  });
  (snapshot.notes || []).forEach((note) => {
    if (note?.id) batch.set(doc(db, 'users', uid, 'notes', note.id), note);
  });
  await batch.commit();
}

export async function migrateLocalData(uid, { mode = 'auto' } = {}) {
  const localSnapshot = readLocalSnapshot();
  const backupCandidate = mode === 'manual' && !hasMeaningfulLocalData(localSnapshot)
    ? readLatestBackupSnapshot()
    : null;
  const sourceSnapshot = hasMeaningfulLocalData(localSnapshot) ? localSnapshot : backupCandidate?.snapshot;
  if (!hasMeaningfulLocalData(sourceSnapshot)) return { status: 'no-local' };
  if (mode === 'auto' && hasMigratedForUid(uid)) return { status: 'already-migrated' };

  const backupKey = backupCandidate?.key || backupLocalSnapshot(sourceSnapshot);
  const cloudSnapshot = await fetchCloudSnapshot(uid);
  const nextSnapshot = cloudSnapshot ? mergeSnapshots(sourceSnapshot, cloudSnapshot) : sourceSnapshot;
  await writeSnapshotToCloud(uid, nextSnapshot);
  applySnapshotToState(nextSnapshot);
  markMigrationComplete(uid, backupKey);
  return { status: cloudSnapshot ? 'merged' : 'uploaded', backupKey };
}
