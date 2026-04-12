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
 * 노트 HTML을 Gemini 2.5 Flash API로 분석해서 할 일 목록을 반환한다.
 * @param {string} noteHtml
 * @param {Array} existingTodos - state.todos (기한 분배용)
 * @param {string} behaviorSummary - 사용자 행동 요약 (AI 학습용)
 * @param {string} noteCreatedAt - 노트 작성일 ISO string
 * @returns {Promise<Array<{text: string, difficulty: string, deadline: string}>>}
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

export async function getPlannerSuggestionsWithAI(snapshot, localSuggestions = [], noteContext = {}) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('API_KEY_MISSING');
  }

  const noteContent = parseNoteContent(noteContext.noteHtml || '');
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
              text: buildPlannerSuggestionPrompt(snapshot, localSuggestions, {
                noteContent,
                noteCreatedAt: noteContext.noteCreatedAt || '',
              }),
            }],
          }],
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
  return parsePlannerSuggestionResponse(text, snapshot, localSuggestions);
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
{"todos":[{"text":"할일요약","difficulty":"중","deadline":"${today}"}]}

추출 규칙:
- 전체 최대 25개
- 한국어로 작성
- text는 반드시 10자 이내`;

  return prompt;
}

function buildPlannerSuggestionPrompt(snapshot, localSuggestions, noteContext) {
  const local = (localSuggestions || [])
    .slice(0, 12)
    .map((item) => `- todoId:${item.todoId || 'new'} / ${item.text} / ${item.date}(${item.deadline || '없음'}) / ${item.difficulty || '중'} / ${item.reason || ''}`)
    .join('\n') || '- 없음';
  const planItems = (snapshot.planItems || [])
    .slice(0, 10)
    .map((item) => `- todoId:${item.todoId} / ${item.text} / 기한 ${item.deadline || '없음'} / ${item.reason} / 난이도 ${item.difficulty || '중'}`)
    .join('\n') || '- 없음';
  const unscheduled = (snapshot.unscheduledTodos || [])
    .slice(0, 10)
    .map((item) => `- todoId:${item.id} / ${item.text} / 기한 ${item.deadline || '없음'} / 난이도 ${item.difficulty || '중'}`)
    .join('\n') || '- 없음';

  return `아래 업무 현황과 로컬 알고리즘 제안을 참고해서 할 일 제안을 만드세요.

규칙:
- 로컬 제안이 타당하면 유지하거나 더 나은 사유로 같은 제안을 반환
- 현재 노트에서 실행해야 할 새 업무가 있으면 type "task"로 추가
- 기존 업무를 옮기거나 배정해야 하면 type "schedule"로 반환
- schedule 항목은 제공된 todoId 중 하나만 사용할 것
- 적용일자는 기한보다 늦으면 안 됨
- 사유는 한국어 한 문장, 35자 안팎으로 짧게
- 최대 10개

오늘: ${snapshot.today}
노트 작성일: ${noteContext.noteCreatedAt ? noteContext.noteCreatedAt.slice(0, 10) : snapshot.today}

로컬 알고리즘 제안:
${local}

오늘/이번 주 확인 업무:
${planItems}

미배정 업무:
${unscheduled}

현재 노트:
${noteContext.noteContent || '(내용 없음)'}

응답 형식(JSON 객체만 반환):
{"suggestions":[{"type":"schedule","todoId":"기존todoId","date":"YYYY-MM-DD","difficulty":"중","deadline":"YYYY-MM-DD 또는 null","reason":"짧은 사유"},{"type":"task","text":"새업무","date":"YYYY-MM-DD","difficulty":"중","deadline":"YYYY-MM-DD 또는 null","reason":"짧은 사유"}]}`;
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

  const todos = parsed.todos;
  if (!Array.isArray(todos)) throw new Error('AI 응답 형식이 올바르지 않습니다.');

  const validDifficulties = ['상', '중', '하'];

  return todos
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
    .filter((t) => t.text);
}

function parsePlannerSuggestionResponse(text, snapshot, localSuggestions = []) {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('AI 응답에서 JSON을 찾을 수 없습니다. 다시 시도해주세요.');

  let parsed;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error('AI 응답 파싱 실패. 다시 시도해주세요.');
  }

  const items = parsed.suggestions;
  if (!Array.isArray(items)) throw new Error('AI 응답 형식이 올바르지 않습니다.');

  const validDifficulties = ['상', '중', '하'];
  const todosById = new Map();
  const todosByText = new Map();
  (snapshot.planItems || []).forEach((todo) => {
    todosById.set(todo.todoId, todo);
    todosByText.set(todo.text, todo.todoId);
  });
  (snapshot.unscheduledTodos || []).forEach((todo) => {
    todosById.set(todo.id, todo);
    todosByText.set(todo.text, todo.id);
  });
  (localSuggestions || []).forEach((item) => {
    if (!item.todoId) return;
    todosById.set(item.todoId, item);
    todosByText.set(item.text, item.todoId);
  });

  return items
    .map((item, index) => {
      const type = item.type === 'task' || item.type === 'new_task' ? 'task' : 'schedule';
      const difficulty = validDifficulties.includes(item.difficulty) ? item.difficulty : '중';
      const deadline = normalizeDate(item.deadline);
      let date = normalizeDate(item.date) || deadline;
      if (deadline && date && date > deadline) date = deadline;
      const reason = compactReason(item.reason || 'AI가 업무 흐름을 보고 제안했습니다');

      if (type === 'task') {
        const taskText = String(item.text || '').trim().slice(0, 20);
        if (!taskText || !date) return null;
        return {
          id: `ai-task-${index}-${taskText}`,
          type: 'task',
          source: 'ai',
          text: taskText,
          difficulty,
          deadline,
          date,
          reason,
        };
      }

      const todoId = String(item.todoId || '').trim() || todosByText.get(String(item.text || '').trim());
      const todo = todosById.get(todoId);
      if (!todo || !date) return null;
      return {
        id: `ai-schedule-${todoId}-${date}-${index}`,
        type: 'schedule',
        source: 'ai',
        action: item.action === 'assign' ? 'assign' : 'move',
        todoId,
        text: item.text || todo.text,
        difficulty,
        deadline: deadline || todo.deadline || null,
        date,
        reason,
      };
    })
    .filter(Boolean);
}

function normalizeDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function compactReason(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

function formatDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
