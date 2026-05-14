import {
  doc,
  getDoc,
  setDoc,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from './firebase-config.js';
import { mergeScheduleState } from './schedule-state.js';

export async function loadScheduleDocument(uid) {
  const stateRef = doc(db, 'users', uid, 'data', 'state');
  const snap = await getDoc(stateRef);
  const raw = snap.exists() ? snap.data() : {};

  return {
    raw,
    schedule: mergeScheduleState(raw),
  };
}

export async function saveScheduleDocument(uid, scheduleState, baseDoc = {}) {
  const stateRef = doc(db, 'users', uid, 'data', 'state');
  const nextDoc = {
    ...baseDoc,
    todos: scheduleState.todos,
    scheduleEntries: scheduleState.scheduleEntries,
    dateNotes: scheduleState.dateNotes || {},
    scheduleView: scheduleState.scheduleView,
    scheduleWeekStart: scheduleState.scheduleWeekStart,
    scheduleMonth: scheduleState.scheduleMonth,
    updatedAt: new Date().toISOString(),
  };

  await setDoc(stateRef, nextDoc, { merge: true });
  return nextDoc;
}
