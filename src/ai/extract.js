const API_KEY_STORAGE = 'gemini_api_key';

export function getApiKey() {
  return localStorage.getItem(API_KEY_STORAGE) || '';
}

export function saveApiKey(key) {
  if (key) {
    localStorage.setItem(API_KEY_STORAGE, key);
  } else {
    localStorage.removeItem(API_KEY_STORAGE);
  }
}

/**
 * 노트 HTML을 Gemini 2.5 Flash API로 분석해서 섹션별 할 일 목록을 반환한다.
 * @param {string} noteHtml
 * @returns {Promise<Array<{project: string, todos: string[]}>>}
 */
export async function extractTodosWithAI(noteHtml) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('API_KEY_MISSING');
  }

  const content = parseNoteContent(noteHtml);
  if (!content.trim()) throw new Error('노트 내용이 비어 있습니다.');

  let response;
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildPrompt(content) }] }],
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
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  return parseAIResponse(text);
}

// ── helpers ──────────────────────────────────────────

function parseNoteContent(html) {
  const div = document.createElement('div');
  div.innerHTML = html || '';

  // 섹션 헤딩을 마커로 변환해서 AI가 구분하도록
  div.querySelectorAll('h1').forEach((h) => {
    h.textContent = `\n=== ${h.textContent.trim()} ===\n`;
  });
  div.querySelectorAll('h2').forEach((h) => {
    h.textContent = `\n-- ${h.textContent.trim()} --\n`;
  });

  return div.textContent || '';
}

function buildPrompt(content) {
  return `다음 노트에서 할 일(태스크/액션 아이템)을 추출해서 JSON으로 반환해주세요.

노트에 섹션 제목(=== 제목 === 또는 -- 제목 --으로 표시됨)이 있으면 그것을 프로젝트 이름으로 사용하고,
제목이 없거나 특정 섹션에 속하지 않는 항목은 "기타"로 분류하세요.

노트 내용:
${content}

응답 형식 (JSON 객체만 반환, 코드블록이나 다른 설명 없이):
{"sections":[{"project":"프로젝트명","todos":["할 일 1","할 일 2"]}]}

추출 규칙:
- 명확한 할 일/작업/해야 할 일만 추출 (단순 설명, 메모, 정보는 제외)
- 각 할 일은 구체적이고 실행 가능하게 표현
- 프로젝트당 최대 10개, 전체 최대 25개
- 한국어로 작성`;
}

function parseAIResponse(text) {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('AI 응답에서 JSON을 찾을 수 없습니다. 다시 시도해주세요.');

  let parsed;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error('AI 응답 파싱 실패. 다시 시도해주세요.');
  }

  const sections = parsed.sections;
  if (!Array.isArray(sections)) throw new Error('AI 응답 형식이 올바르지 않습니다.');

  return sections
    .map((s) => ({
      project: (s.project || '기타').trim(),
      todos: Array.isArray(s.todos) ? s.todos.map((t) => String(t).trim()).filter(Boolean) : [],
    }))
    .filter((s) => s.todos.length > 0);
}
