import { getApiKey } from './extract.js';
import { getSummaryPrompt } from './summary-settings.js';

export async function summarizeNoteWithAI(noteHtml, noteTitle = '') {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('API_KEY_MISSING');

  const noteText = parseNoteContent(noteHtml);
  if (!noteText.trim()) throw new Error('요약할 노트 내용이 없습니다.');

  let response;
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: buildSummaryPrompt(noteText, noteTitle),
            }],
          }],
          generationConfig: { maxOutputTokens: 1024, temperature: 0.2 },
        }),
      },
    );
  } catch (err) {
    throw new Error(`네트워크 오류: ${err.message}`);
  }

  if (!response.ok) {
    if (response.status === 400 || response.status === 403) {
      throw new Error('API_KEY_INVALID');
    }
    const body = await response.text().catch(() => '');
    throw new Error(`API 오류 ${response.status}: ${body.slice(0, 120)}`);
  }

  const data = await response.json();
  const summary = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
  if (!summary) throw new Error('AI 요약 결과가 비어 있습니다.');
  return summary;
}

function buildSummaryPrompt(noteText, noteTitle) {
  return `${getSummaryPrompt()}

노트 제목:
${noteTitle || '(제목 없음)'}

노트 내용:
${noteText}`;
}

function parseNoteContent(html) {
  const div = document.createElement('div');
  div.innerHTML = html || '';

  div.querySelectorAll('h1').forEach((h) => {
    h.textContent = `\n=== ${h.textContent.trim()} ===\n`;
  });
  div.querySelectorAll('h2').forEach((h) => {
    h.textContent = `\n-- ${h.textContent.trim()} --\n`;
  });

  return div.textContent || '';
}
