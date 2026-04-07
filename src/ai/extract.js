import { buildDeadlineDistribution, validateDeadline } from './deadline.js';

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
 * @param {Array} existingTodos - state.todos (기한 분배용)
 * @param {string} behaviorSummary - 사용자 행동 요약 (AI 학습용)
 * @param {string} noteCreatedAt - 노트 작성일 ISO string
 * @returns {Promise<Array<{project: string, todos: Array<{text: string, difficulty: string, deadline: string}>}>>}
 */
export async function extractTodosWithAI(noteHtml, existingTodos = [], behaviorSummary = '', noteCreatedAt = '') {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('API_KEY_MISSING');
  }

  const content = parseNoteContent(noteHtml);
  if (!content.trim()) throw new Error('노트 내용이 비어 있습니다.');

  const today = new Date();
  const deadlineDist = buildDeadlineDistribution(existingTodos, today);
  const todayStr = formatDateStr(today);
  const noteDate = noteCreatedAt ? noteCreatedAt.slice(0, 10) : todayStr;

  let response;
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildPrompt(content, todayStr, noteDate, deadlineDist, behaviorSummary) }] }],
          generationConfig: { maxOutputTokens: 2048, temperature: 0.2 },
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

  return parseAIResponse(text, existingTodos, today);
}

// ── helpers ──────────────────────────────────────────

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

function buildPrompt(content, today, noteDate, deadlineDist, behaviorSummary) {
  let prompt = `다음 노트에서 사용자가 반드시 수행해야 할 액션 아이템만 추출하세요.

규칙:
- 각 할 일은 10자 이내 한국어로 짧게 요약 (예: "보고서 제출", "회의실 예약", "디자인 검토")
- 단순 정보, 메모, 설명, 참고사항은 제외 — 반드시 실행해야 하는 작업만
- 각 항목에 난이도 지정: "상" (복잡/시간 오래 걸림), "중" (보통), "하" (간단/빠르게 가능)
- 각 항목에 마감일 지정 (YYYY-MM-DD 형식):
  - 노트에 명시된 날짜가 있으면 그것을 사용
  - 없으면 오늘(${today})부터 7일 이내로 배분
  - 아래 기존 할 일 마감일 분포를 참고해 특정 날짜에 몰리지 않게 분산 배치
  - 난이도 "상"은 여유 있는 날짜에, "하"는 바쁜 날에도 배치 가능

노트에 섹션 제목(=== 제목 === 또는 -- 제목 --으로 표시됨)이 있으면 프로젝트 이름으로 사용하고,
제목이 없거나 특정 섹션에 속하지 않는 항목은 "기타"로 분류하세요.

오늘 날짜: ${today}
노트 작성일: ${noteDate}

기존 할 일 마감일 분포:
${deadlineDist || '(없음)'}`;

  if (behaviorSummary) {
    prompt += `

과거 사용자 수정 패턴 (이 정보를 참고하여 난이도와 기한을 더 정확하게 지정하세요):
${behaviorSummary}`;
  }

  prompt += `

노트 내용:
${content}

응답 형식 (JSON 객체만 반환, 코드블록이나 다른 설명 없이):
{"sections":[{"project":"프로젝트명","todos":[{"text":"할일요약","difficulty":"중","deadline":"${today}"}]}]}

추출 규칙:
- 프로젝트당 최대 10개, 전체 최대 25개
- 한국어로 작성
- text는 반드시 10자 이내`;

  return prompt;
}

function parseAIResponse(text, existingTodos, fromDate) {
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

  const validDifficulties = ['상', '중', '하'];

  return sections
    .map((s) => ({
      project: (s.project || '기타').trim(),
      todos: Array.isArray(s.todos)
        ? s.todos
            .map((t) => {
              // 기존 string[] 포맷 호환
              if (typeof t === 'string') {
                return {
                  text: t.trim().slice(0, 10),
                  difficulty: '중',
                  deadline: validateDeadline(null, existingTodos, fromDate),
                };
              }
              const todoText = String(t.text || '').trim().slice(0, 10);
              const difficulty = validDifficulties.includes(t.difficulty) ? t.difficulty : '중';
              const deadline = t.deadline
                ? validateDeadline(t.deadline, existingTodos, fromDate)
                : validateDeadline(null, existingTodos, fromDate);
              return { text: todoText, difficulty, deadline };
            })
            .filter((t) => t.text)
        : [],
    }))
    .filter((s) => s.todos.length > 0);
}

function formatDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
