/**
 * 날짜 관련 유틸리티 (스케줄 탭용)
 */

/**
 * 주어진 날짜가 속한 주의 월요일 반환
 * @param {Date|string} date
 * @returns {Date}
 */
export function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=일, 1=월, ..., 6=토
  const diff = (day === 0 ? -6 : 1 - day); // 월요일로 이동
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * 주어진 월요일 기준 7일 날짜 배열 반환
 * @param {Date|string} monday
 * @returns {Date[]}
 */
export function getWeekDates(monday) {
  const start = new Date(monday);
  start.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

/**
 * 주어진 연/월의 달력 그리드 반환 (주 배열 -> 날짜 배열)
 * 항상 월요일 시작, 6주 그리드
 * @param {number} year
 * @param {number} month (1-12)
 * @returns {Date[][]}
 */
export function getMonthGrid(year, month) {
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const startMonday = getMonday(firstDay);
  const weeks = [];
  const current = new Date(startMonday);

  while (current <= lastDay || weeks.length < 5) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      week.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    weeks.push(week);
    if (current > lastDay && weeks.length >= 5) break;
  }
  return weeks;
}

/**
 * Date → 'YYYY-MM-DD' 문자열
 * @param {Date} date
 * @returns {string}
 */
export function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 오늘 날짜 'YYYY-MM-DD' 반환
 * @returns {string}
 */
export function todayKey() {
  return toDateKey(new Date());
}

/**
 * 'YYYY-MM-DD' → 오늘 여부
 * @param {string} dateKey
 * @returns {boolean}
 */
export function isToday(dateKey) {
  return dateKey === todayKey();
}

/**
 * Date → 한국어 날짜 포맷 (예: 4/7 월)
 * @param {Date} date
 * @returns {string}
 */
export function formatDateKR(date) {
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const day = days[date.getDay()];
  return `${m}/${d} ${day}`;
}

/**
 * 'YYYY-MM' 형태로 연/월 반환
 * @param {Date} date
 * @returns {string}
 */
export function toMonthKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * 'YYYY-MM-DD' → Date 객체
 * @param {string} dateKey
 * @returns {Date}
 */
export function fromDateKey(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * 두 날짜가 같은 달인지 확인
 * @param {Date} date
 * @param {number} year
 * @param {number} month (1-12)
 * @returns {boolean}
 */
export function isSameMonth(date, year, month) {
  return date.getFullYear() === year && date.getMonth() + 1 === month;
}

/**
 * 주간 범위 레이블 (예: "2026년 4월 6일 ~ 12일")
 * @param {Date[]} weekDates
 * @returns {string}
 */
export function getWeekRangeLabel(weekDates) {
  const first = weekDates[0];
  const last = weekDates[6];
  const y = first.getFullYear();
  const m1 = first.getMonth() + 1;
  const d1 = first.getDate();
  const m2 = last.getMonth() + 1;
  const d2 = last.getDate();
  if (m1 === m2) {
    return `${y}년 ${m1}월 ${d1}일 ~ ${d2}일`;
  }
  return `${y}년 ${m1}월 ${d1}일 ~ ${m2}월 ${d2}일`;
}

/**
 * 월 레이블 (예: "2026년 4월")
 * @param {number} year
 * @param {number} month
 * @returns {string}
 */
export function getMonthLabel(year, month) {
  return `${year}년 ${month}월`;
}
