const SCHEDULE_AI_PREFS_KEY = 'schedule_ai_preferences_v1';

const DEFAULT_PREFS = {
  useBehaviorSummary: true,
  useDeadlineDistribution: true,
  useExistingTodoTexts: true,
};

export function getScheduleAIPreferences() {
  const raw = localStorage.getItem(SCHEDULE_AI_PREFS_KEY);
  if (!raw) return { ...DEFAULT_PREFS };

  try {
    const parsed = JSON.parse(raw);
    return {
      useBehaviorSummary: parsed.useBehaviorSummary !== false,
      useDeadlineDistribution: parsed.useDeadlineDistribution !== false,
      useExistingTodoTexts: parsed.useExistingTodoTexts !== false,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function saveScheduleAIPreferences(nextPrefs) {
  const prefs = {
    ...DEFAULT_PREFS,
    ...(nextPrefs || {}),
  };
  localStorage.setItem(SCHEDULE_AI_PREFS_KEY, JSON.stringify(prefs));
  return prefs;
}
