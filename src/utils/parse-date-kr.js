const DAY_MAP = { '일': 0, '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6 };

function formatKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getNextDayOfWeek(dayIndex, today) {
  const d = new Date(today);
  let diff = dayIndex - d.getDay();
  if (diff <= 0) diff += 7;
  d.setDate(d.getDate() + diff);
  return d;
}

function getThisWeekDayOfWeek(dayIndex, today) {
  const d = new Date(today);
  d.setDate(d.getDate() + (dayIndex - d.getDay()));
  return d;
}

function getNextWeekDayOfWeek(dayIndex, today) {
  const d = new Date(today);
  d.setDate(d.getDate() + (dayIndex - d.getDay()) + 7);
  return d;
}

function resolveMonthDay(month, day, today) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const year = today.getFullYear();
  const candidate = new Date(year, month - 1, day);
  if (candidate.getMonth() !== month - 1) return null; // 2/30 같은 잘못된 날짜
  if (candidate < today) return new Date(year + 1, month - 1, day);
  return candidate;
}

function addDays(today, n) {
  const d = new Date(today);
  d.setDate(d.getDate() + n);
  return d;
}

// ── 날짜 해석기 (resolve 함수) ───────────────────────
const RESOLVERS = {
  nextWeekDay: (day, today) => getNextWeekDayOfWeek(DAY_MAP[day], today),
  thisWeekDay: (day, today) => getThisWeekDayOfWeek(DAY_MAP[day], today),
  monthDay:    (m, d, today) => resolveMonthDay(m, d, today),
  weekDay:     (day, today) => getNextDayOfWeek(DAY_MAP[day], today),
  relative:    (offset, today) => addDays(today, offset),
};

// ── 날짜 패턴 (우선순위 순) ──────────────────────────
// 각 패턴은 { regex, resolve(match, today) → Date|null }
// regex에 "까지"는 옵셔널로 통합
const DATE_PATTERNS = [
  // 다음주 X요일(까지)
  { regex: /다음\s*주\s*([월화수목금토일])요일(까지)?/, resolve: (m, t) => RESOLVERS.nextWeekDay(m[1], t) },
  // 이번주 X요일(까지)
  { regex: /이번\s*주\s*([월화수목금토일])요일(까지)?/, resolve: (m, t) => RESOLVERS.thisWeekDay(m[1], t) },
  // M월 D일(까지)
  { regex: /(\d{1,2})월\s*(\d{1,2})일(까지)?/, resolve: (m, t) => RESOLVERS.monthDay(+m[1], +m[2], t) },
  // M/D(까지) 또는 M-D(까지)
  { regex: /(\d{1,2})[\/\-](\d{1,2})(까지)?/, resolve: (m, t) => RESOLVERS.monthDay(+m[1], +m[2], t) },
  // X요일(까지)
  { regex: /([월화수목금토일])요일(까지)?/, resolve: (m, t) => RESOLVERS.weekDay(m[1], t) },
  // 내일(까지)
  { regex: /내일(까지)?/, resolve: (_, t) => RESOLVERS.relative(1, t) },
  // 모레(까지)
  { regex: /모레(까지)?/, resolve: (_, t) => RESOLVERS.relative(2, t) },
  // 오늘(까지)
  { regex: /오늘(까지)?/, resolve: (_, t) => RESOLVERS.relative(0, t) },
];

// ── 래퍼 패턴 (화살표, 괄호 등 컨텍스트 표현) ───────
// 래퍼는 날짜 패턴을 감싸는 외부 구조. 매치되면 래퍼 전체가 텍스트에서 제거됨.
// WRAPPER_FULL_REGEX: 전체 매치용 (래퍼 + 날짜 합쳐서 매치)
function buildWrappedPatterns() {
  const results = [];
  const ARROW = /(?:→|->)\s*/;
  const PAREN_OPEN = /\(\s*/;
  const PAREN_CLOSE = /\s*\)/;

  for (const dp of DATE_PATTERNS) {
    // 1. 화살표 + 날짜(까지): "→ 4/10까지", "-> 금요일"
    results.push({
      regex: combineRegex(ARROW, dp.regex),
      resolve: dp.resolve,
    });
    // 2. 괄호 안 날짜: "(4/3)", "(금요일까지)"
    results.push({
      regex: combineRegex(PAREN_OPEN, dp.regex, PAREN_CLOSE),
      resolve: dp.resolve,
    });
  }
  return results;
}

function combineRegex(...regexes) {
  return new RegExp(regexes.map((r) => r.source).join(''));
}

// 최종 패턴 배열: 래퍼 패턴(더 구체적) → 일반 패턴
const ALL_PATTERNS = [...buildWrappedPatterns(), ...DATE_PATTERNS];

/**
 * 숫자 날짜 패턴의 false positive 여부를 검사한다.
 * - 앞에 알파벳이 바로 붙은 경우(v4/3 등) 제외
 */
function isFalsePositive(text, matchIndex) {
  if (matchIndex > 0) {
    const prev = text[matchIndex - 1];
    if (/[a-zA-Z]/.test(prev)) return true;
  }
  return false;
}

/**
 * 텍스트에서 한국어 날짜 패턴을 추출한다.
 * @param {string} text - 입력 텍스트
 * @param {Date} [today] - 기준일 (기본: 오늘)
 * @returns {{ deadline: string|null, cleanedText: string }}
 */
export function extractDeadlineFromText(text, today = new Date()) {
  const baseDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  for (const { regex, resolve } of ALL_PATTERNS) {
    const match = text.match(regex);
    if (!match) continue;
    if (isFalsePositive(text, match.index)) continue;

    const resolved = resolve(match, baseDate);
    if (!resolved) continue; // 잘못된 날짜 (2/30 등)

    const deadline = formatKey(resolved);
    const cleanedText = text.replace(match[0], '').replace(/\s+/g, ' ').trim();
    return { deadline, cleanedText: cleanedText || text };
  }

  return { deadline: null, cleanedText: text };
}
