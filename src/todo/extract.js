export function extractTodoCandidatesFromHtml(html) {
  const div = document.createElement('div');
  div.innerHTML = html || '';
  const text = div.textContent || '';

  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line.length >= 4)
    .slice(0, 8);
}

export function getSelectedEditorText(editorEl) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return '';
  const range = sel.getRangeAt(0);
  if (!editorEl.contains(range.commonAncestorContainer)) return '';
  return sel.toString().trim();
}
