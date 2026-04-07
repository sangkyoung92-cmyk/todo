const DAY_MAP = { '일': 0, '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6 };
const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

function formatKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getNextDayOfWeek(dayIndex, today) {
  const d = new Date(today);
  const current = d.getDay();
  let diff = dayIndex - current;
  if (diff <= 0) diff += 7;
  d.setDate(d.getDate() + diff);
  return d;
}

function getThisWeekDayOfWeek(dayIndex, today) {
  const d = new Date(today);
  const current = d.getDay();
  const diff = dayIndex - current;
  d.setDate(d.getDate() + diff);
  return d;
}

function getNextWeekDayOfWeek(dayIndex, today) {
  const d = new Date(today);
  const current = d.getDay();
  const diff = dayIndex - current + 7;
  d.setDate(d.getDate() + diff);
  return d;
}

function resolveMonthDay(month, day, today) {
  const year = today.getFullYear();
  const candidate = new Date(year, month - 1, day);
  if (candidate < today) {
    return new Date(year + 1, month - 1, day);
  }
  return candidate;
}

// 패턴 목록 (우선순위 순 - 더 구체적인 패턴이 앞에)
const PATTERNS = [
  // 다음주 X요일(까지)
  {
    regex: /다음\s*주\s*([월화수목금토일])요일(까지)?/,
    resolve: (m, today) => getNextWeekDayOfWeek(DAY_MAP[m[1]], today),
  },
  // 이번주 X요일(까지)
  {
    regex: /이번\s*주\s*([월화수목금토일])요일(까지)?/,
    resolve: (m, today) => getThisWeekDayOfWeek(DAY_MAP[m[1]], today),
  },
  // M월 D일까지
  {
    regex: /(\d{1,2})월\s*(\d{1,2})일까지/,
    resolve: (m, today) => resolveMonthDay(parseInt(m[1]), parseInt(m[2]), today),
  },
  // M월 D일
  {
    regex: /(\d{1,2})월\s*(\d{1,2})일/,
    resolve: (m, today) => resolveMonthDay(parseInt(m[1]), parseInt(m[2]), today),
  },
  // M/D까지
  {
    regex: /(\d{1,2})\/(\d{1,2})까지/,
    resolve: (m, today) => resolveMonthDay(parseInt(m[1]), parseInt(m[2]), today),
  },
  // M/D (단어 경계)
  {
    regex: /(\d{1,2})\/(\d{1,2})(?=\s|$|[,.])/,
    resolve: (m, today) => resolveMonthDay(parseInt(m[1]), parseInt(m[2]), today),
  },
  // X요일까지
  {
    regex: /([월화수목금토일])요일까지/,
    resolve: (m, today) => getNextDayOfWeek(DAY_MAP[m[1]], today),
  },
  // X요일
  {
    regex: /([월화수목금토일])요일/,
    resolve: (m, today) => getNextDayOfWeek(DAY_MAP[m[1]], today),
  },
  // 내일까지
  {
    regex: /내일까지/,
    resolve: (_, today) => { const d = new Date(today); d.setDate(d.getDate() + 1); return d; },
  },
  // 내일
  {
    regex: /내일/,
    resolve: (_, today) => { const d = new Date(today); d.setDate(d.getDate() + 1); return d; },
  },
  // 모레까지
  {
    regex: /모레까지/,
    resolve: (_, today) => { const d = new Date(today); d.setDate(d.getDate() + 2); return d; },
  },
  // 모레
  {
    regex: /모레/,
    resolve: (_, today) => { const d = new Date(today); d.setDate(d.getDate() + 2); return d; },
  },
  // 오늘까지
  {
    regex: /오늘까지/,
    resolve: (_, today) => new Date(today),
  },
  // 오늘
  {
    regex: /오늘/,
    resolve: (_, today) => new Date(today),
  },
];

/**
 * 텍스트에서 한국어 날짜 패턴을 추출한다.
 * @param {string} text - 입력 텍스트
 * @param {Date} [today] - 기준일 (기본: 오늘)
 * @returns {{ deadline: string|null, cleanedText: string }}
 */
export function extractDeadlineFromText(text, today = new Date()) {
  const baseDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  for (const { regex, resolve } of PATTERNS) {
    const match = text.match(regex);
    if (match) {
      const resolved = resolve(match, baseDate);
      const deadline = formatKey(resolved);
      const cleanedText = text.replace(match[0], '').replace(/\s+/g, ' ').trim();
      return { deadline, cleanedText: cleanedText || text };
    }
  }

  return { deadline: null, cleanedText: text };
}
