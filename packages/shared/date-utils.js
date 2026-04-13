/**
 * Date utilities shared by the web app and the Android companion app.
 */

export function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getWeekDates(weekStart) {
  const start = new Date(weekStart);
  start.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

export function getMonthGrid(year, month) {
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const startSunday = getMonday(firstDay);
  const weeks = [];
  const current = new Date(startSunday);

  while (current <= lastDay || weeks.length < 5) {
    const week = [];
    for (let i = 0; i < 7; i += 1) {
      week.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    weeks.push(week);
    if (current > lastDay && weeks.length >= 5) break;
  }
  return weeks;
}

export function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayKey() {
  return toDateKey(new Date());
}

export function isToday(dateKey) {
  return dateKey === todayKey();
}

export function formatDateKR(date) {
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const day = days[date.getDay()];
  return `${m}/${d} ${day}`;
}

export function toMonthKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function fromDateKey(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isSameMonth(date, year, month) {
  return date.getFullYear() === year && date.getMonth() + 1 === month;
}

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

export function getMonthLabel(year, month) {
  return `${year}년 ${month}월`;
}
