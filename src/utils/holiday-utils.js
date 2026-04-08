/**
 * 공휴일 유틸리티 (대한민국 기준)
 * - 고정 공휴일 + 음력 공휴일(연도별 사전 매핑)
 */

const FIXED_HOLIDAYS = [
  { month: 1, day: 1, name: '신정' },
  { month: 3, day: 1, name: '삼일절' },
  { month: 5, day: 5, name: '어린이날' },
  { month: 6, day: 6, name: '현충일' },
  { month: 8, day: 15, name: '광복절' },
  { month: 10, day: 3, name: '개천절' },
  { month: 10, day: 9, name: '한글날' },
  { month: 12, day: 25, name: '성탄절' },
];

// 음력/대체 공휴일은 해마다 달라 사전값으로 관리
// key: YYYY-MM-DD, value: 공휴일명
const KOREA_HOLIDAYS = {
  // 2025
  '2025-01-28': '설날 연휴',
  '2025-01-29': '설날',
  '2025-01-30': '설날 연휴',
  '2025-03-03': '삼일절 대체공휴일',
  '2025-05-06': '어린이날·부처님오신날 대체공휴일',
  '2025-06-03': '대통령 선거일',
  '2025-10-05': '추석 연휴',
  '2025-10-06': '추석',
  '2025-10-07': '추석 연휴',
  '2025-10-08': '추석 대체공휴일',

  // 2026
  '2026-02-16': '설날 연휴',
  '2026-02-17': '설날',
  '2026-02-18': '설날 연휴',
  '2026-03-02': '삼일절 대체공휴일',
  '2026-05-25': '부처님오신날',
  '2026-08-17': '광복절 대체공휴일',
  '2026-09-24': '추석 연휴',
  '2026-09-25': '추석',
  '2026-09-26': '추석 연휴',

  // 2027
  '2027-02-06': '설날 연휴',
  '2027-02-07': '설날',
  '2027-02-08': '설날 연휴',
  '2027-03-01': '삼일절',
  '2027-05-13': '부처님오신날',
  '2027-09-14': '추석 연휴',
  '2027-09-15': '추석',
  '2027-09-16': '추석 연휴',
  '2027-10-04': '개천절 대체공휴일',
  '2027-12-27': '성탄절 대체공휴일',

  // 2028
  '2028-01-26': '설날 연휴',
  '2028-01-27': '설날',
  '2028-01-28': '설날 연휴',
  '2028-05-02': '부처님오신날',
  '2028-10-02': '추석 연휴',
  '2028-10-03': '개천절',
  '2028-10-04': '추석',
  '2028-10-05': '추석 연휴',
  '2028-10-06': '추석 대체공휴일',

  // 2029
  '2029-02-12': '설날 연휴',
  '2029-02-13': '설날',
  '2029-02-14': '설날 연휴',
  '2029-05-21': '부처님오신날',
  '2029-09-21': '추석 연휴',
  '2029-09-22': '추석',
  '2029-09-23': '추석 연휴',

  // 2030
  '2030-02-02': '설날 연휴',
  '2030-02-03': '설날',
  '2030-02-04': '설날 연휴',
  '2030-05-10': '부처님오신날',
  '2030-09-11': '추석 연휴',
  '2030-09-12': '추석',
  '2030-09-13': '추석 연휴',
};

function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getHolidayName(date) {
  const key = typeof date === 'string' ? date : toDateKey(date);
  if (KOREA_HOLIDAYS[key]) return KOREA_HOLIDAYS[key];

  const target = typeof date === 'string'
    ? new Date(`${date}T00:00:00`)
    : date;

  const month = target.getMonth() + 1;
  const day = target.getDate();
  const fixed = FIXED_HOLIDAYS.find((h) => h.month === month && h.day === day);
  return fixed?.name || null;
}

export function isHoliday(date) {
  return Boolean(getHolidayName(date));
}

export function isWeekend(date) {
  const target = typeof date === 'string'
    ? new Date(`${date}T00:00:00`)
    : date;
  const day = target.getDay();
  return day === 0 || day === 6;
}
