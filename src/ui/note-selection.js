const selectedNoteIds = new Set();
let selectionAnchorNoteId = null;
let visibleNoteIds = [];

export function resetVisibleNotes() {
  visibleNoteIds = [];
}

export function registerVisibleNote(noteId) {
  if (noteId) visibleNoteIds.push(noteId);
}

export function clearNoteSelection() {
  selectedNoteIds.clear();
  selectionAnchorNoteId = null;
}

export function selectNote(noteId, options = {}) {
  if (!noteId) return;
  const { toggle = false, range = false } = options;

  if (range && selectionAnchorNoteId) {
    const anchorIndex = visibleNoteIds.indexOf(selectionAnchorNoteId);
    const noteIndex = visibleNoteIds.indexOf(noteId);
    if (anchorIndex >= 0 && noteIndex >= 0) {
      selectedNoteIds.clear();
      const start = Math.min(anchorIndex, noteIndex);
      const end = Math.max(anchorIndex, noteIndex);
      visibleNoteIds.slice(start, end + 1).forEach((id) => selectedNoteIds.add(id));
      return;
    }
  }

  if (toggle) {
    if (selectedNoteIds.has(noteId)) selectedNoteIds.delete(noteId);
    else selectedNoteIds.add(noteId);
    selectionAnchorNoteId = noteId;
    return;
  }

  selectedNoteIds.clear();
  selectedNoteIds.add(noteId);
  selectionAnchorNoteId = noteId;
}

export function isNoteSelected(noteId) {
  return selectedNoteIds.has(noteId);
}

export function getDraggedNoteIds(noteId) {
  if (!selectedNoteIds.has(noteId)) selectNote(noteId);
  return Array.from(selectedNoteIds);
}
