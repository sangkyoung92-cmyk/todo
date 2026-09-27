function plainText(html = '') {
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>|<\/div>|<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function exportToObsidian(state) {
  const tabs = new Map(state.tabs.map((tab) => [tab.id, tab.name]));
  const todos = new Map(state.todos.map((todo) => [todo.id, todo]));
  const lines = ['# 정리노트 이전본', '', '## 할 일'];

  state.todos.forEach((todo) => lines.push(`- [${todo.done ? 'x' : ' '}] ${todo.text}${todo.deadline ? ` 📅 ${todo.deadline}` : ''}`));
  lines.push('', '## 일정');
  state.scheduleEntries.forEach((entry) => lines.push(`- ${entry.date} — ${entry.done ? '완료' : '예정'} — ${todos.get(entry.todoId)?.text || '제목 없음'}`));
  lines.push('', '## 메모');
  state.notes.forEach((note) => {
    lines.push('', `### ${tabs.get(note.tabId) || '메모'} · ${note.title || '제목 없음'}`, '', plainText(note.content));
  });

  const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: '정리노트-이전.md' });
  link.click();
  URL.revokeObjectURL(url);
}
