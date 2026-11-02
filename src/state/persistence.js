let db, cached = null, extended = false;
let pending = Promise.resolve();
let warned = false;
export async function initializeStorage(key) {
  try {
    db = await new Promise((resolve, reject) => {
      const r = indexedDB.open('todo-overflow', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('snapshots');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    cached = await new Promise((resolve, reject) => {
      const r = db.transaction('snapshots').objectStore('snapshots').get(key);
      r.onsuccess = () => resolve(r.result ?? null);
      r.onerror = () => reject(r.error);
    });
    extended = cached !== null;
  } catch (error) { console.error('Extended storage unavailable', error); }
}
export function readSnapshot(key) {
  return extended ? cached : localStorage.getItem(key);
}
export function writeSnapshot(key, value) {
  if (!extended) {
    try { localStorage.setItem(key, value); return; }
    catch (error) {
      if (error.name !== 'QuotaExceededError') throw error;
      extended = true;
    }
  }
  cached = value;
  pending = pending.catch(() => {}).then(() => new Promise((resolve, reject) => {
    if (!db) return reject(new Error('Extended storage unavailable'));
    const t = db.transaction('snapshots', 'readwrite');
    t.objectStore('snapshots').put(value, key);
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
  pending.catch(error => {
    console.error('Storage failed', error);
    if (!warned) {
      warned = true;
      alert('브라우저 저장에 실패했습니다. 창을 닫기 전에 클라우드 동기화 상태를 확인해주세요.');
    }
  });
}
export function flushStorage() { return pending; }
