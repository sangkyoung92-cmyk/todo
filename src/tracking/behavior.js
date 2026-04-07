import { state, uid, nowISO, save } from '../state/store.js';
import { markStateDirty, scheduleSync } from '../sync/cloud.js';

const MAX_LOG_ENTRIES = 200;

/**
 * 사용자 행동을 기록한다.
 * @param {'delete'|'difficulty_change'|'deadline_change'|'name_edit'|'complete'} action
 * @param {string} todoId
 * @param {*} before - 변경 전 값
 * @param {*} after  - 변경 후 값
 */
export function logBehavior(action, todoId, before, after) {
  const todo = state.todos.find((t) => t.id === todoId);
  state.behaviorLog.push({
    id: uid(),
    todoId,
    action,
    before,
    after,
    timestamp: nowISO(),
    todoText: todo?.text || '',
    todoDifficulty: todo?.difficulty || null,
  });
  trimLogs();
  save();
  markStateDirty();
  scheduleSync();
}

/**
 * 로그 수를 MAX_LOG_ENTRIES 이하로 유지한다.
 */
export function trimLogs() {
  if (state.behaviorLog.length > MAX_LOG_ENTRIES) {
    state.behaviorLog = state.behaviorLog.slice(-MAX_LOG_ENTRIES);
  }
}

/**
 * AI 프롬프트에 넣을 사용자 행동 요약 문자열을 반환한다.
 * 로그가 없으면 빈 문자열.
 */
export function buildBehaviorSummary() {
  const logs = state.behaviorLog;
  if (!logs.length) return '';

  const diffChanges = logs.filter((l) => l.action === 'difficulty_change');
  const deadlineChanges = logs.filter((l) => l.action === 'deadline_change');
  const deletes = logs.filter((l) => l.action === 'delete');
  const completes = logs.filter((l) => l.action === 'complete');
  const nameEdits = logs.filter((l) => l.action === 'name_edit');

  const lines = [];

  // 난이도 변경 패턴
  if (diffChanges.length > 0) {
    const downgrade = diffChanges.filter(
      (l) => diffRank(l.before) > diffRank(l.after),
    ).length;
    const upgrade = diffChanges.filter(
      (l) => diffRank(l.before) < diffRank(l.after),
    ).length;
    if (downgrade > upgrade) {
      lines.push(`- 난이도를 하향 조정하는 경향 (하향 ${downgrade}회, 상향 ${upgrade}회)`);
    } else if (upgrade > downgrade) {
      lines.push(`- 난이도를 상향 조정하는 경향 (상향 ${upgrade}회, 하향 ${downgrade}회)`);
    }
  }

  // 기한 변경 패턴
  if (deadlineChanges.length > 0) {
    let totalDaysDiff = 0;
    let count = 0;
    deadlineChanges.forEach((l) => {
      if (l.before && l.after) {
        const diff = (new Date(l.after) - new Date(l.before)) / (1000 * 60 * 60 * 24);
        totalDaysDiff += diff;
        count++;
      }
    });
    if (count > 0) {
      const avg = Math.round(totalDaysDiff / count);
      if (avg > 0) lines.push(`- 마감일을 평균 ${avg}일 뒤로 미루는 경향`);
      else if (avg < 0) lines.push(`- 마감일을 평균 ${Math.abs(avg)}일 앞당기는 경향`);
    }
  }

  // 삭제 패턴
  if (deletes.length >= 3) {
    lines.push(`- 할 일 삭제 ${deletes.length}회 (AI가 불필요한 항목을 추출했을 수 있음)`);
  }

  // 완료 패턴 — 난이도별 평균 소요일
  if (completes.length >= 2) {
    const byDiff = {};
    completes.forEach((l) => {
      const diff = l.todoDifficulty || '중';
      if (!byDiff[diff]) byDiff[diff] = [];
      // completedAt - createdAt (days)
      const todo = state.todos.find((t) => t.id === l.todoId);
      if (todo?.createdAt && l.timestamp) {
        const days = Math.max(
          1,
          Math.round((new Date(l.timestamp) - new Date(todo.createdAt)) / (1000 * 60 * 60 * 24)),
        );
        byDiff[diff].push(days);
      }
    });
    const parts = [];
    for (const [d, days] of Object.entries(byDiff)) {
      if (days.length > 0) {
        const avg = Math.round(days.reduce((a, b) => a + b, 0) / days.length);
        parts.push(`${d}: 평균 ${avg}일`);
      }
    }
    if (parts.length) lines.push(`- 실제 완료 소요: ${parts.join(', ')}`);
  }

  // 이름 편집 패턴
  if (nameEdits.length >= 3) {
    lines.push(`- 할 일 이름을 자주 수정함 (${nameEdits.length}회) — 더 구체적인 표현 필요`);
  }

  return lines.join('\n');
}

function diffRank(d) {
  return d === '상' ? 3 : d === '중' ? 2 : 1;
}
