const API_KEY_STORAGE = 'claude_api_key';

export function getApiKey() {
  return localStorage.getItem(API_KEY_STORAGE) || '';
}

function saveApiKey(key) {
  localStorage.setItem(API_KEY_STORAGE, key);
}

export function promptForApiKey() {
  const current = getApiKey();
  const key = prompt(
    'Anthropic Claude API 키를 입력하세요.\n'
    + '(https://console.anthropic.com 에서 발급)\n'
    + '입력한 키는 이 브라우저의 로컬 스토리지에만 저장됩니다.',
    current || '',
  );
  if (key === null) return current; // cancelled
  const trimmed = key.trim();
  saveApiKey(trimmed);
  return trimmed;
}

/**
 * 노트 HTML을 Claude API로 분석해서 섹션별 할 일 목록을 반환한다.
 * @param {string} noteHtml
 * @returns {Promise<Array<{project: string, todos: string[]}>>}
 */
export async function extractTodosWithAI(noteHtml) {
  let apiKey = getApiKey();
  if (!apiKey) {
    apiKey = promptForApiKey();
    if (!apiKey) throw new Error('API 키가 없습니다. 노트에서 할 일 추출 버튼을 다시 눌러 키를 입력해주세요.');
  }

  // HTML → plain text (섹션 구조 보존)
  const content = parseNoteContent(noteHtml);
  if (!content.trim()) throw new Error('노트 내용이 비어 있습니다.');

  let response;
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-allow-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: buildPrompt(content),
          },
        ],
      }),
    });
  } catch (err) {
    throw new Error(`네트워크 오류: ${err.message}`);
  }

  if (!response.ok) {
    if (response.status === 401) {
      saveApiKey(''); // 잘못된 키 초기화
      throw new Error('API 키가 유효하지 않습니다. 다시 눌러서 올바른 키를 입력해주세요.');
    }
    const body = await response.text().catch(() => '');
    throw new Error(`API 오류 ${response.status}: ${body.slice(0, 100)}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text || '';

  return parseAIResponse(text);
}

// ── helpers ──────────────────────────────────────────

function parseNoteContent(html) {
  const div = document.createElement('div');
  div.innerHTML = html || '';

  // 섹션 헤딩을 "### 제목" 형태로 표시해서 AI가 인식하도록
  div.querySelectorAll('h1').forEach((h) => {
    h.textContent = `\n### ${h.textContent.trim()}\n`;
  });
  div.querySelectorAll('h2').forEach((h) => {
    h.textContent = `\n## ${h.textContent.trim()}\n`;
  });

  return div.textContent || '';
}

function buildPrompt(content) {
  return `다음 노트에서 할 일(태스크/액션 아이템)을 추출해서 JSON으로 반환해주세요.

노트에 섹션 제목(### 또는 ##으로 표시됨)이 있으면 그것을 프로젝트 이름으로 사용하고,
제목이 없는 항목은 "기타"로 분류하세요.

노트 내용:
${content}

응답 형식 (JSON 객체만 반환, 다른 설명 없이):
{"sections":[{"project":"프로젝트명","todos":["할 일 1","할 일 2"]}]}

추출 규칙:
- 명확한 할 일/작업/해야 할 일만 추출 (단순 설명이나 메모는 제외)
- 각 할 일은 구체적이고 실행 가능하게 표현
- 프로젝트당 최대 10개, 전체 최대 25개
- 한국어로 작성`;
}

function parseAIResponse(text) {
  // JSON 블록 추출 (마크다운 코드 블록 또는 raw JSON)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('AI 응답에서 JSON을 찾을 수 없습니다.');

  let parsed;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error('AI 응답 파싱 실패. 다시 시도해주세요.');
  }

  const sections = parsed.sections;
  if (!Array.isArray(sections)) throw new Error('AI 응답 형식이 올바르지 않습니다.');

  // 빈 섹션 제거, todos 배열 보장
  return sections
    .map((s) => ({
      project: (s.project || '기타').trim(),
      todos: Array.isArray(s.todos) ? s.todos.map((t) => String(t).trim()).filter(Boolean) : [],
    }))
    .filter((s) => s.todos.length > 0);
}
