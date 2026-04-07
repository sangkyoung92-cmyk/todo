const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

/**
 * 미완료 todo들의 기한 분포를 문자열로 반환한다 (AI 프롬프트용).
 * @param {Array} todos - state.todos
 * @param {Date} fromDate - 기준일 (보통 오늘)
 * @returns {string} 예: "4/8(화): 3건, 4/9(수): 1건, ..."
 */
export function buildDeadlineDistribution(todos, fromDate) {
  const counts = {};
  for (let i = 0; i < 7; i++) {
    const d = new Date(fromDate);
    d.setDate(d.getDate() + i);
    counts[formatKey(d)] = 0;
  }

  todos
    .filter((t) => !t.done && t.deadline)
    .forEach((t) => {
      const key = t.deadline; // YYYY-MM-DD
      if (key in counts) counts[key]++;
    });

  return Object.entries(counts)
    .map(([dateStr, count]) => {
      const d = new Date(dateStr + 'T00:00:00');
      const m = d.getMonth() + 1;
      const day = d.getDate();
      const dow = DAY_NAMES[d.getDay()];
      return `${m}/${day}(${dow}): ${count}건`;
    })
    .join(', ');
}

/**
 * deadline이 유효 범위(fromDate ~ fromDate+7일) 밖이면 가장 여유로운 날짜로 보정.
 * @param {string} deadline - YYYY-MM-DD
 * @param {Array} todos - state.todos
 * @param {Date} fromDate - 기준일
 * @returns {string} YYYY-MM-DD
 */
export function validateDeadline(deadline, todos, fromDate) {
  const min = formatKey(fromDate);
  const maxDate = new Date(fromDate);
  maxDate.setDate(maxDate.getDate() + 6);
  const max = formatKey(maxDate);

  if (deadline >= min && deadline <= max) return deadline;

  return getLeastLoadedDate(todos, fromDate);
}

/**
 * 7일 범위에서 할일이 가장 적은 날짜를 반환.
 */
export function getLeastLoadedDate(todos, fromDate) {
  let bestDate = formatKey(fromDate);
  let bestCount = Infinity;

  for (let i = 0; i < 7; i++) {
    const d = new Date(fromDate);
    d.setDate(d.getDate() + i);
    const key = formatKey(d);
    const count = todos.filter((t) => !t.done && t.deadline === key).length;
    if (count < bestCount) {
      bestCount = count;
      bestDate = key;
    }
  }

  return bestDate;
}

function formatKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
